import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenText, ChevronLeft, ChevronRight, Eye, PenLine, SlidersHorizontal } from "lucide-react";

export default function MobileReadingEditor({
  open,
  projectTitle,
  chapter,
  chapters,
  onChange,
  onClose,
  onSelectChapter,
}) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [editing, setEditing] = useState(false);
  const chapterIndex = chapters.findIndex((item) => item.id === chapter?.id);
  const previous = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const next = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
  const paragraphs = useMemo(
    () => String(chapter?.edited || "").split(/\n\s*\n/).filter((item) => item.trim()),
    [chapter?.edited]
  );

  useEffect(() => {
    if (!open || editing || !controlsVisible) return undefined;
    const timer = window.setTimeout(() => setControlsVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [controlsVisible, editing, open, chapter?.id]);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  if (!open || !chapter) return null;

  const changeChapter = (target) => {
    if (!target) return;
    setEditing(false);
    setControlsVisible(true);
    onSelectChapter(target.id);
  };

  return (
    <section className="fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-[#fbf7ef] text-[#302a25] md:hidden">
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[#fbf7ef] via-[#fbf7ef]/95 to-transparent px-3 pb-8 pt-[max(.75rem,env(safe-area-inset-top))] transition-all duration-300 ${controlsVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}`}>
        <div className="pointer-events-auto flex h-12 items-center gap-2 rounded-2xl border border-[#ded4c5] bg-white/85 px-1.5 shadow-lg backdrop-blur-xl">
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#756b61] active:bg-[#eee7dc]" aria-label="Thoát chế độ đọc">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[.14em] text-[#9a8d7e]">{projectTitle}</p>
            <p className="truncate text-sm font-semibold text-[#3c342d]">{chapter.title}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#9b6b54]"><BookOpenText className="h-5 w-5" /></span>
        </div>
      </div>

      {editing ? (
        <textarea
          autoFocus
          data-etq-role="mobile-reading-editor"
          value={chapter.edited || ""}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setControlsVisible(true)}
          className="h-full w-full resize-none border-0 bg-transparent px-6 pb-28 pt-20 font-serif text-[18px] leading-[1.9] tracking-[.005em] text-[#302a25] outline-none"
          placeholder="Bản edit hoàn chỉnh sẽ hiện ở đây..."
          spellCheck={false}
        />
      ) : (
        <article
          onClick={(event) => {
            if (window.getSelection?.()?.toString().trim()) return;
            if (event.target.closest("button")) return;
            setControlsVisible((visible) => !visible);
          }}
          className="h-full overflow-y-auto px-6 pb-32 pt-16 overscroll-contain"
        >
          <header className="mb-9 pt-5 text-center">
            <p className="line-clamp-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9a8d7e]">{projectTitle}</p>
            <h1 className="mt-2 font-serif text-[1.7rem] font-semibold leading-tight text-[#2f2924]">{chapter.title}</h1>
            <div className="mx-auto mt-4 flex items-center justify-center gap-2 text-[#a47b62]" aria-hidden="true">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#bda58f]" />
              <span className="text-[8px]">◆</span>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#bda58f]" />
            </div>
          </header>
          <div className="font-serif text-[18px] leading-[1.9] tracking-[.005em] text-[#39322c]">
            {paragraphs.length ? paragraphs.map((paragraph, index) => (
              <p key={index} className="mb-6">{paragraph}</p>
            )) : <p className="text-center italic text-[#a99d90]">Chương này chưa có Bản Edit.</p>}
          </div>
          <div className="mx-auto mt-10 flex max-w-44 items-center gap-3 pb-4 text-[#b39882]" aria-hidden="true">
            <span className="h-px flex-1 bg-[#d8cbbd]" /><span className="text-[9px]">◆</span><span className="h-px flex-1 bg-[#d8cbbd]" />
          </div>
        </article>
      )}

      <nav className={`absolute inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-4 gap-1 rounded-[1.25rem] border border-[#ded4c5] bg-white/92 p-1.5 shadow-[0_18px_50px_rgba(61,48,36,.2)] backdrop-blur-xl transition-all duration-300 ${controlsVisible ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"}`} aria-label="Điều khiển đọc và edit">
        <button type="button" onClick={() => changeChapter(previous)} disabled={!previous} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[#756b61] active:bg-[#eee7dc] disabled:opacity-25"><ChevronLeft className="h-5 w-5" /><span>Chương trước</span></button>
        <button type="button" onClick={() => { setEditing((value) => !value); setControlsVisible(true); }} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#7c4d38] text-[10px] font-bold text-white shadow-sm active:bg-[#633b2b]">{editing ? <Eye className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}<span>{editing ? "Đọc lại" : "Sửa trực tiếp"}</span></button>
        <button type="button" onClick={onClose} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[#756b61] active:bg-[#eee7dc]"><SlidersHorizontal className="h-5 w-5" /><span>Công cụ</span></button>
        <button type="button" onClick={() => changeChapter(next)} disabled={!next} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-[#756b61] active:bg-[#eee7dc] disabled:opacity-25"><ChevronRight className="h-5 w-5" /><span>Chương sau</span></button>
      </nav>
    </section>
  );
}
