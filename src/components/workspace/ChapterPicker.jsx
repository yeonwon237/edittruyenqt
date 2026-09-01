import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Search } from 'lucide-react';
import { chapterLengthWarning } from '@/lib/chapterEditStats';

export default function ChapterPicker({ chapters, currentChapterId, onSelect, wordCounts, averageWords, editedSampleSize, qaIssueIds, betaIssueIds }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const currentOptionRef = useRef(null);
  const current = chapters.find(chapter => chapter.id === currentChapterId);
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const filtered = useMemo(() => chapters.filter(chapter => !normalizedQuery || String(chapter.title || '').toLocaleLowerCase('vi').includes(normalizedQuery)), [chapters, normalizedQuery]);
  const chapterNumbers = useMemo(() => new Map(chapters.map((chapter, index) => [chapter.id, index + 1])), [chapters]);

  useEffect(() => {
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!open || normalizedQuery || !currentOptionRef.current || !listRef.current) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const option = currentOptionRef.current;
      if (!list || !option) return;
      list.scrollTop = Math.max(0, option.offsetTop - (list.clientHeight - option.offsetHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, normalizedQuery, currentChapterId]);

  return <div ref={rootRef} className="relative shrink-0">
    <button type="button" onClick={() => setOpen(value => !value)} className="flex max-w-[230px] items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/15" aria-haspopup="listbox" aria-expanded={open}>
      <span className="truncate">{current?.title || 'Chọn chương'}</span><ChevronDown className="h-4 w-4 shrink-0 text-violet-300" />
    </button>
    {open && <div className="absolute right-0 top-full z-[80] mt-2 w-[min(440px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-violet-400 focus-within:bg-white">
          <Search className="h-4 w-4 text-slate-400" />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tiêu đề chương…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />
        </div>
        <p className="mt-2 text-xs text-slate-500">{filtered.length}/{chapters.length} chương · Trung bình {averageWords ? averageWords.toLocaleString('vi-VN') : 0} chữ/chương đã edit</p>
      </div>
      <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-1" role="listbox">
        {filtered.map((chapter) => {
          const wordCount = wordCounts[chapter.id] || 0;
          const warning = chapterLengthWarning(wordCount, averageWords, editedSampleSize);
          const hasEdit = wordCount > 0;
          return <button ref={chapter.id === currentChapterId ? currentOptionRef : null} key={chapter.id} type="button" role="option" aria-selected={chapter.id === currentChapterId} onClick={() => { onSelect(chapter.id); setOpen(false); setQuery(''); }} className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${chapter.id === currentChapterId ? 'bg-violet-100 ring-1 ring-violet-300' : hasEdit ? 'bg-emerald-50/70 hover:bg-emerald-100' : 'hover:bg-slate-50'}`}>
            <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-slate-400">{chapterNumbers.get(chapter.id)}</span>
            {hasEdit ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-slate-300" />}
            <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${hasEdit ? 'font-semibold text-emerald-950' : 'text-slate-700'}`}>{qaIssueIds.has(chapter.id) ? '⚠ ' : ''}{betaIssueIds.has(chapter.id) ? '✍ ' : ''}{chapter.title}</span><span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs"><span className={hasEdit ? 'font-medium text-emerald-700' : 'text-slate-400'}>{hasEdit ? `Đã edit · ${wordCount.toLocaleString('vi-VN')} chữ` : 'Chưa có Bản edit'}</span>{warning && <span className="inline-flex items-center gap-1 font-semibold text-amber-700" title={`Trung bình truyện là ${averageWords.toLocaleString('vi-VN')} chữ`}><AlertTriangle className="h-3.5 w-3.5" />{warning.label}</span>}</span></span>
          </button>;
        })}
        {!filtered.length && <p className="p-6 text-center text-sm text-slate-500">Không tìm thấy chương phù hợp.</p>}
      </div>
    </div>}
  </div>;
}
