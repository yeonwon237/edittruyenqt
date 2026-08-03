import { forwardRef, useImperativeHandle, useRef } from "react";
import { X, FileText, WandSparkles, PenLine, Pencil, Eye } from "lucide-react";
import { highlightTerms, highlightForeignChars } from "@/lib/highlight";

const EditorPanel = forwardRef(function EditorPanel(
  {
    title,
    variant = "source",
    value,
    onChange,
    mode = "view",
    onToggleMode,
    terms = [],
    onTermClick,
    onScroll,
    placeholder = "",
    extra,
    flagForeignChars = false,
    onHide,
  },
  ref
) {
  const scrollRef = useRef(null);
  const panelMeta = {
    source: { Icon: FileText, label: "Nguồn", tone: "text-slate-500 bg-slate-100" },
    draft: { Icon: WandSparkles, label: "Chuyển ngữ", tone: "text-blue-600 bg-blue-50" },
    final: { Icon: PenLine, label: "Thành phẩm", tone: "text-violet-600 bg-violet-50" },
  }[variant] || { Icon: FileText, label: "Văn bản", tone: "text-slate-500 bg-slate-100" };
  const PanelIcon = panelMeta.Icon;

  useImperativeHandle(ref, () => ({
    getScrollElement: () => scrollRef.current,
    getScrollTop: () => scrollRef.current?.scrollTop || 0,
    setScrollTop: (v) => {
      if (scrollRef.current) scrollRef.current.scrollTop = v;
    },
    getScrollHeight: () => scrollRef.current?.scrollHeight || 0,
    getClientHeight: () => scrollRef.current?.clientHeight || 0,
  }));

  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-[1.25rem] bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_40px_-34px_rgba(15,23,42,.35)] overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${panelMeta.tone}`}><PanelIcon className="h-4 w-4" /></span>
          <div className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{title}</span><span className="block text-[10px] font-medium uppercase tracking-[.12em] text-slate-400">{panelMeta.label}</span></div>
        </div>
        <div className="flex items-center gap-1.5">
          {extra}
          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-500 hover:text-violet-600 transition-colors border border-violet-100"
            >
              {mode === "view" ? <><Pencil className="h-3 w-3" /> Sửa</> : <><Eye className="h-3 w-3" /> Xem</>}
            </button>
          )}
          {onHide && (
            <button
              onClick={onHide}
              className="p-1 rounded-lg bg-white/70 hover:bg-white text-slate-400 hover:text-red-500 transition-colors border border-violet-100"
              title={`Ẩn cột ${title} (bấm nút Cột trên toolbar để hiện lại)`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "view" ? (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto cute-scrollbar p-5 panel-scroll bg-slate-50/20"
          >
            <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700 min-h-full">
              {value ? (
                flagForeignChars ? (
                  highlightForeignChars(highlightTerms(value, terms, onTermClick))
                ) : (
                  highlightTerms(value, terms, onTermClick)
                )
              ) : (
                <span className="text-slate-300 italic">{placeholder}</span>
              )}
            </div>
          </div>
        ) : (
          <textarea
            ref={scrollRef}
            onScroll={onScroll}
            value={value || ""}
            onChange={(e) => onChange?.(e.target.value)}
            className="h-full w-full resize-none overflow-y-auto cute-scrollbar p-5 bg-slate-50/20 text-[15px] leading-8 text-slate-700 focus:outline-none placeholder:text-slate-300 font-body"
            placeholder={placeholder}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
});

export default EditorPanel;
