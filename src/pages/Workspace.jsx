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
import { exportAsTxt, exportAsDoc, exportGlossaryJson } from "@/lib/exportUtils";
import { callGemini, hasGeminiKey } from "@/lib/gemini";
import ClearEditDialog from "@/components/workspace/ClearEditDialog";
import { Loader2, ArrowLeft, Plus, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Workspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("3col");
  const [saving, setSaving] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [panel1Mode, setPanel1Mode] = useState("view");
  const [panel2Mode, setPanel2Mode] = useState("view");

  const [showGlossaryForm, setShowGlossaryForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [prefillTerm, setPrefillTerm] = useState("");
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [showPronoun, setShowPronoun] = useState(false);
  const [showClearEdit, setShowClearEdit] = useState(false);
  const [geminiEditing, setGeminiEditing] = useState(false);
  const [pronounSelection, setPronounSelection] = useState({
    text: "",
    start: 0,
    end: 0,
  });

  const panelRefs = [useRef(null), useRef(null), useRef(null)];
  const isSyncing = useRef(false);

  useEffect(() => {
    loadProjectData();
    // eslint-disable-next-line
  }, [projectId]);

  const loadProjectData = async () => {
    setLoading(true);
    try {
      const proj = await base44.entities.Project.get(projectId);
      setProject(proj);
      const chaps = await base44.entities.Chapter.filter(
        { project_id: projectId },
        "chapter_order",
        100
      );
      setChapters(chaps);
      if (chaps.length > 0) setCurrentChapter(chaps[0]);
      const terms = await base44.entities.GlossaryTerm.filter(
        { project_id: projectId },
        "-created_date",
        500
      );
      setGlossaryTerms(terms);
    } catch (e) {
      toast({
        title: "Lỗi tải dự án",
        description: e.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  // Auto-save chapter (debounced)
  useEffect(() => {
    if (!currentChapter?.id) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await base44.entities.Chapter.update(currentChapter.id, {
          raw_original: currentChapter.raw_original || "",
          qt_raw: currentChapter.qt_raw || "",
          edited: currentChapter.edited || "",
        });
      } catch (e) {
        console.error(e);
      }
      setSaving(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    currentChapter?.raw_original,
    currentChapter?.qt_raw,
    currentChapter?.edited,
  ]);

  const switchChapter = (chapterId) => {
    if (currentChapter?.id && currentChapter.id !== chapterId) {
      base44.entities.Chapter
        .update(currentChapter.id, {
          raw_original: currentChapter.raw_original || "",
          qt_raw: currentChapter.qt_raw || "",
          edited: currentChapter.edited || "",
        })
        .catch(console.error);
    }
    const ch = chapters.find((c) => c.id === chapterId);
    if (ch) setCurrentChapter(ch);
  };

  // Sync scroll
  const handlePanelScroll = (scrolledIndex) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const visibleIndices = viewMode === "3col" ? [0, 1, 2] : [0, 2];
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

  // Batch replace
  const handleApplyBatchRules = (rules, target) => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    let text = currentChapter[target] || "";
    let count = 0;
    rules.forEach((r) => {
      if (r.find) {
        const parts = text.split(r.find);
        count += parts.length - 1;
        text = parts.join(r.replace || "");
      }
    });
    setCurrentChapter({ ...currentChapter, [target]: text });
    toast({
      title: "Đã thay thế hàng loạt! 🔄",
      description: `${count} lần thay thế`,
    });
  };

  // Pronoun switch
  const handleApplyPronounRule = (rule, target) => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    if (target === "edited" && pronounSelection.text) {
      let selected = pronounSelection.text;
      rule.from_words.forEach((from, i) => {
        const to = rule.to_words[i] || from;
        selected = selected.split(from).join(to);
      });
      const full = currentChapter.edited || "";
      const newText =
        full.substring(0, pronounSelection.start) +
        selected +
        full.substring(pronounSelection.end);
      setCurrentChapter({ ...currentChapter, edited: newText });
      setPronounSelection({ text: "", start: 0, end: 0 });
    } else {
      let text = currentChapter[target] || "";
      rule.from_words.forEach((from, i) => {
        const to = rule.to_words[i] || from;
        text = text.split(from).join(to);
      });
      setCurrentChapter({ ...currentChapter, [target]: text });
    }
    toast({ title: `Đã đổi xưng hô: ${rule.name} 👥` });
  };

  // AI auto-edit
  const handleAutoEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const sourceText =
      currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({
        title: "Không có văn bản để edit!",
        variant: "destructive",
      });
      return;
    }
    setAiEditing(true);
    try {
      const glossaryText = glossaryTerms
        .map((t) => `- "${t.source_term}" → "${t.translation}"`)
        .join("\n");
      const batchRulesText = (project?.batch_rules || [])
        .filter((r) => r.find)
        .map((r) => `- Thay "${r.find}" bằng "${r.replace}"`)
        .join("\n");

      const prompt = `Bạn là trợ lý biên tập truyện dịch chuyên nghiệp, chuyên edit truyện Convert/QT. Hãy biên tập văn bản QT thô sau đây thành văn phong tiếng Việt mượt mà, tự nhiên, thoát ý, giữ đúng cảm xúc và ý nghĩa gốc.

QUY TẮC BẮT BUỘC:
1. PHẢI tuân thủ 100% các thuật ngữ trong Glossary. Nếu gặp từ gốc trong glossary, bắt buộc dùng bản dịch tương ứng.
2. Áp dụng các quy tắc thay thế nếu có.
3. Sửa câu cưỡng ép, ngữ pháp lủng củng, lặp từ. Diễn đạt lại cho mượt mà nhưng giữ nguyên ý.
4. Giữ nguyên các đoạn hội thoại trong ngoặc kép.
5. KHÔNG thêm giải thích, ghi chú, hay tiêu đề. Chỉ xuất văn bản đã biên tập.

GLOSSARY (TUÂN THỦ 100%):
${glossaryText || "(trống)"}

QUY TẮC THAY THẾ:
${batchRulesText || "(không có)"}

VĂN BẢN CẦN BIÊN TẬP:
${sourceText}

Hãy biên tập lại toàn bộ văn bản trên thành bản tiếng Việt hoàn chỉnh:`;

      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const editedText =
        typeof result === "string"
          ? result
          : result?.output || result?.response || "";
      setCurrentChapter({ ...currentChapter, edited: editedText });
      toast({
        title: "🤖 Đã tự động edit chương!",
        description: "Kiểm tra và chỉnh sửa thêm nhé",
      });
    } catch (e) {
      toast({
        title: "Lỗi AI",
        description: e.message,
        variant: "destructive",
      });
    }
    setAiEditing(false);
  };

  // Gemini AI auto-edit (custom API key)
  const handleGeminiEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const sourceText =
      currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({
        title: "Không có văn bản để edit!",
        variant: "destructive",
      });
      return;
    }
    setGeminiEditing(true);
    try {
      const glossaryText = glossaryTerms
        .map((t) => `- "${t.source_term}" → "${t.translation}"`)
        .join("\n");
      const batchRulesText = (project?.batch_rules || [])
        .filter((r) => r.find)
        .map((r) => `- Thay "${r.find}" bằng "${r.replace}"`)
        .join("\n");
      const prompt = `Bạn là trợ lý biên tập truyện dịch chuyên nghiệp, chuyên edit truyện Convert/QT. Hãy biên tập văn bản QT thô sau đây thành văn phong tiếng Việt mượt mà, tự nhiên, thoát ý, giữ đúng cảm xúc và ý nghĩa gốc.

QUY TẮC BẮT BUỘC:
1. PHẢI tuân thủ 100% các thuật ngữ trong Glossary. Nếu gặp từ gốc trong glossary, bắt buộc dùng bản dịch tương ứng.
2. Áp dụng các quy tắc thay thế nếu có.
3. Sửa câu cưỡng ép, ngữ pháp lủng củng, lặp từ. Diễn đạt lại cho mượt mà nhưng giữ nguyên ý.
4. Giữ nguyên các đoạn hội thoại trong ngoặc kép.
5. KHÔNG thêm giải thích, ghi chú, hay tiêu đề. Chỉ xuất văn bản đã biên tập.

GLOSSARY (TUÂN THỦ 100%):
${glossaryText || "(trống)"}

QUY TẮC THAY THẾ:
${batchRulesText || "(không có)"}

VĂN BẢN CẦN BIÊN TẬP:
${sourceText}

Hãy biên tập lại toàn bộ văn bản trên thành bản tiếng Việt hoàn chỉnh:`;

      const editedText = await callGemini(prompt);
      setCurrentChapter({ ...currentChapter, edited: editedText });
      toast({
        title: "Gemini đã edit xong! ✨",
        description: "Kiểm tra và chỉnh thêm nhé",
      });
    } catch (e) {
      toast({
        title: "Lỗi Gemini",
        description: e.message,
        variant: "destructive",
      });
    }
    setGeminiEditing(false);
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
      const order = chapters.length;
      const created = await base44.entities.Chapter.create({
        project_id: projectId,
        title: `Chương ${order + 1}`,
        chapter_order: order,
        raw_original: "",
        qt_raw: "",
        edited: "",
      });
      setChapters((prev) => [...prev, created]);
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
                {glossaryTerms.length} thuật ngữ · {chapters.length} chương
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
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title}
              </option>
            ))}
          </select>
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

          <div className="flex items-center gap-1">
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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onQuickAddGlossary={handleQuickAddGlossary}
        onBatchReplace={() => setShowBatchReplace(true)}
        onPronounSwitcher={handleOpenPronoun}
        onAutoEdit={handleAutoEdit}
        aiEditing={aiEditing}
        onGeminiEdit={handleGeminiEdit}
        geminiEditing={geminiEditing}
        hasGeminiKey={hasGeminiKey()}
        onOpenSettings={() => navigate("/settings")}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {showSidebar && (
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
          />
        )}
        <div className="flex-1 flex gap-2 p-3 min-w-0">
          {currentChapter ? (
            <>
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
              {viewMode === "3col" && (
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
                  placeholder="Dán văn bản QT/Convert thô vào đây..."
                />
              )}
              <EditorPanel
                ref={panelRefs[2]}
                title="Bản Edit"
                emoji="✨"
                value={currentChapter.edited}
                onChange={(v) =>
                  setCurrentChapter({ ...currentChapter, edited: v })
                }
                mode="edit"
                onScroll={() => handlePanelScroll(viewMode === "3col" ? 2 : 1)}
                placeholder="Bản edit hoàn chỉnh sẽ hiện ở đây..."
                extra={
                  currentChapter.edited ? (
                    <button
                      onClick={() => setShowClearEdit(true)}
                      className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors border border-violet-100"
                      title="Xóa toàn bộ bản edit"
                    >
                      🗑️ Xóa
                    </button>
                  ) : null
                }
              />
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
    </div>
  );
}