import { useState, useRef, useEffect } from "react";
import {
  Wand2,
  Users,
  Plus,
  PanelLeft,
  Loader2,
  Sparkles,
  Settings as SettingsIcon,
  Columns3,
  Check,
  Languages,
  Palette,
  ImagePlus,
  MoreHorizontal,
  Bot,
  Database,
  ArrowRightLeft,
  Eraser,
} from "lucide-react";

const COLUMN_OPTIONS = [
  { key: "raw", label: "Văn bản gốc" },
  { key: "qt", label: "QT thô" },
  { key: "edited", label: "Bản Edit" },
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
  onOpenColumnMove,
  onOpenQtCleanup,
}) {
  const [showCols, setShowCols] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showDataTools, setShowDataTools] = useState(false);
  const colsRef = useRef(null);
  const moreRef = useRef(null);
  const mobileMoreRef = useRef(null);
  const dataToolsRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (colsRef.current && !colsRef.current.contains(e.target)) setShowCols(false);
      if (!moreRef.current?.contains(e.target) && !mobileMoreRef.current?.contains(e.target)) setShowMore(false);
      if (dataToolsRef.current && !dataToolsRef.current.contains(e.target)) setShowDataTools(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
        <button type="button" onClick={hasCustomAI ? onCustomEdit : onOpenAISettings} disabled={customAIEditing} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-violet-600 text-[11px] font-bold text-white shadow-sm active:bg-violet-700 disabled:opacity-50">
          {customAIEditing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}<span>{hasCustomAI ? provider.label : "Thiết lập AI"}</span>
        </button>
        <div ref={mobileMoreRef} className="relative">
          <button type="button" onClick={() => setShowMore((value) => !value)} className="flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-600 active:bg-violet-50 active:text-violet-700" aria-expanded={showMore}>
            <MoreHorizontal className="h-5 w-5" /><span>Công cụ</span>
          </button>
          {showMore && (
            <div className="absolute bottom-full right-0 mb-3 max-h-[min(65dvh,520px)] w-[min(22rem,calc(100vw-16px))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Công cụ biên tập</p>
              <button onClick={() => { onQuickAddGlossary(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Plus className="h-4 w-4 text-violet-600" /> Thêm từ bôi đen vào Glossary</button>
              <button onClick={() => { onBatchReplace(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Wand2 className="h-4 w-4 text-amber-600" /> Thay thế hàng loạt</button>
              <button onClick={() => { onPronounSwitcher(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Users className="h-4 w-4 text-purple-600" /> Đổi xưng hô</button>
              <button onClick={() => { onRuleEdit(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 active:bg-violet-50"><Sparkles className="h-4 w-4 text-violet-600" /> Rule Edit</button>
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
    <div className="relative z-50 hidden shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2.5 shadow-[0_8px_24px_-24px_rgba(15,23,42,.5)] backdrop-blur-xl md:flex">
      {/* Column selector */}
      <div ref={colsRef} className="relative shrink-0">
        <button
          onClick={() => setShowCols((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition-colors border border-violet-100"
        >
          <Columns3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Cột</span>
          <span className="text-violet-300">({visibleColumns.length})</span>
        </button>
        {showCols && (
          <div className="absolute left-0 top-full mt-1 z-40 w-48 bg-white rounded-xl border border-violet-100 shadow-xl p-1.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 px-2 pt-1 pb-1">
              Hiển thị cột
            </p>
            {COLUMN_OPTIONS.map((opt) => {
              const on = visibleColumns.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  onClick={() => onToggleColumn(opt.key)}
                  disabled={on && visibleColumns.length === 1}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={on && visibleColumns.length === 1 ? "Phải giữ ít nhất 1 cột" : ""}
                >
                  <span>{opt.label}</span>
                  {on ? (
                    <Check className="w-3.5 h-3.5 text-violet-600" />
                  ) : (
                    <span className="w-3.5 h-3.5 inline-block rounded-full border border-slate-200" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-violet-100 shrink-0" />

      {/* Less-frequent tools (Glossary quick-add, batch replace, pronoun
          switcher, style preset, image translate) grouped behind one "Thêm"
          menu — reuses the same open/close/outside-click pattern as the
          Cột selector above, instead of listing every action inline where
          it used to silently overflow off-screen. */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          onClick={() => setShowMore((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors border border-slate-200"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Thêm</span>
        </button>
        {showMore && (
          <div className="absolute left-0 top-full mt-1 z-40 w-56 bg-white rounded-xl border border-violet-100 shadow-xl p-1.5">
            <button
              onMouseDown={preventBlur}
              onClick={() => {
                onQuickAddGlossary();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors"
              title="Thêm từ bôi đen vào từ điển"
            >
              <Plus className="w-3.5 h-3.5 text-violet-600 shrink-0" /> Glossary — thêm từ bôi đen
            </button>
            <button
              onClick={() => {
                onBatchReplace();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Thay thế hàng loạt
            </button>
            <button
              onMouseDown={preventBlur}
              onClick={() => {
                onPronounSwitcher();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-purple-600 shrink-0" /> Đổi xưng hô
            </button>
            <button
              onClick={() => {
                onOpenTranslationSettings();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors"
              title="Preset văn phong & công tắc dịch thuật cho bộ truyện này"
            >
              <Palette className="w-3.5 h-3.5 text-pink-600 shrink-0" />
              <span className="truncate">Preset: {activePresetName || "(mặc định)"}</span>
            </button>
            <button
              onClick={() => {
                onOpenImageTranslate();
                setShowMore(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-700 transition-colors"
              title="Dịch từ ảnh (OCR + dịch bằng AI)"
            >
              <ImagePlus className="w-3.5 h-3.5 text-sky-600 shrink-0" /> Dịch từ ảnh
            </button>
          </div>
        )}
      </div>

      <div ref={dataToolsRef} className="relative shrink-0">
        <button onClick={() => setShowDataTools((value) => !value)} className="flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100" title="Công cụ xử lý dữ liệu toàn truyện">
          <Database className="h-3.5 w-3.5" /><span className="hidden sm:inline">Công cụ dữ liệu</span>
        </button>
        {showDataTools && <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-violet-100 bg-white p-1.5 shadow-xl">
          <button onClick={() => { onOpenColumnMove(); setShowDataTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-violet-50"><ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-violet-600" /> Chuyển dữ liệu giữa các cột</button>
          <button onClick={() => { onOpenQtCleanup(); setShowDataTools(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-violet-50"><Eraser className="h-3.5 w-3.5 shrink-0 text-amber-600" /> Dọn dấu chia Phần trong QT</button>
        </div>}
      </div>

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
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {selfTranslating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Languages className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Tự dịch</span>
      </button>

      {/* Rule Edit (src/lib/ruleEdit.js — zero AI, zero network, patterns
          learned from the user's own real chapter pairs) */}
      <button
        onClick={onRuleEdit}
        title="Edit QT thô → Bản Edit bằng rule (miễn phí, chạy tại chỗ, không dùng AI)"
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Rule Edit</span>
      </button>

      {/* Custom AI (Gemini / GPT / Claude) */}
      {hasCustomAI ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onCustomEdit}
            disabled={customAIEditing}
            title={`Edit bằng ${provider.label}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r ${provider.gradFrom} ${provider.gradTo} hover:opacity-90 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50`}
          >
            {customAIEditing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            {provider.label}
          </button>
          <button
            onClick={onOpenAISettings}
            className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
            title="Đổi nhà cung cấp/API Key AI"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-all shrink-0"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Thiết lập AI</span>
          <span className="sm:hidden">AI</span>
        </button>
      )}

      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 transition-colors shrink-0"
        title="Ẩn/hiện từ điển"
      >
        <PanelLeft className="w-4 h-4" />
      </button>
      <button
        onClick={onOpenSettings}
        className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors shrink-0"
        title="Cài đặt"
      >
        <SettingsIcon className="w-4 h-4" />
      </button>
    </div>
    </>
  );
}
