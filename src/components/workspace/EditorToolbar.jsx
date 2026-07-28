import { useState, useRef, useEffect } from "react";
import {
  Wand2,
  Users,
  Plus,
  PanelLeft,
  Loader2,
  Bot,
  Sparkles,
  Settings as SettingsIcon,
  Columns3,
  Check,
  Languages,
  Palette,
  ImagePlus,
  MoreHorizontal,
} from "lucide-react";

const COLUMN_OPTIONS = [
  { key: "raw", label: "📖 Văn bản gốc" },
  { key: "qt", label: "✏️ QT thô" },
  { key: "edited", label: "✨ Bản Edit" },
];

const PROVIDER_INFO = {
  gemini: {
    label: "Gemini", emoji: "✨",
    gradFrom: "from-blue-500", gradTo: "to-cyan-500",
  },
  openai: {
    label: "GPT", emoji: "🤖",
    gradFrom: "from-emerald-500", gradTo: "to-teal-500",
  },
  claude: {
    label: "Claude", emoji: "🧠",
    gradFrom: "from-amber-500", gradTo: "to-orange-500",
  },
};

export default function EditorToolbar({
  visibleColumns,
  onToggleColumn,
  onQuickAddGlossary,
  onBatchReplace,
  onPronounSwitcher,
  onAutoEdit,
  aiEditing,
  onCustomEdit,
  customAIEditing,
  hasCustomAI,
  customAIProvider,
  onOpenSettings,
  onToggleSidebar,
  onSelfTranslate,
  selfTranslating,
  selfTranslateSupported,
  onOpenTranslationSettings,
  activePresetName,
  onOpenImageTranslate,
}) {
  const [showCols, setShowCols] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const colsRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (colsRef.current && !colsRef.current.contains(e.target)) setShowCols(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const preventBlur = (e) => e.preventDefault();
  const provider = PROVIDER_INFO[customAIProvider] || PROVIDER_INFO.gemini;

  return (
    <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/60 backdrop-blur border-b border-violet-100 overflow-x-auto cute-scrollbar">
      {/* Column selector */}
      <div ref={colsRef} className="relative shrink-0">
        <button
          onClick={() => setShowCols((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-medium transition-colors"
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium transition-colors"
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

      <div className="flex-1" />

      {/* Self-translate (built-in dictionary engine, free, 0 network cost) */}
      <button
        onClick={onSelfTranslate}
        disabled={!selfTranslateSupported || selfTranslating}
        title={
          selfTranslateSupported
            ? "Tự dịch văn bản gốc → QT thô bằng từ điển Hán-Việt (miễn phí, chạy tại chỗ)"
            : "Tự dịch tự thân hiện chỉ hỗ trợ nguồn tiếng Trung"
        }
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {selfTranslating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Languages className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Tự dịch</span>
      </button>

      {/* Auto Edit (built-in InvokeLLM) */}
      <button
        onClick={onAutoEdit}
        disabled={aiEditing || customAIEditing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0"
        title="Tự động edit bằng AI nền tảng"
      >
        {aiEditing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
        Auto Edit
      </button>

      {/* Custom AI (Gemini / GPT / Claude) */}
      {hasCustomAI ? (
        <button
          onClick={onCustomEdit}
          disabled={customAIEditing || aiEditing}
          title={`Edit bằng ${provider.label}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r ${provider.gradFrom} ${provider.gradTo} hover:opacity-90 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0`}
        >
          {customAIEditing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span className="text-sm leading-none">{provider.emoji}</span>
          )}
          {provider.label}
        </button>
      ) : (
        <button
          onClick={onOpenSettings}
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
  );
}