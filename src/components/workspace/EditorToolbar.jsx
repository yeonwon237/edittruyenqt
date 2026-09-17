import { useState, useRef, useEffect } from "react";
import {
  Wand2,
  Users,
  Plus,
  PanelLeft,
  Loader2,
  Settings as SettingsIcon,
  Languages,
  Palette,
  ImagePlus,
  MoreHorizontal,
  Bot,
  Database,
  ArrowRightLeft,
  Eraser,
  ChevronDown,
  Check,
  ShieldCheck,
  PenTool,
  BookOpen,
  List as ListIcon,
  Send,
} from "lucide-react";
import { isDesktopApp } from "@/lib/platform";
import { NMT_MODELS, getSidecarModelId, setSidecarModelId } from "@/lib/nmtTranslate";
import LilyBetaSync from "@/components/workspace/LilyBetaSync";
import { useInSidebarLayout } from "@/lib/desktopSidebarContext";

const COLUMN_OPTIONS = [
  { key: "raw", label: "Gốc" },
  { key: "qt", label: "QT" },
  { key: "edited", label: "Edit" },
];

const PROVIDER_INFO = {
  gemini: {
    label: "Gemini",
    gradFrom: "from-violet-600", gradTo: "to-violet-700",
  },
  openai: {
    label: "GPT",
    gradFrom: "from-violet-600", gradTo: "to-violet-700",
  },
  claude: {
    label: "Claude",
    gradFrom: "from-violet-600", gradTo: "to-violet-700",
  },
};

