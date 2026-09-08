import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, SearchCheck } from "lucide-react";

// Read-only cross-chapter lookup for one glossary term — "which chapters
// have this term, and how many times, in each of the 3 columns" — so a user
// can jump straight to a chapter and eyeball whether an old (pre-glossary)
// translation of it was right, without ever touching the text.
export default function GlossaryTermFindDialog({ open, onOpenChange, term, loading, results, onOpenChapter }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-violet-100">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <SearchCheck className="h-4 w-4" /> Tìm "{term?.source_term}" trong các chương
          </DialogTitle>
          <DialogDescription>
            Chỉ quét, không sửa gì cả. Bấm vào một chương để mở và đối chiếu cả 3 cột.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto cute-scrollbar space-y-1.5 py-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang quét toàn truyện...
            </div>
          ) : !results || results.chapters.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">
              Không tìm thấy "{term?.source_term}" ở chương nào.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 px-0.5">
                Tìm thấy {results.totalMatches} vị trí trong {results.chapters.length} chương.
              </p>
              {results.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => onOpenChapter(chapter.id)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-white/70 px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50 transition-colors"
                >
                  <span className="truncate">{chapter.chapter_order}. {chapter.title}</span>
                  <span className="shrink-0 flex gap-2 text-[11px] text-slate-500">
                    <span title="Cột 1: Văn bản gốc" className="rounded-md bg-slate-100 px-1.5 py-0.5">Gốc {chapter.raw_original}</span>
                    <span title="Cột 2: QT thô" className="rounded-md bg-slate-100 px-1.5 py-0.5">QT {chapter.qt_raw}</span>
                    <span title="Cột 3: Bản Edit" className="rounded-md bg-slate-100 px-1.5 py-0.5">Edit {chapter.edited}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
