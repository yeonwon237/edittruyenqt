import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Search, Trash2 } from 'lucide-react';
import { chapterLengthWarning } from '@/lib/chapterEditStats';

// Search box + chapter list, shared by the popover ChapterPicker (web) and
// the persistent desktop sidebar (src/components/desktop/AppSidebar.jsx) —
// same data, same rendering, just a different container around it.
export function ChapterListBody({ chapters, currentChapterId, onSelect, wordCounts, averageWords, editedSampleSize, editedChapterIds, qaIssueIds, betaIssueIds, afterSelect, autoFocusSearch = true, listClassName = '', onDeleteChapter }) {
  const [query, setQuery] = useState('');
  const listRef = useRef(null);
  const currentOptionRef = useRef(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const filtered = useMemo(() => chapters.filter(chapter => !normalizedQuery || String(chapter.title || '').toLocaleLowerCase('vi').includes(normalizedQuery)), [chapters, normalizedQuery]);
  const chapterNumbers = useMemo(() => new Map(chapters.map((chapter, index) => [chapter.id, index + 1])), [chapters]);

  useEffect(() => {
    if (normalizedQuery || !currentOptionRef.current || !listRef.current) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const option = currentOptionRef.current;
      if (!list || !option) return;
      list.scrollTop = Math.max(0, option.offsetTop - (list.clientHeight - option.offsetHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [normalizedQuery, currentChapterId]);

  return <>
    <div className="shrink-0 border-b border-slate-100 p-3 dark:border-white/10">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:bg-white dark:border-white/10 dark:bg-white/5 dark:focus-within:border-violet-500 dark:focus-within:bg-white/10">
        <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <input autoFocus={autoFocusSearch} value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tiêu đề chương…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none dark:text-slate-200 dark:placeholder:text-slate-500" />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">{filtered.length}/{chapters.length} chương · Trung bình {averageWords ? averageWords.toLocaleString('vi-VN') : 0} chữ/chương đã edit</p>
    </div>
    <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto p-1 ${listClassName}`} role="listbox">
      {filtered.map((chapter) => {
        const wordCount = wordCounts[chapter.id] || 0;
        const warning = chapterLengthWarning(wordCount, averageWords, editedSampleSize);
        const hasEdit = editedChapterIds.has(chapter.id);
        const row = <button ref={chapter.id === currentChapterId ? currentOptionRef : null} key={chapter.id} type="button" role="option" aria-selected={chapter.id === currentChapterId} onClick={() => { onSelect(chapter.id); afterSelect?.(); }} className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${onDeleteChapter ? 'pr-9 ' : ''}${chapter.id === currentChapterId ? 'bg-violet-100 ring-1 ring-violet-300 dark:bg-violet-500/20 dark:ring-violet-500/40' : hasEdit ? 'bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}>
          <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-slate-400 dark:text-slate-500">{chapterNumbers.get(chapter.id)}</span>
          {hasEdit ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
          <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${hasEdit ? 'font-semibold text-emerald-950 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>{qaIssueIds.has(chapter.id) ? '⚠ ' : ''}{betaIssueIds.has(chapter.id) ? '✍ ' : ''}{chapter.title}</span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs"><span className={hasEdit ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>{hasEdit ? (wordCount ? `Đã edit · ${wordCount.toLocaleString('vi-VN')} chữ` : 'Đã edit') : 'Chưa có Bản edit'}</span>{warning && <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400" title={`Trung bình truyện là ${averageWords.toLocaleString('vi-VN')} chữ`}><AlertTriangle className="h-3.5 w-3.5" />{warning.label}</span>}</span></span>
        </button>;
        if (!onDeleteChapter) return row;
        // Delete sits beside the row (not inside it — no nested buttons),
        // shown on hover and always on the open chapter.
        return <div key={chapter.id} className="group relative">
          {row}
          <button type="button" onClick={() => onDeleteChapter(chapter)} title="Xóa chương này (các chương sau tự lùi số)" className={`absolute right-1.5 top-2 rounded-md p-1.5 text-slate-400 transition hover:bg-red-100 hover:text-red-600 focus:opacity-100 dark:hover:bg-red-500/15 dark:hover:text-red-400 ${chapter.id === currentChapterId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>;
      })}
      {!filtered.length && <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-500">Không tìm thấy chương phù hợp.</p>}
    </div>
  </>;
}

export default function ChapterPicker({ chapters, currentChapterId, onSelect, wordCounts, averageWords, editedSampleSize, editedChapterIds, qaIssueIds, betaIssueIds, onOpen }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = chapters.find(chapter => chapter.id === currentChapterId);

  useEffect(() => {
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <div ref={rootRef} className="relative shrink-0">
    <button type="button" onClick={() => setOpen(value => { const next = !value; if (next) onOpen?.(); return next; })} className="flex max-w-[230px] items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/15" aria-haspopup="listbox" aria-expanded={open}>
      <span className="truncate">{current?.title || 'Chọn chương'}</span><ChevronDown className="h-4 w-4 shrink-0 text-violet-300" />
    </button>
    {open && <div className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] top-[68px] z-[80] flex w-auto flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl md:absolute md:bottom-auto md:left-auto md:right-0 md:top-full md:mt-2 md:block md:w-[min(440px,calc(100vw-24px))]">
      <ChapterListBody
        chapters={chapters}
        currentChapterId={currentChapterId}
        onSelect={onSelect}
        wordCounts={wordCounts}
        averageWords={averageWords}
        editedSampleSize={editedSampleSize}
        editedChapterIds={editedChapterIds}
        qaIssueIds={qaIssueIds}
        betaIssueIds={betaIssueIds}
        afterSelect={() => { setOpen(false); }}
        listClassName="md:max-h-[60vh]"
      />
    </div>}
  </div>;
}