export default function EditorToolbar({
  visibleColumns,
  onToggleColumn,
  onQuickAddGlossary,
  onBatchReplace,
  onPronounSwitcher,
  onCustomEdit,
  customAIEditing,
  hasCustomAI,
  customAIProvider,
  onOpenSettings,
  onOpenAISettings,
  onToggleSidebar,
  onSelfTranslate,
  selfTranslating,
  selfTranslateSupported,
  onOpenTranslationSettings,
  activePresetName,
  onOpenImageTranslate,
  onRuleEdit,
  ruleEditing,
  onOpenColumnMove,
  onOpenQtCleanup,
  storyQaCount,
  onOpenStoryQa,
  storyBetaCount,
  onOpenStoryBeta,
  onOpenTranslationWorkflow,
  onOpenChapterManager,
  onCreateChapter,
  onExport,
  projectId,
  currentChapterId,
  onBeforeLilyBetaSync,
}) {
  const [showMore, setShowMore] = useState(false);
  const [showDataTools, setShowDataTools] = useState(false);
  const [showOtherTools, setShowOtherTools] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [nmtModelId, setNmtModelId] = useState(() => getSidecarModelId());
  const moreRef = useRef(null);
  const mobileMoreRef = useRef(null);
  const dataToolsRef = useRef(null);
  const otherToolsRef = useRef(null);
  const modelPickerRef = useRef(null);
  const desktop = isDesktopApp();
  const inSidebarLayout = useInSidebarLayout();

  useEffect(() => {
    const onDocClick = (e) => {
      if (!moreRef.current?.contains(e.target) && !mobileMoreRef.current?.contains(e.target)) setShowMore(false);
      if (dataToolsRef.current && !dataToolsRef.current.contains(e.target)) setShowDataTools(false);
      if (otherToolsRef.current && !otherToolsRef.current.contains(e.target)) setShowOtherTools(false);
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target)) setShowModelPicker(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedNmtModel = NMT_MODELS.find((m) => m.id === nmtModelId) || NMT_MODELS[0];
  const handleSelectNmtModel = (id) => {
    setSidecarModelId(id);
    setNmtModelId(id);
    setShowModelPicker(false);
  };

  const preventBlur = (e) => e.preventDefault();
  const provider = PROVIDER_INFO[customAIProvider] || PROVIDER_INFO.gemini;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[70] grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-1.5 shadow-[0_-12px_30px_-22px_rgba(15,23,42,.45)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "max(.375rem, env(safe-area-inset-bottom))" }}
        aria-label="Thao tác nhanh"
      >
        <button type="button" onClick={onToggleSidebar} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-600 active:bg-violet-50 active:text-violet-700">
          <PanelLeft className="h-5 w-5" /><span>Từ điển</span>
        </button>
        <button type="button" onClick={onSelfTranslate} disabled={!selfTranslateSupported || selfTranslating} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-600 active:bg-violet-50 active:text-violet-700 disabled:opacity-35">
          {selfTranslating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Languages className="h-5 w-5" />}<span>Tự dịch</span>
        </button>
        <button type="button" onClick={hasCustomAI ? () => onCustomEdit("polish") : onOpenAISettings} disabled={customAIEditing} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-violet-600 text-[11px] font-bold text-white shadow-sm active:bg-violet-700 disabled:opacity-50">
          {customAIEditing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}<span>{hasCustomAI ? "Làm mượt" : "Thiết lập AI"}</span>
        </button>
        <div ref={mobileMoreRef} className="relative">
          <button type="button" onClick={() => setShowMore((value) => !value)} className="flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-600 active:bg-violet-50 active:text-violet-700" aria-expanded={showMore}>
            <MoreHorizontal className="h-5 w-5" /><span>Công cụ</span>
          </button>
          {showMore && (
            <div className="absolute bottom-full right-0 mb-3 max-h-[min(65dvh,520px)] w-[min(22rem,calc(100vw-16px))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Công cụ biên tập</p>
              <button onClick={() => { onQuickAddGlossary(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Plus className="h-4 w-4 text-violet-600" /> Thêm vào Glossary</button>
              <button onClick={() => { onBatchReplace(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Wand2 className="h-4 w-4 text-amber-600" /> Thay thế hàng loạt</button>
              <button onClick={() => { onPronounSwitcher(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Users className="h-4 w-4 text-purple-600" /> Đổi xưng hô</button>
              <button onClick={() => { onRuleEdit(); setShowMore(false); }} disabled={ruleEditing} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50 disabled:opacity-40">{ruleEditing ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> : <Bot className="h-4 w-4 text-violet-600" />} Dịch AI</button>
              {hasCustomAI && <button onClick={() => { onCustomEdit("translate"); setShowMore(false); }} disabled={customAIEditing} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50 disabled:opacity-40"><Languages className="h-4 w-4 text-violet-600" /> Dịch Trung–Việt bằng {provider.label}</button>}
              <button onClick={() => { onOpenTranslationSettings(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Palette className="h-4 w-4 text-pink-600" /> Preset văn phong</button>
              <button onClick={() => { onOpenImageTranslate(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><ImagePlus className="h-4 w-4 text-sky-600" /> Dịch từ ảnh</button>
              <button onClick={() => { onOpenColumnMove(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><ArrowRightLeft className="h-4 w-4 text-indigo-600" /> Chuyển dữ liệu giữa các cột</button>
              <button onClick={() => { onOpenQtCleanup(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Eraser className="h-4 w-4 text-amber-600" /> Dọn dấu chia Phần trong QT</button>
              <button onClick={() => { onOpenSettings(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><SettingsIcon className="h-4 w-4 text-slate-500" /> Cài đặt</button>
            </div>
          )}
        </div>
      </nav>
    {/* Desktop toolbar stays unchanged; the compact mobile toolbar above is
        fixed to the bottom and only rendered below the md breakpoint. */}
    <div className="relative z-50 hidden shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2.5 shadow-[0_8px_24px_-24px_rgba(15,23,42,.5)] backdrop-blur-xl dark:border-white/10 dark:bg-[#252526] dark:shadow-none md:flex">
      {/* Column visibility — inline toggle group, each column switches on/off
          in place instead of opening a menu. */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-white/10 dark:bg-white/5">
        {COLUMN_OPTIONS.map((opt) => {
          const on = visibleColumns.includes(opt.key);
          const disabled = on && visibleColumns.length === 1;
          return (
            <button
              key={opt.key}
              onClick={() => onToggleColumn(opt.key)}
              disabled={disabled}
              aria-pressed={on}
              title={disabled ? "Phải giữ ít nhất 1 cột" : `${on ? "Ẩn" : "Hiện"} cột ${opt.label}`}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                on ? "bg-white text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-300" : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="w-px h-6 bg-violet-100 shrink-0 dark:bg-white/10" />

      {/* Less-frequent tools (Glossary quick-add, batch replace, pronoun
          switcher, style preset, image translate) grouped behind one "Thêm"
          menu — reuses the same open/close/outside-click pattern as the
          Cột selector above, instead of listing every action inline where
          it used to silently overflow off-screen. */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          onClick={() => setShowMore((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Thêm</span>
        </button>
        {showMore && (
          <div className="absolute left-0 top-full mt-1 z-40 w-56 bg-white rounded-xl border border-violet-100 shadow-xl p-1.5 dark:border-white/10 dark:bg-[#2d2d2e]">
            <button
              onMouseDown={preventBlur}
              onClick={() => {
                onQuickAddGlossary();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
              title="Thêm thuật ngữ vào Glossary, có thể nhập thủ công"
            >
              <Plus className="w-3.5 h-3.5 text-violet-600 shrink-0 dark:text-violet-300" /> Glossary — thêm thuật ngữ
            </button>
            <button
              onClick={() => {
                onBatchReplace();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-600 shrink-0 dark:text-amber-400" /> Thay thế hàng loạt
            </button>
            <button
              onMouseDown={preventBlur}
              onClick={() => {
                onPronounSwitcher();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Users className="w-3.5 h-3.5 text-purple-600 shrink-0 dark:text-purple-400" /> Đổi xưng hô
            </button>
            <button
              onClick={() => {
                onOpenTranslationSettings();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
              title="Preset văn phong & công tắc dịch thuật cho bộ truyện này"
            >
              <Palette className="w-3.5 h-3.5 text-pink-600 shrink-0 dark:text-pink-400" />
              <span className="truncate">Preset: {activePresetName || "(mặc định)"}</span>
            </button>
            <button
              onClick={() => {
                onOpenImageTranslate();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors dark:text-slate-200 dark:hover:bg-white/5"
              title="Dịch từ ảnh (OCR + dịch bằng AI)"
            >
              <ImagePlus className="w-3.5 h-3.5 text-sky-600 shrink-0 dark:text-sky-400" /> Dịch từ ảnh
            </button>
          </div>
        )}
      </div>

      <div ref={dataToolsRef} className="relative shrink-0">
        <button onClick={() => setShowDataTools((value) => !value)} className="flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:hover:bg-indigo-400/20" title="Công cụ xử lý dữ liệu toàn truyện">
          <Database className="h-3.5 w-3.5" /><span className="hidden sm:inline">Công cụ dữ liệu</span>
        </button>
        {showDataTools && <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-violet-100 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#2d2d2e]">
          <button onClick={() => { onOpenColumnMove(); setShowDataTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-white/5"><ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" /> Chuyển dữ liệu giữa các cột</button>
          <button onClick={() => { onOpenQtCleanup(); setShowDataTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-white/5"><Eraser className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" /> Dọn dấu chia Phần trong QT</button>
        </div>}
      </div>

      {/* Moved here from WorkspaceDesktopBar's "..." button — shown whenever
          AppSidebar is present (web and desktop, via DesktopLayout), groups
          the whole-story actions that don't fit AppSidebar/the rest of this
          toolbar (QA/Beta toàn truyện, dịch toàn truyện, quản lý chương,
          xuất bản, LilyBetaSync). */}
      {inSidebarLayout && (
        <div ref={otherToolsRef} className="relative shrink-0">
          <button onClick={() => setShowOtherTools((value) => !value)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10" title="Các thao tác khác cho toàn truyện">
            <MoreHorizontal className="h-3.5 w-3.5" /><span className="hidden sm:inline">Công cụ khác</span>
          </button>
          {showOtherTools && (
            <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl dark:border-white/10 dark:bg-[#2d2d2e] dark:text-slate-200">
              <button onClick={() => { onOpenStoryQa(); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" /> QA toàn truyện{storyQaCount ? ` · ${storyQaCount}` : ""}
              </button>
              <button onClick={() => { onOpenStoryBeta(); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">
                <PenTool className="h-3.5 w-3.5 shrink-0 text-fuchsia-500 dark:text-fuchsia-400" /> Beta toàn truyện{storyBetaCount ? ` · ${storyBetaCount}` : ""}
              </button>
              <button onClick={() => { onOpenTranslationWorkflow(); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-cyan-600 transition-colors hover:bg-violet-50 dark:text-cyan-300 dark:hover:bg-white/5">
                <BookOpen className="h-3.5 w-3.5 shrink-0" /> Chuẩn bị &amp; dịch toàn truyện
              </button>
              <button onClick={() => { onOpenChapterManager(); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">
                <ListIcon className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" /> Quản lý chương
              </button>
              <button onClick={() => { onCreateChapter(); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">
                <Plus className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" /> Tạo chương mới
              </button>
              <div className="my-1 h-px bg-slate-200 dark:bg-white/10" />
              <button onClick={() => { onExport("txt"); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">Xuất bản Edit — TXT</button>
              <button onClick={() => { onExport("doc"); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">Xuất bản Edit — DOCX</button>
              <button onClick={() => { onExport("json"); setShowOtherTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5">Xuất bản Edit — JSON</button>
              <div className="my-1 h-px bg-slate-200 dark:bg-white/10" />
              <LilyBetaSync
                key={`${projectId}-toolbar`}
                projectId={projectId}
                currentChapterId={currentChapterId}
                beforeSync={onBeforeLilyBetaSync}
                triggerIcon={<Send className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" />}
                triggerClassName="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50 dark:hover:bg-white/5"
              />
            </div>
          )}
        </div>
      )}

      {/* Only acts as a spacer on desktop (single row) — on mobile the row
          already wraps, so an empty flex-1 here would claim a whole row of
          its own between the two button groups. */}
      <div className="hidden sm:block sm:flex-1" />

      {/* Self-translate (built-in dictionary engine, free, 0 network cost) */}
      <button
        onClick={onSelfTranslate}
        disabled={!selfTranslateSupported || selfTranslating}
        title={
          selfTranslateSupported
            ? "Tự dịch văn bản gốc → QT thô bằng từ điển Hán-Việt (miễn phí, chạy tại chỗ)"
            : "Tự dịch tự thân hiện chỉ hỗ trợ nguồn tiếng Trung"
        }
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
      >
        {selfTranslating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Languages className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Tự dịch</span>
      </button>

      {/* AI translate: web uses the private VPS API; desktop keeps its local
          CTranslate2 sidecar. Both preserve project glossary names. */}
      <button
        onClick={onRuleEdit}
        disabled={ruleEditing}
        title={desktop ? "Dịch văn bản gốc → QT thô bằng model AI trên máy" : "Dịch văn bản gốc → QT thô bằng model AI trên VPS"}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
      >
        {ruleEditing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Dịch AI</span>
      </button>

      {/* The same model keys are available in the desktop sidecar and VPS. */}
      {(
        <div ref={modelPickerRef} className="relative shrink-0">
          <button
            onClick={() => setShowModelPicker((v) => !v)}
            title="Chọn model dịch AI"
            className="flex items-center gap-1 px-2 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            aria-expanded={showModelPicker}
          >
            <span className="max-w-[6.5rem] truncate sm:max-w-[9rem]">{selectedNmtModel.label}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
          {showModelPicker && (
            <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-violet-100 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#2d2d2e]">
              {NMT_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectNmtModel(m.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-violet-50 dark:hover:bg-white/5"
                >
                  <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300 ${m.id === selectedNmtModel.id ? "opacity-100" : "opacity-0"}`} />
                  <span>
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{m.label}</span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">{m.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom AI (Gemini / GPT / Claude) */}
      {hasCustomAI ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onCustomEdit("polish")}
            disabled={customAIEditing}
            title={`Làm mượt QT, giữ nguyên xưng hô bằng ${provider.label}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r ${provider.gradFrom} ${provider.gradTo} hover:opacity-90 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50`}
          >
            {customAIEditing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            Làm mượt QT
          </button>
          <button
            onClick={() => onCustomEdit("translate")}
            disabled={customAIEditing}
            title={`Dịch văn bản gốc tiếng Trung sang Bản Edit bằng ${provider.label}`}
            className="rounded-xl border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-white/20 dark:text-violet-300"
          >
            Dịch Trung–Việt
          </button>
          <button
            onClick={onOpenAISettings}
            className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-violet-300"
            title="Đổi nhà cung cấp/API Key AI"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-all shrink-0 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Thiết lập AI</span>
          <span className="sm:hidden">AI</span>
        </button>
      )}

      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 transition-colors shrink-0 dark:hover:bg-white/5 dark:hover:text-violet-300"
        title="Ẩn/hiện từ điển"
      >
        <PanelLeft className="w-4 h-4" />
      </button>
      {/* AppSidebar already has "Cài đặt" in its footer whenever it's
          present — this gear would just be a second, redundant way to reach
          the exact same page, so it only shows up without AppSidebar. */}
      {!inSidebarLayout && (
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors shrink-0 dark:hover:bg-white/5 dark:hover:text-violet-300"
          title="Cài đặt"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      )}
    </div>
    </>
  );
}
