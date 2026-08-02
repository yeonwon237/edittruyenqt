import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Project, Chapter, GlossaryTerm, PromptPreset } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import EditorPanel from "@/components/workspace/EditorPanel";
import EditorToolbar from "@/components/workspace/EditorToolbar";
import GlossarySidebar from "@/components/glossary/GlossarySidebar";
import GlossaryTermForm from "@/components/glossary/GlossaryTermForm";
import DetectNamesDialog from "@/components/glossary/DetectNamesDialog";
import TranslationSettingsDialog, { GENRE_OPTIONS } from "@/components/workspace/TranslationSettingsDialog";
import { CATEGORIES } from "@/lib/highlight";
import BatchReplaceDialog from "@/components/workspace/BatchReplaceDialog";
import PronounSwitcherDialog from "@/components/workspace/PronounSwitcherDialog";
import ChapterManagerDialog from "@/components/workspace/ChapterManagerDialog";
import ImportChaptersDialog from "@/components/workspace/ImportChaptersDialog";
import BatchEditDialog from "@/components/workspace/BatchEditDialog";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import {
  exportAsTxt,
  exportAsDoc,
  exportGlossaryJson,
  exportChaptersCsv,
  exportChaptersTxt,
  exportChaptersDocx,
  exportChaptersPdf,
} from "@/lib/exportUtils";
import { callLLM, hasCustomAI, getProvider, chunkText, estimateCostUsd, fileToBase64 } from "@/lib/llm";
import ImageTranslateDialog from "@/components/workspace/ImageTranslateDialog";
import ContextualPronounDialog from "@/components/glossary/ContextualPronounDialog";
import AISettingsDialog from "@/components/workspace/AISettingsDialog";
import { buildPronounMatrixPrompt } from "@/lib/pronounMatrix";
import { diffTextChanges } from "@/lib/textDiff";
import { countForeignChars } from "@/lib/highlight";
import { translateHanViet, supportsSelfTranslate } from "@/lib/hanviet";
import { applyRuleEdit } from "@/lib/ruleEdit";
import { applyReplacements, stripPoliteA } from "@/lib/textReplace";
import { fetchAllPages } from "@/lib/paginate";
import { isDraftMode } from "@/lib/draftMode";
import { Loader2, ArrowLeft, Home, Plus, LogOut, List as ListIcon, Copy, Trash2, Pencil, Check, X as XIcon } from "lucide-react";
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
  const [draftMode] = useState(isDraftMode());
  const [checkingPronouns, setCheckingPronouns] = useState(false);
  const [pronounCheckDiff, setPronounCheckDiff] = useState(null);
  const [selfTranslating, setSelfTranslating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [panel1Mode, setPanel1Mode] = useState("view");
  const [panel2Mode, setPanel2Mode] = useState("view");
  const [panel3Mode, setPanel3Mode] = useState("edit");

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showGlossaryForm, setShowGlossaryForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [prefillTerm, setPrefillTerm] = useState("");
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [showPronoun, setShowPronoun] = useState(false);
  const [clearTarget, setClearTarget] = useState(null); // { field, label } | null
  const [showContextualPronoun, setShowContextualPronoun] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showChapterManager, setShowChapterManager] = useState(false);
  const [showImportChapters, setShowImportChapters] = useState(false);
  const [exportingChapters, setExportingChapters] = useState(false);
  const [exportingEdited, setExportingEdited] = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchFinished, setBatchFinished] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    done: 0,
    total: 0,
    edited: 0,
    skipped: 0,
    failed: 0,
    currentTitle: "",
  });
  const [batchErrors, setBatchErrors] = useState([]);
  const batchStopRef = useRef(false);
  const [showDetectNames, setShowDetectNames] = useState(false);
  const [detectingNames, setDetectingNames] = useState(false);
  const [nameCandidates, setNameCandidates] = useState(null);
  const [showTranslationSettings, setShowTranslationSettings] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [showImageTranslate, setShowImageTranslate] = useState(false);
  const [imageTranslating, setImageTranslating] = useState(false);
  const [imageResult, setImageResult] = useState(null); // { raw, translated } | null
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
      const proj = await Project.get(projectId);
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
          Chapter.filter(
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
        const first = await Chapter.get(lightChapters[0].id);
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
          GlossaryTerm.filter(
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

      // Prompt presets: a small personal library shared across all projects.
      const presetList = await PromptPreset.list("-created_date", 200);
      setPresets(presetList);
      if (proj.active_preset_id) {
        const active = presetList.find((p) => p.id === proj.active_preset_id);
        setActivePreset(active || null);
      } else {
        setActivePreset(null);
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
  // tick (e.g. switching away without editing). In draft mode this is a
  // no-op unless `force` is set (the explicit "Lưu" button) — the whole
  // point of draft mode is "don't write anything unless I ask you to".
  const flushSave = async (chapter, force = false) => {
    if (!chapter?.id) return;
    if (draftMode && !force) return;
    const snap = snapshotOf(chapter);
    if (lastSavedRef.current.get(chapter.id) === snap) return;
    try {
      await Chapter.update(chapter.id, {
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
    if (!currentChapter?.id || draftMode) return;
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
        target = await Chapter.get(chapterId);
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
        await GlossaryTerm.update(editingTerm.id, termData);
        setGlossaryTerms((prev) =>
          prev.map((t) =>
            t.id === editingTerm.id ? { ...t, ...termData } : t
          )
        );
      } else {
        const created = await GlossaryTerm.create({
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
      await GlossaryTerm.delete(termId);
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

  const handleBulkDeleteTerms = async (termIds) => {
    if (!termIds.length) return;
    try {
      await Promise.all(termIds.map((id) => GlossaryTerm.delete(id)));
      const idSet = new Set(termIds);
      setGlossaryTerms((prev) => prev.filter((t) => !idSet.has(t.id)));
      toast({ title: `Đã xóa ${termIds.length} thuật ngữ` });
    } catch (e) {
      toast({
        title: "Lỗi xóa hàng loạt",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateProject = async (updates) => {
    try {
      const updated = await Project.update(projectId, updates);
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

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === project.title) return;
    try {
      await handleUpdateProject({ title: trimmed });
      toast({ title: "Đã đổi tên bộ truyện" });
    } catch {
      // handleUpdateProject already surfaced a toast
    }
  };

  // Which preset this project uses (id only persisted on Project; presets
  // themselves are a shared library across all projects).
  const handleSelectPreset = async (presetId) => {
    try {
      await handleUpdateProject({ active_preset_id: presetId || "" });
      setActivePreset(presetId ? presets.find((p) => p.id === presetId) || null : null);
    } catch {
      // handleUpdateProject already surfaced a toast
    }
  };

  const handleSavePreset = async (data, presetId) => {
    try {
      let saved;
      if (presetId) {
        saved = await PromptPreset.update(presetId, data);
        setPresets((prev) => prev.map((p) => (p.id === presetId ? saved : p)));
      } else {
        saved = await PromptPreset.create(data);
        setPresets((prev) => [saved, ...prev]);
      }
      if (project?.active_preset_id === saved.id) setActivePreset(saved);
      toast({ title: "Đã lưu preset! 🎭" });
      return saved;
    } catch (e) {
      toast({ title: "Lỗi lưu preset", description: e.message, variant: "destructive" });
      return null;
    }
  };

  const handleDeletePreset = async (presetId) => {
    try {
      await PromptPreset.delete(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (project?.active_preset_id === presetId) {
        await handleUpdateProject({ active_preset_id: "" });
        setActivePreset(null);
      }
      toast({ title: "Đã xóa preset" });
    } catch (e) {
      toast({ title: "Lỗi xóa preset", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdateStyleToggles = (toggles) => {
    handleUpdateProject({ style_toggles: toggles }).catch(() => {});
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

    const toggles = project?.style_toggles || {};
    const extraRules = [];
    if (toggles.protect_plot) {
      extraRules.push(
        "9. BẢO VỆ CỐT TRUYỆN: TUYỆT ĐỐI không tự ý thêm, bớt, bịa đặt chi tiết/tình tiết không có trong văn bản gốc."
      );
    }
    if (toggles.declunkify_qt) {
      extraRules.push(
        "10. Chủ động đảo ngữ, diễn đạt thoát ý hoàn toàn các cụm dịch sát nghĩa đen kiểu Convert — không dịch máy móc từng chữ."
      );
    }

    const genreEraLines = [];
    if (activePreset?.genres?.length) genreEraLines.push(`Thể loại: ${activePreset.genres.join(", ")}`);
    if (activePreset?.setting_era?.trim()) genreEraLines.push(`Bối cảnh/thời đại: ${activePreset.setting_era.trim()}`);
    const genreEraText = genreEraLines.join("\n");

    const characterNotesText = (activePreset?.character_notes || [])
      .filter((n) => n.character?.trim() && n.note?.trim())
      .map((n) => `- ${n.character.trim()}: ${n.note.trim()}`)
      .join("\n");

    const presetBlock =
      activePreset?.prompt_instructions || genreEraText || characterNotesText
        ? `\nVĂN PHONG / THỂ LOẠI RIÊNG CHO BỘ TRUYỆN NÀY (${activePreset?.name || ""}):
${genreEraText ? `${genreEraText}\n` : ""}${activePreset?.prompt_instructions || ""}
${
  characterNotesText
    ? `\nGHI CHÚ NHÂN VẬT ĐẶC BIỆT (quy tắc xưng hô/hành xử đổi theo tình huống — BẮT BUỘC áp dụng đúng khi văn cảnh phù hợp, không được bỏ qua):\n${characterNotesText}\n`
    : ""
}`
        : "";

    return `Bạn là trợ lý biên tập truyện dịch chuyên nghiệp, chuyên edit truyện Convert/QT. Hãy biên tập văn bản QT thô sau đây thành văn phong tiếng Việt mượt mà, tự nhiên, thoát ý, giữ đúng cảm xúc và ý nghĩa gốc.

QUY TẮC BẮT BUỘC:
1. PHẢI tuân thủ 100% các thuật ngữ trong Glossary. Nếu gặp từ gốc trong glossary, bắt buộc dùng bản dịch tương ứng.
2. Áp dụng các quy tắc thay thế nếu có.
3. Sửa câu cưỡng ép, ngữ pháp lủng củng, lặp từ. Diễn đạt lại cho mượt mà nhưng giữ nguyên ý.
4. Giữ nguyên các đoạn hội thoại trong ngoặc kép.
5. KHÔNG thêm giải thích, ghi chú, hay tiêu đề. Chỉ xuất văn bản đã biên tập.
6. ĐẶC BIỆT: Tự động nhận diện NGƯỜI NÓI và NGƯỜI NGHE trong từng câu hội thoại (dựa tên nhân vật, bối cảnh đoạn thoại, sở hữu cách câu nói, ngôi kể). Chọn đúng MA TRẬN XƯNG HÔ phù hợp với cặp người nói ↔ người nghe của đoạn. Nếu câu thoại không quy định đặc biệt cho người nghe cụ thể, dùng quy tắc MẶC ĐỊNH của nhân vật nói. Tuyệt đối không viết sai cách xưng hô của nhân vật.
7. Đây có thể là một đoạn trích trong chương dài hơn — chỉ biên tập đúng phần văn bản được đưa, không thêm mở đầu/kết luận ngoài ý.
8. BẮT BUỘC: Giữ nguyên chính xác số lần xuống dòng / số đoạn văn như văn bản đầu vào — mỗi dòng gốc tương ứng với đúng một dòng trong bản dịch, không gộp nhiều dòng thành một, không tách một dòng thành nhiều dòng. Nếu văn bản gốc có DÒNG TRỐNG (dòng rỗng) để ngăn cách giữa các đoạn, PHẢI giữ nguyên dòng trống đó ở đúng vị trí tương ứng trong bản dịch — không được xóa/gộp dòng trống lại, kể cả khi nó không chứa nội dung để dịch.
${extraRules.join("\n")}
${presetBlock}
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

  // Post-processing applied after every AI edit result, in code (not
  // dependent on the AI actually following the prompt): preset forbidden
  // words and the "strip trailing ạ" toggle.
  const applyHardRules = (text) => {
    let result = text;
    const forbidden = (activePreset?.forbidden_words || []).filter((r) => r.find);
    if (forbidden.length) {
      result = applyReplacements(result, forbidden, { wholeWord: true }).text;
    }
    if (project?.style_toggles?.strip_polite_a) {
      result = stripPoliteA(result);
    }
    return result;
  };

  // Rough line-count check — a heads-up, not a hard guarantee (LLMs don't
  // perfectly preserve line counts even when explicitly instructed).
  const checkLineAlignment = (sourceText, resultText) => {
    const srcLines = sourceText.split("\n").length;
    const outLines = resultText.split("\n").length;
    if (srcLines !== outLines) {
      toast({
        title: "⚠️ Số dòng bản Edit không khớp QT thô",
        description: `QT thô có ${srcLines} dòng, bản Edit có ${outLines} dòng — kiểm tra lại cấu trúc đoạn.`,
      });
    }
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

  // Custom AI edit (Gemini / GPT / Claude, user's own key)
  const doCustomEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    // Same free rule pre-pass as Auto Edit — see comment there.
    const sourceText = applyRuleEdit(currentChapter.qt_raw || currentChapter.raw_original || "");
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
      const finalText = applyHardRules(editedText);
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, edited: finalText } : prev
      );
      setAiUndo({ chapterId, previous: prevEdited });
      checkLineAlignment(sourceText, finalText);
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
  const handleGeminiEdit = () => runAiEdit(doCustomEdit);

  const handleUndoAiEdit = () => {
    if (!aiUndo || !currentChapter || aiUndo.chapterId !== currentChapter.id) return;
    setCurrentChapter((prev) => ({ ...prev, edited: aiUndo.previous }));
    setAiUndo(null);
    toast({ title: "Đã hoàn tác bản edit AI ↩️" });
  };

  // A blind find/replace ("Đổi đại từ xưng hô") can't express "chỉ khi X nói
  // với Y" — that needs context. Rather than trying to teach the general
  // edit prompt (buildEditPrompt) to never miss this among everything else
  // it's already juggling, this runs a second, narrow AI pass whose ONLY
  // job is comparing dialogue against the Ma Trận Xưng Hô and fixing
  // mismatches — a model tends to follow one focused instruction far more
  // reliably than the same instruction buried as #6 of 8+ in a long prompt.
  const buildPronounCheckPrompt = (text, matrixText) => `Bạn là biên tập viên kiểm tra tính nhất quán xưng hô trong truyện dịch. Nhiệm vụ DUY NHẤT của bạn: đọc đoạn văn tiếng Việt sau, đối chiếu với BẢNG QUY TẮC XƯNG HÔ bên dưới, và SỬA LẠI những chỗ đại từ xưng hô trong LỜI THOẠI TRỰC TIẾP (trong ngoặc kép) bị dùng sai so với quy tắc — dựa trên việc xác định đúng người đang nói và đang nói VỚI AI trong câu đó.

QUY TẮC BẮT BUỘC:
1. CHỈ sửa đại từ xưng hô (ta/ngươi/nàng/hắn/huynh/muội...) trong lời thoại trực tiếp, khi xác định RÕ RÀNG người nói và người nghe của câu đó khớp với một dòng trong bảng quy tắc.
2. Nếu không chắc chắn ai đang nói với ai trong một câu, GIỮ NGUYÊN — đừng đoán bừa, đừng tự bịa quy tắc không có trong bảng.
3. KHÔNG sửa bất kỳ điều gì khác (từ ngữ, câu chữ, tường thuật, xưng hô ở phần không phải lời thoại trực tiếp).
4. KHÔNG thêm/bớt dòng, không thêm giải thích/ghi chú/tiêu đề — chỉ xuất lại đúng văn bản đã sửa.

BẢNG QUY TẮC XƯNG HÔ:
${matrixText}

VĂN BẢN CẦN KIỂM TRA:
${text}

Xuất lại TOÀN BỘ văn bản trên, đã sửa đúng xưng hô:`;

  const handleCheckPronouns = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const matrixText = buildPronounMatrixPrompt(project?.contextual_pronoun_rules || []);
    if (!matrixText) {
      toast({ title: "Chưa có quy tắc nào trong Ma Trận Xưng Hô!", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.edited || "";
    if (!sourceText.trim()) {
      toast({ title: "Bản Edit đang trống, chưa có gì để kiểm tra!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = sourceText;
    setCheckingPronouns(true);
    setPronounCheckDiff(null);
    try {
      const callFn = (prompt) => callLLM(prompt);
      const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
      let fixedText;
      if (chunks.length <= 1) {
        fixedText = await callFn(buildPronounCheckPrompt(sourceText, matrixText));
      } else {
        const results = [];
        for (let i = 0; i < chunks.length; i++) {
          toast({ title: `Đang kiểm tra đoạn ${i + 1}/${chunks.length}...` });
          // eslint-disable-next-line no-await-in-loop
          results.push(await callFn(buildPronounCheckPrompt(chunks[i], matrixText)));
        }
        fixedText = results.join("\n\n");
      }
      // Diff against the ORIGINAL text (not chunk-by-chunk) so line numbers
      // and context are relative to the whole chapter regardless of how many
      // chunks it took — this is exactly what answers "sửa ở đâu, mấy chỗ".
      const diff = diffTextChanges(prevEdited, fixedText);
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, edited: fixedText } : prev
      );
      setAiUndo({ chapterId, previous: prevEdited });
      setPronounCheckDiff(diff);
      toast({
        title: diff.length ? `Đã sửa ${diff.length} chỗ xưng hô ✅` : "Không tìm thấy chỗ nào cần sửa",
        description: diff.length ? "Xem chi tiết bên dưới. Không đúng ý thì bấm Hoàn tác." : undefined,
      });
    } catch (e) {
      toast({ title: "Lỗi kiểm tra xưng hô", description: e.message, variant: "destructive" });
    }
    setCheckingPronouns(false);
  };

  // Self-translate (built-in Hán-Việt dictionary engine — free, client-side,
  // zero AI/DB cost). Fills Cột 2 (QT thô) from Cột 1 (Văn bản gốc). The
  // dictionary data itself is fetched lazily on first use (dynamic import),
  // so this is async — everything after that is local computation.
  const handleSelfTranslate = async () => {
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
    try {
      const { text, coverage, unknownChars } = await translateHanViet(sourceText, glossaryTerms);
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
  };

  // Rule-based edit (src/lib/ruleEdit.js — zero AI, zero network, patterns
  // derived from the user's own real QT-thô/Bản-Edit chapter pairs). Fills
  // Cột 3 (Bản Edit) from Cột 2 (QT thô), same as Auto Edit/Custom AI but
  // synchronous since there's no API call.
  const handleRuleEdit = () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    const sourceText = currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({ title: "Không có QT thô để edit!", variant: "destructive" });
      return;
    }
    const finalText = applyHardRules(applyRuleEdit(sourceText));
    setCurrentChapter((prev) =>
      prev && prev.id === chapterId ? { ...prev, edited: finalText } : prev
    );
    setAiUndo({ chapterId, previous: prevEdited });
    checkLineAlignment(sourceText, finalText);
    toast({ title: "✨ Đã edit bằng rule (không AI)!", description: "Kiểm tra và chỉnh sửa thêm nhé" });
  };

  const parseImageResult = (raw) => {
    const gocMatch = raw.match(/===GOC===([\s\S]*?)(?:===DICH===|$)/i);
    const dichMatch = raw.match(/===DICH===([\s\S]*)$/i);
    const parsedRaw = (gocMatch?.[1] || "").trim();
    const translated = (dichMatch?.[1] || "").trim();
    // Fallback if the model didn't follow the marker format.
    if (!parsedRaw && !translated) return { raw: "", translated: raw.trim() };
    return { raw: parsedRaw, translated };
  };

  // Dịch từ ảnh: OCR + translate in one custom-AI call.
  const handleSelectImageFile = async (file) => {
    if (!file) return;
    setImageResult(null);
    setImageTranslating(true);
    try {
      const image = await fileToBase64(file);
      const prompt = `Bạn là trợ lý OCR và dịch thuật. Đọc TOÀN BỘ chữ trong ảnh (có thể là tiếng Trung/Anh/Nhật/Hàn hoặc ngôn ngữ khác) và thực hiện:
1. Chép lại chính xác nguyên văn chữ trong ảnh, giữ đúng ngôn ngữ gốc, giữ đúng cấu trúc xuống dòng.
2. Dịch toàn bộ đoạn đó sang tiếng Việt, văn phong tự nhiên, thoát ý.

Trả về ĐÚNG định dạng sau, không thêm giải thích nào khác:
===GOC===
<nguyên văn chép từ ảnh>
===DICH===
<bản dịch tiếng Việt>`;
      const raw = await callLLM(prompt, image);
      setImageResult(parseImageResult(raw));
    } catch (e) {
      toast({ title: "Lỗi dịch ảnh", description: e.message, variant: "destructive" });
    }
    setImageTranslating(false);
  };

  const handleEditImageRaw = (newRaw) => {
    setImageResult((prev) => (prev ? { ...prev, raw: newRaw } : prev));
  };

  const handleApplyImageResult = () => {
    if (!currentChapter || !imageResult) return;
    setCurrentChapter({
      ...currentChapter,
      raw_original: imageResult.raw
        ? [currentChapter.raw_original, imageResult.raw].filter(Boolean).join("\n")
        : currentChapter.raw_original,
      qt_raw: imageResult.translated
        ? [currentChapter.qt_raw, imageResult.translated].filter(Boolean).join("\n")
        : currentChapter.qt_raw,
    });
    setShowImageTranslate(false);
    setImageResult(null);
    toast({ title: "Đã áp dụng kết quả dịch ảnh vào chương! 🖼️" });
  };

  const parseNameCandidates = (raw) => {
    let text = (raw || "").trim();
    text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("AI không trả về danh sách hợp lệ");
    return arr
      .map((it) => ({
        source_term: (it.source_term || "").toString().trim(),
        translation: (it.translation || "").toString().trim(),
        category: CATEGORIES.includes(it.category) ? it.category : "Khác",
      }))
      .filter((it) => it.source_term && it.translation);
  };

  // Detect proper names (people/places/...) via AI so a translator who
  // doesn't read Chinese can still build a correctly-capitalized Glossary.
  const handleDetectNames = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.raw_original || currentChapter.qt_raw || "";
    if (!sourceText.trim()) {
      toast({ title: "Chương chưa có văn bản để phân tích!", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    setShowDetectNames(true);
    setDetectingNames(true);
    setNameCandidates(null);
    try {
      // First ~6000 chars is plenty to catch recurring names without an
      // extra round of chunking just for this lookup.
      const textForDetection = sourceText.slice(0, 6000);
      const prompt = `Bạn là trợ lý phân tích văn bản truyện dịch tiếng Trung. Đọc đoạn văn tiếng Trung dưới đây và liệt kê TẤT CẢ tên riêng xuất hiện (tên nhân vật, địa danh, tông môn/môn phái, chức vị đặc biệt, chiêu thức/công pháp có tên riêng...).

Trả về DUY NHẤT một mảng JSON hợp lệ (không markdown, không giải thích thêm), mỗi phần tử có dạng:
{"source_term": "<chữ Hán gốc, giữ nguyên như trong văn bản>", "translation": "<phiên âm Hán Việt, viết hoa chữ cái đầu mỗi âm tiết đúng chuẩn tên riêng tiếng Việt>", "category": "<một trong: Tên người, Địa danh, Chiêu thức, Vật phẩm, Cấp bậc, Khác>"}

Nếu không tìm thấy tên riêng nào, trả về mảng rỗng [].

ĐOẠN VĂN:
${textForDetection}`;

      const raw = await callLLM(prompt);
      const parsed = parseNameCandidates(raw);
      const existing = new Set(glossaryTerms.map((t) => t.source_term));
      setNameCandidates(parsed.filter((c) => !existing.has(c.source_term)));
    } catch (e) {
      toast({ title: "Lỗi phát hiện tên riêng", description: e.message, variant: "destructive" });
      setShowDetectNames(false);
    }
    setDetectingNames(false);
  };

  const handleAddDetectedNames = async (selected) => {
    if (!selected.length) return;
    try {
      const withProjectId = selected.map((t) => ({
        source_term: t.source_term,
        translation: t.translation,
        category: t.category,
        notes: "",
        custom_fields: {},
        project_id: projectId,
      }));
      const created = await GlossaryTerm.bulkCreate(withProjectId);
      setGlossaryTerms((prev) => [...created, ...prev]);
      setShowDetectNames(false);
      toast({ title: `Đã thêm ${created.length} tên vào Glossary! 🌸` });
    } catch (e) {
      toast({ title: "Lỗi thêm Glossary", description: e.message, variant: "destructive" });
    }
  };

  // AI reads the current chapter and proposes preset fields (genre/era/
  // character notes/style). Returns the suggestion object for the dialog to
  // merge into its own draft form — never writes to the project/preset
  // directly, so nothing is saved until the user reviews and hits Lưu.
  const handleSuggestPreset = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return null;
    }
    const sourceText = (currentChapter.raw_original || currentChapter.qt_raw || "").slice(0, 6000);
    if (!sourceText.trim()) {
      toast({ title: "Chương chưa có văn bản để phân tích!", variant: "destructive" });
      return null;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return null;
    }
    const prompt = `Bạn là biên tập viên truyện dịch giàu kinh nghiệm. Đọc đoạn văn bản sau (có thể là bản dịch thô QT/Convert, chưa mượt) và đề xuất cấu hình "preset văn phong" phù hợp nhất để AI dùng khi biên tập bộ truyện này.

Trả về DUY NHẤT một object JSON hợp lệ (không markdown, không giải thích thêm), đúng dạng:
{"genres": ["<chỉ chọn từ danh sách sau, đúng chính tả>"], "setting_era": "<mô tả ngắn bối cảnh/thời đại, ví dụ: Cổ đại Trung Hoa giả tưởng>", "character_notes": [{"character": "<tên nhân vật>", "note": "<mô tả quy tắc xưng hô/hành xử đặc biệt đổi theo tình huống — CHỈ liệt kê khi có căn cứ rõ trong văn bản, ví dụ nhân vật giả trai/giả gái, có thân phận kép, đổi cách xưng hô theo hoàn cảnh>"}], "prompt_instructions": "<2-4 câu mô tả văn phong/nguyên tắc dịch phù hợp thể loại và bối cảnh này>"}

Danh sách thể loại được chọn cho "genres": ${GENRE_OPTIONS.join(", ")}

Nếu không đủ căn cứ để đề xuất mục nào (đặc biệt character_notes — đừng bịa nếu văn bản không thể hiện rõ), để mảng rỗng [] hoặc chuỗi rỗng "" cho mục đó.

ĐOẠN VĂN BẢN:
${sourceText}`;

    try {
      const raw = await callLLM(prompt);
      let text = (raw || "").trim();
      text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(text);
      return {
        genres: Array.isArray(parsed.genres) ? parsed.genres.filter((g) => GENRE_OPTIONS.includes(g)) : [],
        setting_era: typeof parsed.setting_era === "string" ? parsed.setting_era.trim() : "",
        character_notes: Array.isArray(parsed.character_notes)
          ? parsed.character_notes
              .filter((n) => n?.character?.trim() && n?.note?.trim())
              .map((n) => ({ character: n.character.trim(), note: n.note.trim() }))
          : [],
        prompt_instructions:
          typeof parsed.prompt_instructions === "string" ? parsed.prompt_instructions.trim() : "",
      };
    } catch (e) {
      toast({ title: "Lỗi gợi ý preset", description: e.message, variant: "destructive" });
      return null;
    }
  };

  // Clear a column's text (with confirm) — shared by all 3 columns.
  const handleClearColumn = () => {
    if (!clearTarget || !currentChapter) return;
    setCurrentChapter({ ...currentChapter, [clearTarget.field]: "" });
    toast({ title: `Đã xóa ${clearTarget.label} 🗑️` });
    setClearTarget(null);
  };

  const handleCopyColumn = async (text, label) => {
    if (!text) {
      toast({ title: "Chưa có nội dung để sao chép", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `Đã sao chép ${label}! 📋` });
    } catch (e) {
      toast({ title: "Lỗi sao chép", description: e.message, variant: "destructive" });
    }
  };

  // Copy + clear buttons shared by all 3 editor columns.
  const renderColumnActions = (field, label, value) => (
    <>
      <button
        onClick={() => handleCopyColumn(value, label)}
        className="p-1.5 rounded-lg bg-white/70 hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors border border-violet-100"
        title={`Sao chép toàn bộ ${label}`}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      {value ? (
        <button
          onClick={() => setClearTarget({ field, label })}
          className="p-1.5 rounded-lg bg-white/70 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors border border-violet-100"
          title={`Xóa toàn bộ ${label}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </>
  );

  // Always-visible restore tab shown in place of a hidden column — the
  // "Cột" dropdown in the toolbar also toggles this, but a tab right where
  // the panel used to be is impossible to miss.
  const renderRestoreTab = (col, emoji, label) => (
    <button
      onClick={() => handleToggleColumn(col)}
      className="hidden md:flex flex-col items-center justify-center gap-2 w-9 shrink-0 rounded-2xl bg-white/70 border border-violet-100 text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors py-4"
      title={`Hiện lại cột ${label}`}
    >
      <span className="text-base">{emoji}</span>
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </button>
  );

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
        const result = await GlossaryTerm.bulkCreate(batch);
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
      const created = await Chapter.create({
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
      await Chapter.update(chapterId, { title: newTitle });
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
      await Chapter.delete(chapterId);
      const remaining = chapterList.filter((c) => c.id !== chapterId);
      setChapterList(remaining);
      chapterCacheRef.current.delete(chapterId);
      lastSavedRef.current.delete(chapterId);
      if (currentChapter?.id === chapterId) {
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          let target = chapterCacheRef.current.get(nextId);
          if (!target) {
            target = await Chapter.get(nextId);
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
      await Chapter.update(moved.id, { chapter_order: newOrder });
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
        const result = await Chapter.bulkCreate(batch);
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

  // Full-content export of every chapter in the project (Chương/Title/Nội
  // dung columns — round-trips with the "Tải file có cột" import mode).
  // This is the one place worth paying full-content egress for: the user
  // explicitly asked for a bulk export, so there's no way around reading
  // every chapter body at least once.
  // Shared by all 3 export scopes below — dispatches to the right
  // exportUtils serializer for the format the user picked from each export
  // button's dropdown menu.
  const runChaptersExport = async (format, chapters, filename) => {
    if (format === "txt") return exportChaptersTxt(chapters, filename);
    if (format === "docx") return exportChaptersDocx(chapters, filename);
    if (format === "pdf") return exportChaptersPdf(chapters, filename);
    return exportChaptersCsv(chapters, filename);
  };

  const handleExportAllChapters = async (format = "csv") => {
    if (chapterList.length === 0) return;
    setExportingChapters(true);
    try {
      const full = await fetchAllPages(
        (limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      await runChaptersExport(format, full, project?.title || "Chuong");
      toast({ title: `Đã xuất ${full.length} chương! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingChapters(false);
  };

  // Same full-content read as "Xuất tất cả", but filtered down to only
  // chapters that actually have Bản Edit content — for when the user has
  // only finished editing a handful of chapters out of a much bigger import
  // and wants just those, not the whole (mostly still-QT-thô) project.
  const handleExportEditedChapters = async (format = "csv") => {
    if (chapterList.length === 0) return;
    setExportingEdited(true);
    try {
      const full = await fetchAllPages(
        (limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      const editedOnly = full.filter((c) => c.edited?.trim());
      if (editedOnly.length === 0) {
        toast({
          title: "Chưa có chương nào có Bản Edit",
          description: "Edit ít nhất 1 chương rồi thử lại.",
          variant: "destructive",
        });
        return;
      }
      await runChaptersExport(format, editedOnly, `${project?.title || "Chuong"}_DaEdit`);
      toast({ title: `Đã xuất ${editedOnly.length} chương đã Edit! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingEdited(false);
  };

  // Export a hand-picked set of chapters only — unlike "Xuất tất cả"/"Xuất
  // chương đã Edit" (which both read every chapter's full content just to
  // filter it down), this fetches ONLY the chosen chapter ids, reusing the
  // in-memory cache for any already opened this session. Exists specifically
  // so re-exporting after editing a few more chapters doesn't re-download
  // the whole novel's content every time — the user reported that repeatedly
  // exporting "all edited" got heavy as more chapters piled up.
  const handleExportSelectedChapters = async (chapterIds, format = "csv") => {
    if (!chapterIds || chapterIds.length === 0) return;
    setExportingSelected(true);
    try {
      const picked = [];
      for (let i = 0; i < chapterIds.length; i++) {
        const id = chapterIds[i];
        let chapter = chapterCacheRef.current.get(id);
        if (!chapter) {
          // eslint-disable-next-line no-await-in-loop
          chapter = await Chapter.get(id);
          chapterCacheRef.current.set(id, chapter);
          capCache(chapterCacheRef.current);
        }
        picked.push(chapter);
      }
      picked.sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      await runChaptersExport(format, picked, `${project?.title || "Chuong"}_ChonLoc`);
      toast({ title: `Đã xuất ${picked.length} chương đã chọn! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingSelected(false);
  };

  // Batch AI edit across every chapter in the project. Deliberately reuses
  // buildEditPrompt/applyRuleEdit/applyHardRules/runChunkedEdit verbatim (the
  // same functions the single-chapter "Edit AI" button calls) so glossary,
  // batch replace rules, contextual pronoun matrix and the active preset's
  // văn phong all apply identically here — no separate/simplified prompt.
  // Persists each chapter to the DB as soon as it's done (not batched at the
  // end) so a stopped/interrupted run never loses already-finished work, and
  // a chapter with existing Bản Edit content is skipped so re-running after
  // a stop or a rate-limit error only processes what's left.
  const handleStartBatchEdit = async () => {
    if (!hasCustomAI()) {
      toast({
        title: "Cần cấu hình AI trước",
        description: "Bấm nút AI trên thanh công cụ để nhập API key.",
        variant: "destructive",
      });
      return;
    }
    if (chapterList.length === 0) return;

    batchStopRef.current = false;
    setBatchErrors([]);
    setBatchFinished(false);
    const ordered = [...chapterList].sort((a, b) => a.chapter_order - b.chapter_order);
    setBatchProgress({
      done: 0,
      total: ordered.length,
      edited: 0,
      skipped: 0,
      failed: 0,
      currentTitle: "",
    });
    setBatchRunning(true);

    for (let i = 0; i < ordered.length; i++) {
      if (batchStopRef.current) break;
      const meta = ordered[i];
      setBatchProgress((p) => ({ ...p, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) {
          chapter = await Chapter.get(meta.id);
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }

        if (chapter.edited?.trim()) {
          setBatchProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
          continue;
        }
        const sourceText = applyRuleEdit(chapter.qt_raw || chapter.raw_original || "");
        if (!sourceText.trim()) {
          setBatchProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
          continue;
        }

        const editedText = await runChunkedEdit(
          sourceText,
          (prompt) => callLLM(prompt),
          (chunkI, chunkTotal) =>
            chunkTotal > 1 &&
            setBatchProgress((p) => ({
              ...p,
              currentTitle: `${meta.title} (đoạn ${chunkI}/${chunkTotal})`,
            }))
        );
        const finalText = applyHardRules(editedText);

        await Chapter.update(meta.id, { edited: finalText });
        const updatedChapter = { ...chapter, edited: finalText };
        chapterCacheRef.current.set(meta.id, updatedChapter);
        lastSavedRef.current.set(meta.id, snapshotOf(updatedChapter));
        if (currentChapter?.id === meta.id) {
          setCurrentChapter(updatedChapter);
        }
        setBatchProgress((p) => ({ ...p, done: p.done + 1, edited: p.edited + 1 }));
      } catch (e) {
        setBatchErrors((prev) => [...prev, { title: meta.title, message: e.message }]);
        setBatchProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      // Small gap between chapters — 190 back-to-back calls can trip a
      // provider's per-minute rate limit even when each call individually
      // succeeds.
      if (!batchStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setBatchRunning(false);
    setBatchFinished(true);
    toast({
      title: batchStopRef.current
        ? "Đã dừng edit hàng loạt ⏸️"
        : "Hoàn tất edit AI hàng loạt! ✨",
    });
  };

  const handleStopBatchEdit = () => {
    batchStopRef.current = true;
  };

  const handleManualSave = async () => {
    if (!currentChapter) return;
    setSaving(true);
    await flushSave(currentChapter, true);
    setSaving(false);
    toast({ title: "Đã lưu chương này ✅" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
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

  const foreignCharCount = countForeignChars(currentChapter?.edited);

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
          <Link to="/stories" className="text-violet-600 hover:underline">
            ← Về danh sách truyện
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-violet-50 to-indigo-50 flex flex-col">
      {/* Header + toolbar stay put — the page itself never scrolls (h-screen
          overflow-hidden below), only the columns and sidebar do, each via
          their own internal overflow-y-auto (see EditorPanel/GlossarySidebar).
          Previously this wrapper was min-h-screen, which let the whole
          layout grow taller than the viewport and pushed the scrollbar up
          to the document instead, so both problems showed up together: the
          header/toolbar scrolled out of view, and columns never got tall
          enough to need their own scrollbar. */}
      <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-violet-100">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            to="/stories"
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
            title="Về danh sách truyện"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link
            to="/"
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
            title="Về trang chủ"
          >
            <Home className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">{project.cover_emoji || "📚"}</span>
            <div className="min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    onBlur={handleSaveTitle}
                    className="text-sm font-bold text-slate-800 leading-tight px-1.5 py-0.5 rounded-lg border border-violet-300 bg-white focus:outline-none w-40 sm:w-56"
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSaveTitle}
                    className="p-1 rounded-md hover:bg-violet-50 text-violet-600 shrink-0"
                    title="Lưu"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEditingTitle(false)}
                    className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"
                    title="Hủy"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <h1
                  onClick={() => {
                    setTitleDraft(project.title || "");
                    setEditingTitle(true);
                  }}
                  className="text-sm font-bold text-slate-800 leading-tight truncate cursor-pointer hover:text-violet-600 transition-colors flex items-center gap-1 group"
                  title="Bấm để đổi tên bộ truyện"
                >
                  <span className="truncate">{project.title}</span>
                  <Pencil className="w-3 h-3 text-slate-300 group-hover:text-violet-400 shrink-0" />
                </h1>
              )}
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

          {draftMode ? (
            <button
              onClick={handleManualSave}
              disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 font-medium transition-colors hidden md:flex items-center gap-1"
              title="Chế độ nháp: không tự lưu, bấm để lưu chương này ngay"
            >
              {saving ? "💾 Đang lưu..." : "📝 Nháp · Lưu"}
            </button>
          ) : (
            <span className="text-xs text-slate-400 hidden md:block">
              {saving ? "💾 Đang lưu..." : "✅ Đã lưu"}
            </span>
          )}

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
        onCustomEdit={handleGeminiEdit}
        customAIEditing={geminiEditing}
        hasCustomAI={hasCustomAI()}
        customAIProvider={getProvider()}
        onOpenSettings={() => navigate("/settings")}
        onOpenAISettings={() => setShowAISettings(true)}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        onSelfTranslate={handleSelfTranslate}
        selfTranslating={selfTranslating}
        selfTranslateSupported={supportsSelfTranslate(project?.source_language)}
        onRuleEdit={handleRuleEdit}
        onOpenTranslationSettings={() => setShowTranslationSettings(true)}
        activePresetName={activePreset?.name}
        onOpenImageTranslate={() => setShowImageTranslate(true)}
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
              onBulkDeleteTerms={handleBulkDeleteTerms}
              onImportTerms={handleImportTerms}
              onOpenContextualPronoun={() => setShowContextualPronoun(true)}
              onDetectNames={handleDetectNames}
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
                {!visibleColumns.includes("raw") && renderRestoreTab("raw", "📖", "Gốc")}
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
                      extra={renderColumnActions("raw_original", "Văn bản gốc", currentChapter.raw_original)}
                      onHide={() => handleToggleColumn("raw")}
                    />
                  </div>
                )}
                {!visibleColumns.includes("qt") && renderRestoreTab("qt", "✏️", "QT")}
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
                      extra={renderColumnActions("qt_raw", "QT thô", currentChapter.qt_raw)}
                      onHide={() => handleToggleColumn("qt")}
                    />
                  </div>
                )}
                {!visibleColumns.includes("edited") && renderRestoreTab("edited", "✨", "Edit")}
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
                      mode={panel3Mode}
                      onToggleMode={() =>
                        setPanel3Mode(panel3Mode === "view" ? "edit" : "view")
                      }
                      flagForeignChars
                      onScroll={() => handlePanelScroll(2)}
                      placeholder="Bản edit hoàn chỉnh sẽ hiện ở đây..."
                      onHide={() => handleToggleColumn("edited")}
                      extra={
                        <>
                          {foreignCharCount > 0 && (
                            <button
                              onClick={() => setPanel3Mode("view")}
                              className="text-xs px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors border border-red-100"
                              title="Chuyển sang chế độ Xem để thấy vị trí ký tự còn sót"
                            >
                              ⚠️ {foreignCharCount} ký tự Hán sót
                            </button>
                          )}
                          {aiUndo && aiUndo.chapterId === currentChapter.id && (
                            <button
                              onClick={handleUndoAiEdit}
                              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-colors border border-violet-100"
                              title="Hoàn tác bản edit AI vừa chạy (chỉ trong phiên này)"
                            >
                              ↩️ Hoàn tác AI
                            </button>
                          )}
                          {renderColumnActions("edited", "Bản Edit", currentChapter.edited)}
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
      <ConfirmDialog
        open={!!clearTarget}
        onOpenChange={(v) => !v && setClearTarget(null)}
        title={`Xóa toàn bộ ${clearTarget?.label || ""}?`}
        description="Toàn bộ nội dung cột này của chương hiện tại sẽ bị xóa sạch. Bạn không thể hoàn tác hành động này."
        confirmLabel="Xóa tất cả"
        onConfirm={handleClearColumn}
      />
      <ContextualPronounDialog
        open={showContextualPronoun}
        onOpenChange={setShowContextualPronoun}
        project={project}
        onUpdateProject={handleUpdateProject}
        onCheckPronouns={handleCheckPronouns}
        checkingPronouns={checkingPronouns}
        pronounCheckDiff={pronounCheckDiff}
      />
      <AISettingsDialog open={showAISettings} onOpenChange={setShowAISettings} />
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
        onExportAll={handleExportAllChapters}
        exporting={exportingChapters}
        onExportEdited={handleExportEditedChapters}
        exportingEdited={exportingEdited}
        onExportSelected={handleExportSelectedChapters}
        exportingSelected={exportingSelected}
        onBatchEdit={() => setShowBatchEdit(true)}
      />
      <ImportChaptersDialog
        open={showImportChapters}
        onOpenChange={setShowImportChapters}
        onImport={handleImportChapters}
      />
      <BatchEditDialog
        open={showBatchEdit}
        onOpenChange={setShowBatchEdit}
        totalChapters={chapterList.length}
        running={batchRunning}
        finished={batchFinished}
        progress={batchProgress}
        errors={batchErrors}
        onStart={handleStartBatchEdit}
        onStop={handleStopBatchEdit}
      />
      <DetectNamesDialog
        open={showDetectNames}
        onOpenChange={setShowDetectNames}
        detecting={detectingNames}
        candidates={nameCandidates}
        onConfirm={handleAddDetectedNames}
      />
      <TranslationSettingsDialog
        open={showTranslationSettings}
        onOpenChange={setShowTranslationSettings}
        presets={presets}
        activePresetId={project?.active_preset_id}
        styleToggles={project?.style_toggles}
        onSelectPreset={handleSelectPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        onUpdateStyleToggles={handleUpdateStyleToggles}
        onSuggestPreset={handleSuggestPreset}
      />
      <ImageTranslateDialog
        open={showImageTranslate}
        onOpenChange={setShowImageTranslate}
        hasCustomAI={hasCustomAI()}
        onOpenSettings={() => setShowAISettings(true)}
        translating={imageTranslating}
        result={imageResult}
        onSelectFile={handleSelectImageFile}
        onEditRaw={handleEditImageRaw}
        onApply={handleApplyImageResult}
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
