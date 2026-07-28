import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import EditorPanel from "@/components/workspace/EditorPanel";
import EditorToolbar from "@/components/workspace/EditorToolbar";
import GlossarySidebar from "@/components/glossary/GlossarySidebar";
import GlossaryTermForm from "@/components/glossary/GlossaryTermForm";
import BatchReplaceDialog from "@/components/workspace/BatchReplaceDialog";
import PronounSwitcherDialog from "@/components/workspace/PronounSwitcherDialog";
import ChapterManagerDialog from "@/components/workspace/ChapterManagerDialog";
import ImportChaptersDialog from "@/components/workspace/ImportChaptersDialog";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import { exportAsTxt, exportAsDoc, exportGlossaryJson } from "@/lib/exportUtils";
import { callLLM, hasCustomAI, getProvider, chunkText, estimateCostUsd } from "@/lib/llm";
import ClearEditDialog from "@/components/workspace/ClearEditDialog";
import ContextualPronounDialog from "@/components/glossary/ContextualPronounDialog";
import { buildPronounMatrixPrompt } from "@/lib/pronounMatrix";
import { translateHanViet, supportsSelfTranslate } from "@/lib/hanviet";
import { applyReplacements } from "@/lib/textReplace";
import { fetchAllPages } from "@/lib/paginate";
import { Loader2, ArrowLeft, Plus, LogOut, List as ListIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const COLUMN_DEFS = {
  raw: { emoji: "📖", shortLabel: "Gốc" },
  qt: { emoji: "✏️", shortLabel: "QT" },
  edited: { emoji: "✨", shortLabel: "Edit" },
};

const COLUMN_INDEX = { raw: 0, qt: 1, edited: 2 };

// Bound on how many chapters/glossary terms get pulled into memory in one
// session — a safety cap, not a normal ceiling (fetchAllPages already stops
// early once there's nothing left to page through).
const CHAPTER_FETCH_CAP = 5000;
const GLOSSARY_FETCH_CAP = 5000;
// In-memory full-chapter cache cap (avoids unbounded memory growth for very
// long novels browsed chapter-by-chapter in one session).
const CHAPTER_CACHE_LIMIT = 50;
// AI calls get chunked past this many characters so a chapter never blows
// past the provider's output token cap and gets silently truncated.
const AI_CHUNK_CHARS = 3000;

const snapshotOf = (ch) =>
  JSON.stringify({
    raw_original: ch?.raw_original || "",
    qt_raw: ch?.qt_raw || "",
    edited: ch?.edited || "",
  });

const capCache = (cache) => {
  while (cache.size > CHAPTER_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

export default function Workspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  // Lightweight chapter list: {id, title, chapter_order} only — full chapter
  // content (raw_original/qt_raw/edited) is fetched on demand per chapter.
  const [chapterList, setChapterList] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState(["raw", "qt", "edited"]);
  const [mobileActiveCol, setMobileActiveCol] = useState("edited");
  const [saving, setSaving] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [selfTranslating, setSelfTranslating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [panel1Mode, setPanel1Mode] = useState("view");
  const [panel2Mode, setPanel2Mode] = useState("view");

  const [showGlossaryForm, setShowGlossaryForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [prefillTerm, setPrefillTerm] = useState("");
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [showPronoun, setShowPronoun] = useState(false);
  const [showClearEdit, setShowClearEdit] = useState(false);
  const [showContextualPronoun, setShowContextualPronoun] = useState(false);
  const [showChapterManager, setShowChapterManager] = useState(false);
  const [showImportChapters, setShowImportChapters] = useState(false);
  const [geminiEditing, setGeminiEditing] = useState(false);
  const [pronounSelection, setPronounSelection] = useState({
    text: "",
    start: 0,
    end: 0,
  });

  // AI-edit overwrite confirm + session-only undo (not persisted to DB —
  // keeping this out of the database is deliberate: it's disposable UI
  // state, not data worth spending storage quota on).
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [aiUndo, setAiUndo] = useState(null); // { chapterId, previous }
  const pendingAiRunRef = useRef(null);

  const panelRefs = [useRef(null), useRef(null), useRef(null)];
  const isSyncing = useRef(false);

  // Session-only caches — never persisted, just avoid refetching the same
  // chapter twice while the user browses back and forth.
  const chapterCacheRef = useRef(new Map());
  const lastSavedRef = useRef(new Map());

  useEffect(() => {
    loadProjectData();
    // eslint-disable-next-line
  }, [projectId]);

  const loadProjectData = async () => {
    setLoading(true);
    try {
      const proj = await base44.entities.Project.get(projectId);
      setProject(proj);
      const vc = Array.isArray(proj.visible_columns) && proj.visible_columns.length
        ? proj.visible_columns
        : ["raw", "qt", "edited"];
      setVisibleColumns(vc);
      setMobileActiveCol(vc.includes("edited") ? "edited" : vc[0]);

      chapterCacheRef.current.clear();
      lastSavedRef.current.clear();

      // Lightweight pass: only id/title/chapter_order, never the (potentially
      // huge) chapter bodies — this is the main egress fix for large novels.
      const lightChapters = await fetchAllPages(
        (limit, skip) =>
          base44.entities.Chapter.filter(
            { project_id: projectId },
            "chapter_order",
            limit,
            skip,
            ["title", "chapter_order"]
          ),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      setChapterList(lightChapters);
      if (lightChapters.length === CHAPTER_FETCH_CAP) {
        toast({
          title: "Dự án có rất nhiều chương",
          description: `Chỉ hiển thị ${CHAPTER_FETCH_CAP} chương đầu tiên trong phiên này.`,
        });
      }

      if (lightChapters.length > 0) {
        const first = await base44.entities.Chapter.get(lightChapters[0].id);
        chapterCacheRef.current.set(first.id, first);
        lastSavedRef.current.set(first.id, snapshotOf(first));
        setCurrentChapter(first);
      } else {
        setCurrentChapter(null);
      }

      // Glossary must be loaded in full (not just the first page) — it's
      // used both for on-screen highlighting and injected into every AI
      // prompt, so a silently-truncated glossary would break the "AI must
      // follow 100% of glossary terms" guarantee. Paginating internally
      // keeps this correct without adding UI complexity.
      const terms = await fetchAllPages(
        (limit, skip) =>
          base44.entities.GlossaryTerm.filter(
            { project_id: projectId },
            "-created_date",
            limit,
            skip
          ),
        { pageSize: 1000, maxItems: GLOSSARY_FETCH_CAP }
      );
      setGlossaryTerms(terms);
      if (terms.length === GLOSSARY_FETCH_CAP) {
        toast({
          title: "Từ điển rất lớn",
          description: `Chỉ tải ${GLOSSARY_FETCH_CAP} thuật ngữ đầu tiên trong phiên này.`,
        });
      }
    } catch (e) {
      toast({
        title: "Lỗi tải dự án",
        description: e.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  // Save a chapter only if its content actually differs from what was last
  // persisted — skips the network/DB write entirely for a no-op autosave
  // tick (e.g. switching away without editing).
  const flushSave = async (chapter) => {
    if (!chapter?.id) return;
    const snap = snapshotOf(chapter);
    if (lastSavedRef.current.get(chapter.id) === snap) return;
    try {
      await base44.entities.Chapter.update(chapter.id, {
        raw_original: chapter.raw_original || "",
        qt_raw: chapter.qt_raw || "",
        edited: chapter.edited || "",
      });
      lastSavedRef.current.set(chapter.id, snap);
      chapterCacheRef.current.set(chapter.id, chapter);
    } catch (e) {
      console.error(e);
    }
  };

  // Auto-save chapter (debounced, deduped against last-saved snapshot)
  useEffect(() => {
    if (!currentChapter?.id) return;
    const timer = setTimeout(async () => {
      const snap = snapshotOf(currentChapter);
      if (lastSavedRef.current.get(currentChapter.id) === snap) return;
      setSaving(true);
      await flushSave(currentChapter);
      setSaving(false);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [
    currentChapter?.id,
    currentChapter?.raw_original,
    currentChapter?.qt_raw,
    currentChapter?.edited,
  ]);

  const switchChapter = async (chapterId) => {
    if (!chapterId || chapterId === currentChapter?.id) return;
    if (currentChapter) await flushSave(currentChapter);
    let target = chapterCacheRef.current.get(chapterId);
    if (!target) {
      try {
        target = await base44.entities.Chapter.get(chapterId);
        lastSavedRef.current.set(chapterId, snapshotOf(target));
      } catch (e) {
        toast({ title: "Lỗi tải chương", description: e.message, variant: "destructive" });
        return;
      }
    }
    // Delete-then-set bumps this entry to most-recently-used position (Map
    // iteration order follows insertion order, not last-write order).
    chapterCacheRef.current.delete(chapterId);
    chapterCacheRef.current.set(chapterId, target);
    capCache(chapterCacheRef.current);
    setCurrentChapter(target);
  };

  const handleToggleColumn = (col) => {
    if (visibleColumns.includes(col) && visibleColumns.length === 1) {
      toast({
        title: "Phải giữ ít nhất 1 cột hiển thị",
        variant: "destructive",
      });
      return;
    }
    const next = visibleColumns.includes(col)
      ? visibleColumns.filter((c) => c !== col)
      : [...visibleColumns, col];
    setVisibleColumns(next);
    if (!next.includes(mobileActiveCol)) {
      setMobileActiveCol(next.includes("edited") ? "edited" : next[0]);
    }
    handleUpdateProject({ visible_columns: next }).catch(() => {});
  };

  // Sync scroll
  const handlePanelScroll = (scrolledIndex) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const visibleIndices = visibleColumns.map((c) => COLUMN_INDEX[c]);
    const source = panelRefs[scrolledIndex].current;
    if (!source) {
      isSyncing.current = false;
      return;
    }

    const sourceMax = source.getScrollHeight() - source.getClientHeight();
    const ratio = sourceMax > 0 ? source.getScrollTop() / sourceMax : 0;

    visibleIndices.forEach((i) => {
      if (i !== scrolledIndex && panelRefs[i].current) {
        const target = panelRefs[i].current;
        const targetMax =
          target.getScrollHeight() - target.getClientHeight();
        target.setScrollTop(ratio * targetMax);
      }
    });

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  // Term click → insert translation into Col3
  const handleTermClick = (term) => {
    const panel = panelRefs[2].current;
    if (!panel || !currentChapter) return;
    const textarea = panel.getScrollElement();
    if (!textarea) return;

    const start =
      textarea.selectionStart ?? (currentChapter.edited || "").length;
    const end = textarea.selectionEnd ?? (currentChapter.edited || "").length;
    const text = currentChapter.edited || "";
    const insert = term.translation + " ";
    const newText = text.substring(0, start) + insert + text.substring(end);
    setCurrentChapter({ ...currentChapter, edited: newText });

    setTimeout(() => {
      textarea.focus();
      const pos = start + insert.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    }, 0);

    setMobileActiveCol("edited");
    toast({
      title: `Đã chèn: ${term.translation}`,
      description: `Từ "${term.source_term}"`,
    });
  };

  // Quick add to glossary from selection
  const handleQuickAddGlossary = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      toast({
        title: "Hãy bôi đen từ cần thêm! ✏️",
        variant: "destructive",
      });
      return;
    }
    setPrefillTerm(text);
    setEditingTerm(null);
    setShowGlossaryForm(true);
  };

  // Save glossary term
  const handleSaveTerm = async (termData) => {
    try {
      if (editingTerm) {
        await base44.entities.GlossaryTerm.update(editingTerm.id, termData);
        setGlossaryTerms((prev) =>
          prev.map((t) =>
            t.id === editingTerm.id ? { ...t, ...termData } : t
          )
        );
      } else {
        const created = await base44.entities.GlossaryTerm.create({
          ...termData,
          project_id: projectId,
        });
        setGlossaryTerms((prev) => [created, ...prev]);
      }
      setShowGlossaryForm(false);
      setEditingTerm(null);
      setPrefillTerm("");
      toast({ title: editingTerm ? "Đã cập nhật! ✨" : "Đã thêm thuật ngữ! 🌸" });
    } catch (e) {
      toast({
        title: "Lỗi lưu",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTerm = async (termId) => {
    try {
      await base44.entities.GlossaryTerm.delete(termId);
      setGlossaryTerms((prev) => prev.filter((t) => t.id !== termId));
      toast({ title: "Đã xóa thuật ngữ" });
    } catch (e) {
      toast({
        title: "Lỗi xóa",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateProject = async (updates) => {
    try {
      const updated = await base44.entities.Project.update(projectId, updates);
      setProject(updated);
      return updated;
    } catch (e) {
      toast({
        title: "Lỗi cập nhật",
        description: e.message,
        variant: "destructive",
      });
      throw e;
    }
  };

  // Batch replace (word-boundary aware, optional)
  const handleApplyBatchRules = (rules, target, wholeWord) => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const { text, count } = applyReplacements(currentChapter[target] || "", rules, { wholeWord });
    setCurrentChapter({ ...currentChapter, [target]: text });
    toast({
      title: "Đã thay thế hàng loạt! 🔄",
      description: `${count} lần thay thế`,
    });
  };

  // Pronoun switch (word-boundary aware, optional)
  const handleApplyPronounRule = (rule, target, wholeWord) => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const pairRules = (rule.from_words || []).map((from, i) => ({
      find: from,
      replace: (rule.to_words || [])[i] || from,
    }));
    if (target === "edited" && pronounSelection.text) {
      const { text: replaced } = applyReplacements(pronounSelection.text, pairRules, { wholeWord });
      const full = currentChapter.edited || "";
      const newText =
        full.substring(0, pronounSelection.start) +
        replaced +
        full.substring(pronounSelection.end);
      setCurrentChapter({ ...currentChapter, edited: newText });
      setPronounSelection({ text: "", start: 0, end: 0 });
    } else {
      const { text } = applyReplacements(currentChapter[target] || "", pairRules, { wholeWord });
      setCurrentChapter({ ...currentChapter, [target]: text });
    }
    toast({ title: `Đã đổi xưng hô: ${rule.name} 👥` });
  };

  const buildEditPrompt = (sourceText) => {
    const glossaryText = glossaryTerms
      .map((t) => `- "${t.source_term}" → "${t.translation}"`)
      .join("\n");
    const batchRulesText = (project?.batch_rules || [])
      .filter((r) => r.find)
      .map((r) => `- Thay "${r.find}" bằng "${r.replace}"`)
      .join("\n");
    const pronounMatrixText = buildPronounMatrixPrompt(
      project?.contextual_pronoun_rules || []
    );

    return `Bạn là trợ lý biên tập truyện dịch chuyên nghiệp, chuyên edit truyện Convert/QT. Hãy biên tập văn bản QT thô sau đây thành văn phong tiếng Việt mượt mà, tự nhiên, thoát ý, giữ đúng cảm xúc và ý nghĩa gốc.

QUY TẮC BẮT BUỘC:
1. PHẢI tuân thủ 100% các thuật ngữ trong Glossary. Nếu gặp từ gốc trong glossary, bắt buộc dùng bản dịch tương ứng.
2. Áp dụng các quy tắc thay thế nếu có.
3. Sửa câu cưỡng ép, ngữ pháp lủng củng, lặp từ. Diễn đạt lại cho mượt mà nhưng giữ nguyên ý.
4. Giữ nguyên các đoạn hội thoại trong ngoặc kép.
5. KHÔNG thêm giải thích, ghi chú, hay tiêu đề. Chỉ xuất văn bản đã biên tập.
6. ĐẶC BIỆT: Tự động nhận diện NGƯỜI NÓI và NGƯỜI NGHE trong từng câu hội thoại (dựa tên nhân vật, bối cảnh đoạn thoại, sở hữu cách câu nói, ngôi kể). Chọn đúng MA TRẬN XƯNG HÔ phù hợp với cặp người nói ↔ người nghe của đoạn. Nếu câu thoại không quy định đặc biệt cho người nghe cụ thể, dùng quy tắc MẶC ĐỊNH của nhân vật nói. Tuyệt đối không viết sai cách xưng hô của nhân vật.
7. Đây có thể là một đoạn trích trong chương dài hơn — chỉ biên tập đúng phần văn bản được đưa, không thêm mở đầu/kết luận ngoài ý.

GLOSSARY (TUÂN THỦ 100%):
${glossaryText || "(trống)"}

QUY TẮC THAY THẾ:
${batchRulesText || "(không có)"}

MA TRẬN XƯNG HÔ THEO NGỮ CẢNH (AI tự nhận diện người nói ↔ người nghe, áp dụng chính xác đại từ):
${pronounMatrixText || "(không có quy tắc cụ thể — dùng ngữ cảm tự nhiên theo văn bản gốc)"}

VĂN BẢN CẦN BIÊN TẬP:
${sourceText}

Hãy biên tập lại toàn bộ văn bản trên thành bản tiếng Việt hoàn chỉnh:`;
  };

  // Runs one call per chunk (sequentially, to stay within provider rate
  // limits) and stitches the results back together. Chapters usually fit in
  // a single chunk; this only kicks in for unusually long ones.
  const runChunkedEdit = async (sourceText, callFn, onProgress) => {
    const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
    if (chunks.length <= 1) {
      return await callFn(buildEditPrompt(sourceText));
    }
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i + 1, chunks.length);
      // eslint-disable-next-line no-await-in-loop
      results.push(await callFn(buildEditPrompt(chunks[i])));
    }
    return results.join("\n\n");
  };

  // AI auto-edit (Base44 managed AI)
  const doAutoEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    const sourceText = currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({ title: "Không có văn bản để edit!", variant: "destructive" });
      return;
    }
    setAiEditing(true);
    try {
      const editedText = await runChunkedEdit(
        sourceText,
        async (prompt) => {
          const result = await base44.integrations.Core.InvokeLLM({ prompt });
          return typeof result === "string"
            ? result
            : result?.output || result?.response || "";
        },
        (i, total) =>
          total > 1 && toast({ title: `🤖 Đang xử lý đoạn ${i}/${total}...` })
      );
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, edited: editedText } : prev
      );
      setAiUndo({ chapterId, previous: prevEdited });
      toast({
        title: "🤖 Đã tự động edit chương!",
        description: "Kiểm tra và chỉnh sửa thêm nhé",
      });
    } catch (e) {
      toast({ title: "Lỗi AI", description: e.message, variant: "destructive" });
    }
    setAiEditing(false);
  };

  // Custom AI edit (Gemini / GPT / Claude, user's own key)
  const doCustomEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    const sourceText = currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({ title: "Không có văn bản để edit!", variant: "destructive" });
      return;
    }
    const provider = getProvider();
    const est = estimateCostUsd(provider, sourceText);
    if (est) {
      toast({
        title: `Ước tính ~${(est.inputTokens + est.outputTokens).toLocaleString("vi")} token`,
        description:
          est.cost > 0.0005
            ? `Chi phí ước tính ~$${est.cost.toFixed(4)} (tham khảo, có thể lệch so với giá thực tế)`
            : "Chi phí không đáng kể / trong hạn mức miễn phí (ước tính)",
      });
    }
    setGeminiEditing(true);
    try {
      const editedText = await runChunkedEdit(
        sourceText,
        (prompt) => callLLM(prompt),
        (i, total) =>
          total > 1 && toast({ title: `Đang xử lý đoạn ${i}/${total}...` })
      );
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, edited: editedText } : prev
      );
      setAiUndo({ chapterId, previous: prevEdited });
      const providerLabel =
        ({ gemini: "Gemini", openai: "GPT", claude: "Claude" }[provider] || "AI");
      toast({
        title: `${providerLabel} đã edit xong! ✨`,
        description: "Kiểm tra và chỉnh thêm nhé",
      });
    } catch (e) {
      toast({ title: "Lỗi AI", description: e.message, variant: "destructive" });
    }
    setGeminiEditing(false);
  };

  // Ask for confirmation before an AI call overwrites existing edited text.
  const runAiEdit = (runner) => {
    if (currentChapter?.edited?.trim()) {
      pendingAiRunRef.current = runner;
      setAiConfirmOpen(true);
    } else {
      runner();
    }
  };
  const handleAutoEdit = () => runAiEdit(doAutoEdit);
  const handleGeminiEdit = () => runAiEdit(doCustomEdit);

  const handleUndoAiEdit = () => {
    if (!aiUndo || !currentChapter || aiUndo.chapterId !== currentChapter.id) return;
    setCurrentChapter((prev) => ({ ...prev, edited: aiUndo.previous }));
    setAiUndo(null);
    toast({ title: "Đã hoàn tác bản edit AI ↩️" });
  };

  // Self-translate (built-in Hán-Việt dictionary engine — free, client-side,
  // zero network/DB cost). Fills Cột 2 (QT thô) from Cột 1 (Văn bản gốc).
  const handleSelfTranslate = () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({ title: "Chưa có Văn bản gốc để dịch!", variant: "destructive" });
      return;
    }
    if (!supportsSelfTranslate(project?.source_language)) {
      toast({
        title: "Tự dịch tự thân hiện chỉ hỗ trợ nguồn tiếng Trung",
        description: "Với ngôn ngữ khác, hãy dùng Auto Edit / AI để dịch trực tiếp.",
        variant: "destructive",
      });
      return;
    }
    const chapterId = currentChapter.id;
    setSelfTranslating(true);
    // Defer one frame so the loading spinner can paint before the
    // (synchronous, client-side) dictionary pass runs.
    setTimeout(() => {
      try {
        const { text, coverage, unknownChars } = translateHanViet(sourceText, glossaryTerms);
        setCurrentChapter((prev) =>
          prev && prev.id === chapterId ? { ...prev, qt_raw: text } : prev
        );
        const pct = Math.round(coverage * 100);
        toast({
          title: `📖 Đã tự dịch! Độ phủ từ điển: ${pct}%`,
          description: unknownChars.length
            ? `${unknownChars.length} ký tự chưa có trong từ điển, giữ nguyên gốc để bạn/AI xử lý tiếp.`
            : "Toàn bộ ký tự đã được dịch.",
        });
      } catch (e) {
        toast({ title: "Lỗi tự dịch", description: e.message, variant: "destructive" });
      }
      setSelfTranslating(false);
    }, 30);
  };

  // Clear Edit (with confirm)
  const handleClearEdit = () => {
    setCurrentChapter({ ...currentChapter, edited: "" });
    setShowClearEdit(false);
    toast({ title: "Đã xóa bản edit 🗑️" });
  };

  // Import glossary terms (bulk create)
  const handleImportTerms = async (terms) => {
    try {
      const withProjectId = terms.map((t) => ({
        ...t,
        project_id: projectId,
      }));
      let created = [];
      for (let i = 0; i < withProjectId.length; i += 500) {
        const batch = withProjectId.slice(i, i + 500);
        // eslint-disable-next-line no-await-in-loop
        const result = await base44.entities.GlossaryTerm.bulkCreate(batch);
        created = created.concat(result);
      }
      setGlossaryTerms((prev) => [...created, ...prev]);
      toast({ title: `Đã nhập ${created.length} thuật ngữ! 📥` });
    } catch (e) {
      toast({
        title: "Lỗi nhập từ điển",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateChapter = async () => {
    try {
      const maxOrder = chapterList.reduce(
        (m, c) => Math.max(m, c.chapter_order ?? 0),
        -1
      );
      const created = await base44.entities.Chapter.create({
        project_id: projectId,
        title: `Chương ${chapterList.length + 1}`,
        chapter_order: maxOrder + 1,
        raw_original: "",
        qt_raw: "",
        edited: "",
      });
      setChapterList((prev) => [
        ...prev,
        { id: created.id, title: created.title, chapter_order: created.chapter_order },
      ]);
      chapterCacheRef.current.set(created.id, created);
      lastSavedRef.current.set(created.id, snapshotOf(created));
      if (currentChapter) await flushSave(currentChapter);
      setCurrentChapter(created);
      toast({ title: "Đã tạo chương mới! 📖" });
    } catch (e) {
      toast({
        title: "Lỗi tạo chương",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleRenameChapter = async (chapterId, newTitle) => {
    try {
      await base44.entities.Chapter.update(chapterId, { title: newTitle });
      setChapterList((prev) =>
        prev.map((c) => (c.id === chapterId ? { ...c, title: newTitle } : c))
      );
      const cached = chapterCacheRef.current.get(chapterId);
      if (cached) chapterCacheRef.current.set(chapterId, { ...cached, title: newTitle });
      if (currentChapter?.id === chapterId) {
        setCurrentChapter((prev) => (prev ? { ...prev, title: newTitle } : prev));
      }
      toast({ title: "Đã đổi tên chương" });
    } catch (e) {
      toast({ title: "Lỗi đổi tên", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    try {
      await base44.entities.Chapter.delete(chapterId);
      const remaining = chapterList.filter((c) => c.id !== chapterId);
      setChapterList(remaining);
      chapterCacheRef.current.delete(chapterId);
      lastSavedRef.current.delete(chapterId);
      if (currentChapter?.id === chapterId) {
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          let target = chapterCacheRef.current.get(nextId);
          if (!target) {
            target = await base44.entities.Chapter.get(nextId);
            chapterCacheRef.current.set(nextId, target);
            lastSavedRef.current.set(nextId, snapshotOf(target));
          }
          setCurrentChapter(target);
        } else {
          setCurrentChapter(null);
        }
      }
      toast({ title: "Đã xóa chương" });
    } catch (e) {
      toast({ title: "Lỗi xóa chương", description: e.message, variant: "destructive" });
    }
  };

  // Sparse reorder: only the moved chapter's order value changes (midpoint
  // between its new neighbours), so reordering costs exactly one write no
  // matter how many chapters the project has.
  const handleReorderChapter = async (fromIndex, toIndex) => {
    const list = [...chapterList];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    const prevOrder = toIndex > 0 ? list[toIndex - 1].chapter_order : null;
    const nextOrder = toIndex < list.length - 1 ? list[toIndex + 1].chapter_order : null;
    let newOrder;
    if (prevOrder == null && nextOrder == null) newOrder = 0;
    else if (prevOrder == null) newOrder = nextOrder - 1;
    else if (nextOrder == null) newOrder = prevOrder + 1;
    else newOrder = (prevOrder + nextOrder) / 2;

    const updatedMoved = { ...moved, chapter_order: newOrder };
    list[toIndex] = updatedMoved;
    setChapterList(list);
    try {
      await base44.entities.Chapter.update(moved.id, { chapter_order: newOrder });
      const cached = chapterCacheRef.current.get(moved.id);
      if (cached) chapterCacheRef.current.set(moved.id, { ...cached, chapter_order: newOrder });
    } catch (e) {
      toast({ title: "Lỗi sắp xếp lại", description: e.message, variant: "destructive" });
      loadProjectData();
    }
  };

  // Bulk-import & auto-split pasted text into multiple new chapters.
  const handleImportChapters = async (parsedChapters, targetColumn) => {
    try {
      const baseOrder =
        chapterList.reduce((m, c) => Math.max(m, c.chapter_order ?? 0), -1) + 1;
      const toCreate = parsedChapters.map((c, i) => ({
        project_id: projectId,
        title: c.title || `Chương ${chapterList.length + i + 1}`,
        chapter_order: baseOrder + i,
        raw_original: targetColumn === "raw_original" ? c.content : "",
        qt_raw: targetColumn === "qt_raw" ? c.content : "",
        edited: targetColumn === "edited" ? c.content : "",
      }));
      let created = [];
      for (let i = 0; i < toCreate.length; i += 200) {
        const batch = toCreate.slice(i, i + 200);
        // eslint-disable-next-line no-await-in-loop
        const result = await base44.entities.Chapter.bulkCreate(batch);
        created = created.concat(result);
      }
      const lightweight = created.map((c) => ({
        id: c.id,
        title: c.title,
        chapter_order: c.chapter_order,
      }));
      setChapterList((prev) =>
        [...prev, ...lightweight].sort((a, b) => a.chapter_order - b.chapter_order)
      );
      created.forEach((c) => {
        chapterCacheRef.current.set(c.id, c);
        lastSavedRef.current.set(c.id, snapshotOf(c));
      });
      toast({ title: `Đã nhập ${created.length} chương! 📥` });
    } catch (e) {
      toast({ title: "Lỗi nhập chương", description: e.message, variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await base44.auth.logout("/login");
  };

  const handleOpenPronoun = () => {
    const panel3 = panelRefs[2].current;
    const textarea = panel3?.getScrollElement();
    if (
      textarea &&
      textarea.selectionStart !== undefined &&
      textarea.selectionStart !== textarea.selectionEnd
    ) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = currentChapter?.edited || "";
      setPronounSelection({
        text: text.substring(start, end),
        start,
        end,
      });
    } else {
      setPronounSelection({ text: "", start: 0, end: 0 });
    }
    setShowPronoun(true);
  };

  const handleExport = (type) => {
    const filename = `${project.title} - ${currentChapter?.title || ""}`;
    if (type === "txt") {
      exportAsTxt(currentChapter?.edited || "", filename);
    } else if (type === "doc") {
      exportAsDoc(currentChapter?.edited || "", filename);
    } else if (type === "json") {
      exportGlossaryJson(glossaryTerms, project, `${project.title} - Glossary`);
    }
    toast({ title: "Đã xuất file! 📄" });
  };

  const activeMobile = visibleColumns.includes(mobileActiveCol)
    ? mobileActiveCol
    : visibleColumns[0] || "edited";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Không tìm thấy dự án</p>
          <Link to="/" className="text-violet-600 hover:underline">
            ← Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-violet-100">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            to="/"
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{project.cover_emoji || "📚"}</span>
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-tight">
                {project.title}
              </h1>
              <p className="text-xs text-slate-400">
                {glossaryTerms.length} thuật ngữ · {chapterList.length} chương
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Chapter selector */}
          <select
            value={currentChapter?.id || ""}
            onChange={(e) => switchChapter(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-xl border border-violet-100 bg-white/70 text-slate-700 focus:outline-none focus:border-violet-400 max-w-[180px]"
          >
            {chapterList.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowChapterManager(true)}
            className="p-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
            title="Quản lý chương"
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreateChapter}
            className="p-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
            title="Tạo chương mới"
          >
            <Plus className="w-4 h-4" />
          </button>

          <span className="text-xs text-slate-400 hidden md:block">
            {saving ? "💾 Đang lưu..." : "✅ Đã lưu"}
          </span>

          <div className="flex items-center gap-1 hidden md:flex">
            <button
              onClick={() => handleExport("txt")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              📄 Txt
            </button>
            <button
              onClick={() => handleExport("doc")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              📝 Doc
            </button>
            <button
              onClick={() => handleExport("json")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              📋 JSON
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <EditorToolbar
        visibleColumns={visibleColumns}
        onToggleColumn={handleToggleColumn}
        onQuickAddGlossary={handleQuickAddGlossary}
        onBatchReplace={() => setShowBatchReplace(true)}
        onPronounSwitcher={handleOpenPronoun}
        onAutoEdit={handleAutoEdit}
        aiEditing={aiEditing}
        onCustomEdit={handleGeminiEdit}
        customAIEditing={geminiEditing}
        hasCustomAI={hasCustomAI()}
        customAIProvider={getProvider()}
        onOpenSettings={() => navigate("/settings")}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        onSelfTranslate={handleSelfTranslate}
        selfTranslating={selfTranslating}
        selfTranslateSupported={supportsSelfTranslate(project?.source_language)}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 relative">
        {showSidebar && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/30 z-30"
              onClick={() => setShowSidebar(false)}
            />
            <GlossarySidebar
              terms={glossaryTerms}
              project={project}
              onAddTerm={() => {
                setEditingTerm(null);
                setPrefillTerm("");
                setShowGlossaryForm(true);
              }}
              onEditTerm={(term) => {
                setEditingTerm(term);
                setPrefillTerm("");
                setShowGlossaryForm(true);
              }}
              onDeleteTerm={handleDeleteTerm}
              onImportTerms={handleImportTerms}
              onOpenContextualPronoun={() => setShowContextualPronoun(true)}
            />
          </>
        )}
        <div className="flex-1 flex flex-col gap-2 p-3 min-w-0 min-h-0">
          {currentChapter ? (
            <>
              {visibleColumns.length > 1 && (
                <div className="md:hidden flex gap-1.5 shrink-0">
                  {visibleColumns.map((col) => {
                    const def = COLUMN_DEFS[col];
                    return (
                      <button
                        key={col}
                        onClick={() => setMobileActiveCol(col)}
                        className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          activeMobile === col
                            ? "bg-violet-600 text-white"
                            : "bg-white/70 text-slate-500 border border-violet-100"
                        }`}
                      >
                        {def.emoji} {def.shortLabel}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-1 gap-2 min-h-0 min-w-0">
                {visibleColumns.includes("raw") && (
                  <div
                    className={
                      activeMobile === "raw"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[0]}
                      title="Văn bản gốc"
                      emoji="📖"
                      value={currentChapter.raw_original}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, raw_original: v })
                      }
                      mode={panel1Mode}
                      onToggleMode={() =>
                        setPanel1Mode(panel1Mode === "view" ? "edit" : "view")
                      }
                      terms={glossaryTerms}
                      onTermClick={handleTermClick}
                      onScroll={() => handlePanelScroll(0)}
                      placeholder="Dán văn bản gốc (Trung/Anh) vào đây..."
                    />
                  </div>
                )}
                {visibleColumns.includes("qt") && (
                  <div
                    className={
                      activeMobile === "qt"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[1]}
                      title="QT thô"
                      emoji="✏️"
                      value={currentChapter.qt_raw}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, qt_raw: v })
                      }
                      mode={panel2Mode}
                      onToggleMode={() =>
                        setPanel2Mode(panel2Mode === "view" ? "edit" : "view")
                      }
                      terms={glossaryTerms}
                      onTermClick={handleTermClick}
                      onScroll={() => handlePanelScroll(1)}
                      placeholder="Dán văn bản QT/Convert thô vào đây, hoặc bấm 'Tự dịch' ở trên..."
                    />
                  </div>
                )}
                {visibleColumns.includes("edited") && (
                  <div
                    className={
                      activeMobile === "edited"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[2]}
                      title="Bản Edit"
                      emoji="✨"
                      value={currentChapter.edited}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, edited: v })
                      }
                      mode="edit"
                      onScroll={() => handlePanelScroll(2)}
                      placeholder="Bản edit hoàn chỉnh sẽ hiện ở đây..."
                      extra={
                        <>
                          {aiUndo && aiUndo.chapterId === currentChapter.id && (
                            <button
                              onClick={handleUndoAiEdit}
                              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-colors border border-violet-100"
                              title="Hoàn tác bản edit AI vừa chạy (chỉ trong phiên này)"
                            >
                              ↩️ Hoàn tác AI
                            </button>
                          )}
                          {currentChapter.edited ? (
                            <button
                              onClick={() => setShowClearEdit(true)}
                              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors border border-violet-100"
                              title="Xóa toàn bộ bản edit"
                            >
                              🗑️ Xóa
                            </button>
                          ) : null}
                        </>
                      }
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={handleCreateChapter}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                ➕ Tạo chương đầu tiên
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <GlossaryTermForm
        open={showGlossaryForm}
        onOpenChange={setShowGlossaryForm}
        project={project}
        onUpdateProject={handleUpdateProject}
        editingTerm={editingTerm}
        prefillTerm={prefillTerm}
        onSave={handleSaveTerm}
      />
      <BatchReplaceDialog
        open={showBatchReplace}
        onOpenChange={setShowBatchReplace}
        project={project}
        onUpdateProject={handleUpdateProject}
        onApply={handleApplyBatchRules}
      />
      <PronounSwitcherDialog
        open={showPronoun}
        onOpenChange={setShowPronoun}
        project={project}
        onUpdateProject={handleUpdateProject}
        onApply={handleApplyPronounRule}
        selectedText={pronounSelection.text}
      />
      <ClearEditDialog
        open={showClearEdit}
        onOpenChange={setShowClearEdit}
        onConfirm={handleClearEdit}
      />
      <ContextualPronounDialog
        open={showContextualPronoun}
        onOpenChange={setShowContextualPronoun}
        project={project}
        onUpdateProject={handleUpdateProject}
      />
      <ChapterManagerDialog
        open={showChapterManager}
        onOpenChange={setShowChapterManager}
        chapters={chapterList}
        currentChapterId={currentChapter?.id}
        onSelect={(id) => {
          switchChapter(id);
          setShowChapterManager(false);
        }}
        onRename={handleRenameChapter}
        onDelete={handleDeleteChapter}
        onReorder={handleReorderChapter}
        onOpenImport={() => setShowImportChapters(true)}
      />
      <ImportChaptersDialog
        open={showImportChapters}
        onOpenChange={setShowImportChapters}
        onImport={handleImportChapters}
      />
      <ConfirmDialog
        open={aiConfirmOpen}
        onOpenChange={setAiConfirmOpen}
        title="Ghi đè bản Edit hiện tại?"
        description="AI sẽ thay thế toàn bộ nội dung cột Bản Edit của chương này. Bạn có thể bấm 'Hoàn tác AI' ngay sau đó nếu không ưng ý, nhưng chỉ trong phiên làm việc này (không lưu lâu dài)."
        confirmLabel="Vẫn chạy AI"
        destructive={false}
        onConfirm={() => {
          setAiConfirmOpen(false);
          pendingAiRunRef.current?.();
        }}
      />
    </div>
  );
}
