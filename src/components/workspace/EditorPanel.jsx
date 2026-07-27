import { forwardRef, useImperativeHandle, useRef } from "react";
import { highlightTerms } from "@/lib/highlight";

const EditorPanel = forwardRef(function EditorPanel(
  {
    title,
    emoji,
    value,
    onChange,
    mode = "view",
    onToggleMode,
    terms = [],
    onTermClick,
    onScroll,
    placeholder = "",
    extra,
  },
  ref
) {
  const scrollRef = useRef(null);

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
    <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white/90 border border-violet-100 shadow-sm overflow-hidden backdrop-blur-sm">
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-violet-100 bg-gradient-to-r from-violet-50/80 to-indigo-50/80">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span>{emoji}</span> {title}
        </span>
        <div className="flex items-center gap-1.5">
          {extra}
          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-500 hover:text-violet-600 transition-colors border border-violet-100"
            >
              {mode === "view" ? "✏️ Sửa" : "👁️ Xem"}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "view" ? (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto cute-scrollbar p-4 panel-scroll"
          >
            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700 min-h-full">
              {value ? (
                highlightTerms(value, terms, onTermClick)
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
            className="h-full w-full resize-none overflow-y-auto cute-scrollbar p-4 bg-transparent text-sm leading-7 text-slate-700 focus:outline-none placeholder:text-slate-300 font-body"
            placeholder={placeholder}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
});

export default EditorPanel;