import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { X, FileText, WandSparkles, PenLine, Pencil, Eye, Search, ChevronUp, ChevronDown } from "lucide-react";
import { highlightTerms, highlightForeignChars, highlightQualityIssues } from "@/lib/highlight";
import { textToParagraphHtml } from "@/lib/clipboardHtml";
import { findTextMatches } from "@/lib/textSearch";

// A manual select-all + Ctrl+C only ever puts plain text (with \n line
// breaks) on the clipboard, which most rich-text paste targets (Wattpad,
// Google Docs...) collapse to a single run of text with no paragraph
// spacing. Intercepting the copy event lets us also offer an HTML
// alternative with real <p> blocks, so pasting elsewhere keeps the blank
// line between paragraphs.
const handleRichCopy = (event) => {
  const selection = window.getSelection()?.toString();
  if (!selection) return;
  event.preventDefault();
  event.clipboardData.setData("text/plain", selection);
  event.clipboardData.setData("text/html", textToParagraphHtml(selection));
};

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
    qualityIssues = [],
    onIssueClick,
    onHide,
    searchable = false,
  },
  ref
) {
  const scrollRef = useRef(null);
  const panelRef = useRef(null);
  const qaOverlayRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(-1);
  const matches = useMemo(() => findTextMatches(value, searchQuery), [value, searchQuery]);

  // highlightTerms/highlightQualityIssues rebuild a regex over every glossary
  // term (900+ in an active project) and walk the full chapter text — tens to
  // hundreds of ms. Keyed only on [value, terms]/[value, qualityIssues] (not
  // the click callbacks, which change identity every render) so typing in a
  // SIBLING panel, opening the QA dialog, or any other unrelated re-render of
  // the parent Workspace no longer reruns this for panels whose own text
  // didn't change.
  const onTermClickRef = useRef(onTermClick);
  onTermClickRef.current = onTermClick;
  const stableOnTermClick = useMemo(() => (term) => onTermClickRef.current?.(term), []);
  const onIssueClickRef = useRef(onIssueClick);
  onIssueClickRef.current = onIssueClick;
  const stableOnIssueClick = useMemo(() => (items, e) => onIssueClickRef.current?.(items, e), []);

  const termsHighlight = useMemo(
    () => highlightTerms(value, terms, stableOnTermClick),
    [value, terms, stableOnTermClick]
  );
  const qualityHighlight = useMemo(
    () => highlightQualityIssues(value, qualityIssues, { onIssueClick: stableOnIssueClick }),
    [value, qualityIssues, stableOnIssueClick]
  );
  const foreignCharsHighlight = useMemo(
    () => highlightForeignChars(termsHighlight),
    [termsHighlight]
  );
  const editOverlayHighlight = useMemo(
    () => highlightQualityIssues(value || "", qualityIssues, { overlay: true }),
    [value, qualityIssues]
  );
  const panelMeta = {
    source: { Icon: FileText, label: "Nguồn", iconTone: "text-slate-500 dark:text-slate-400" },
    draft: { Icon: WandSparkles, label: "Chuyển ngữ", iconTone: "text-blue-600 dark:text-blue-400" },
    final: { Icon: PenLine, label: "Thành phẩm", iconTone: "text-violet-600 dark:text-violet-300" },
  }[variant] || { Icon: FileText, label: "Văn bản", iconTone: "text-slate-500 dark:text-slate-400" };
  const PanelIcon = panelMeta.Icon;

  useEffect(() => {
    setActiveMatch(matches.length ? 0 : -1);
  }, [searchQuery, matches.length]);

  const selectMatch = (index) => {
    if (!matches.length) return;
    const normalizedIndex = (index + matches.length) % matches.length;
    const match = matches[normalizedIndex];
    const reveal = () => {
      const textarea = panelRef.current?.querySelector("[data-etq-role='edit-content']");
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.focus();
      textarea.setSelectionRange(match.start, match.end);
      const line = String(value || "").slice(0, match.start).split("\n").length;
      textarea.scrollTop = Math.max(0, (line - 4) * 32);
    };
    setActiveMatch(normalizedIndex);
    if (mode === "view") {
      onToggleMode?.();
      window.setTimeout(reveal, 80);
    } else {
      reveal();
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatch(-1);
  };

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
    <div ref={panelRef} data-etq-panel={variant} className="flex-1 flex flex-col min-w-0 rounded-[1.25rem] bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_40px_-34px_rgba(15,23,42,.35)] overflow-hidden dark:bg-[#1e1e1e] dark:border-white/10 dark:shadow-none">
      <div className="shrink-0 flex min-h-9 items-center justify-between px-2.5 py-1 border-b border-slate-100 bg-white md:min-h-0 md:px-3 md:py-1.5 dark:border-white/10 dark:bg-[#1e1e1e]">
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          <PanelIcon className={`h-3.5 w-3.5 shrink-0 ${panelMeta.iconTone}`} />
          <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</span>
        </div>
        <div className="flex w-full min-w-0 items-center gap-0.5 overflow-x-auto pb-0.5 md:w-auto md:overflow-visible md:pb-0">
          {searchable && (
            <button
              onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
              className={`flex h-8 w-8 items-center justify-center transition-colors md:h-6 md:w-6 ${searchOpen ? "text-violet-700 dark:text-violet-300" : "text-slate-400 hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-300"}`}
              title="Tìm câu hoặc đoạn trong Bản Edit"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
          {extra}
          {onToggleMode && (
            <button
              data-etq-role="toggle-mode"
              onClick={onToggleMode}
              className="flex min-h-8 items-center gap-1 px-2 text-sm text-slate-500 transition-colors hover:text-violet-600 md:inline-flex md:min-h-0 md:px-1.5 md:py-0.5 md:text-[11px] dark:text-slate-400 dark:hover:text-violet-300"
            >
              {mode === "view" ? <><Pencil className="h-3 w-3" /> Sửa</> : <><Eye className="h-3 w-3" /> Xem</>}
            </button>
          )}
          {onHide && (
            <button
              onClick={onHide}
              className="hidden h-6 w-6 items-center justify-center text-slate-400 hover:text-red-500 transition-colors md:flex dark:text-slate-500 dark:hover:text-red-400"
              title={`Ẩn cột ${title} (bấm nút Cột trên toolbar để hiện lại)`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {searchable && searchOpen && (
        <div className="shrink-0 flex items-center gap-1.5 border-b border-violet-100 bg-violet-50/50 px-3 py-2 dark:border-white/10 dark:bg-violet-500/5">
          <Search className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                selectMatch(activeMatch + (event.shiftKey ? -1 : 1));
              }
              if (event.key === "Escape") closeSearch();
            }}
            placeholder="Tìm câu hoặc đoạn bị lỗi..."
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-600"
          />
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-500">
            {searchQuery ? (matches.length ? `${activeMatch + 1}/${matches.length}` : "0 kết quả") : ""}
          </span>
          <button onClick={() => selectMatch(activeMatch - 1)} disabled={!matches.length} className="rounded p-1 text-slate-500 hover:bg-white hover:text-violet-700 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-violet-300" title="Kết quả trước">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => selectMatch(activeMatch + 1)} disabled={!matches.length} className="rounded p-1 text-slate-500 hover:bg-white hover:text-violet-700 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-violet-300" title="Kết quả tiếp theo">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={closeSearch} className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-500 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-red-400" title="Đóng tìm kiếm">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {mode === "view" ? (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            onCopy={handleRichCopy}
            className="h-full overflow-y-auto cute-scrollbar p-4 pb-24 panel-scroll bg-slate-50/20 md:p-5 dark:bg-transparent"
          >
            <div data-etq-role="view-content" className="whitespace-pre-wrap text-base leading-8 text-slate-700 min-h-full md:text-[15px] dark:text-slate-300">
              {value ? (
                flagForeignChars ? (
                  qualityIssues.length ? qualityHighlight : foreignCharsHighlight
                ) : (
                  termsHighlight
                )
              ) : (
                <span className="text-slate-300 italic dark:text-slate-600">{placeholder}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full overflow-hidden bg-slate-50/20 dark:bg-transparent">
            {qualityIssues.length > 0 && (
              <pre
                ref={qaOverlayRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 right-[7px] z-20 m-0 overflow-hidden p-4 pb-24 text-base leading-8 text-transparent whitespace-pre-wrap break-words font-body md:p-5 md:text-[15px]"
              >
                {editOverlayHighlight}
              </pre>
            )}
            <textarea
              data-etq-role="edit-content"
              ref={scrollRef}
              onScroll={(event) => {
                if (qaOverlayRef.current) qaOverlayRef.current.scrollTop = event.currentTarget.scrollTop;
                onScroll?.(event);
              }}
              value={value || ""}
              onChange={(e) => onChange?.(e.target.value)}
              className="relative z-10 h-full w-full resize-none overflow-y-auto cute-scrollbar p-4 pb-24 bg-transparent text-base leading-8 text-slate-700 focus:outline-none placeholder:text-slate-300 font-body md:p-5 md:text-[15px] dark:text-slate-300 dark:placeholder:text-slate-600"
              placeholder={placeholder}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default EditorPanel;
