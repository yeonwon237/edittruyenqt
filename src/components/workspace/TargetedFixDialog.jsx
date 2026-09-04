import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, ExternalLink, Loader2, OctagonX } from "lucide-react";

// The case the user asked for by name: they read one specific mistake and
// want it fixed everywhere it recurs — not a general beta-read (too broad)
// and not the Ma Trận pronoun checker (needs a structured rule, and this
// correction might not even be about xưng hô). The user just describes the
// error in plain language; AI finds only the matching instances. Results
// route through the same single-chapter BetaReaderDialog as everything
// else here — same review/apply/undo, nothing new to learn.
export default function TargetedFixDialog({
  open,
  onOpenChange,
  report,
  running,
  finished,
  progress,
  errors,
  onStart,
  onStop,
  onOpenChapter,
}) {
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType] = useState("current");
  const [nextCount, setNextCount] = useState(10);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const chapters = report?.chapters || [];

  // Hydrate the textarea from a report already on disk (e.g. reopening
  // after a page reload) — but only ever fills an empty box, never
  // overwrites text the user is actively editing.
  useEffect(() => {
    if (open && report?.description && !description) setDescription(report.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, report]);

  const handleClose = (v) => {
    if (!v && running) return;
    onOpenChange(v);
  };

  const handleStart = () => {
    const scope = scopeType === "current" ? { type: "current" } : scopeType === "next" ? { type: "next", count: Math.max(1, nextCount) } : { type: "all" };
    onStart(description, scope);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto cute-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Target className="w-4 h-4" /> Sửa theo mô tả
          </DialogTitle>
          {!running && (
            <DialogDescription>
              Mô tả MỘT lỗi cụ thể bạn vừa thấy — kèm ví dụ và cách đúng càng rõ càng tốt (VD:
              "Hà đại nương trong lời người kể chuyện phải được gọi là 'bà', không phải 'nàng'").
              AI chỉ tìm và đề xuất sửa đúng loại lỗi này trong phạm vi đã chọn — không đụng gì
              khác. Chỉ đề xuất — <b>không tự sửa Bản Edit</b>.
            </DialogDescription>
          )}
        </DialogHeader>

        {!running && !finished && (
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='VD: "Hà đại nương phải gọi là bà, không phải nàng."'
              rows={3}
              className="w-full rounded-xl border border-violet-100 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400"
            />
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={scopeType === "current"} onChange={() => setScopeType("current")} className="accent-violet-600" />
                Chỉ chương đang mở
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={scopeType === "next"} onChange={() => setScopeType("next")} className="accent-violet-600" />
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={nextCount}
                  onChange={(e) => setNextCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  onFocus={() => setScopeType("next")}
                  className="w-16 rounded-lg border border-violet-100 px-2 py-1 text-sm"
                />
                chương tiếp theo
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={scopeType === "all"} onChange={() => setScopeType("all")} className="accent-violet-600" />
                Toàn truyện
              </label>
            </div>
          </div>
        )}

        {(running || finished) && (
          <div className="space-y-3">
            <div className="w-full h-2.5 rounded-full bg-violet-100 overflow-hidden">
              <div className="h-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — 🔎 {progress.found} có chỗ khớp,{" "}
              {progress.skipped} bỏ qua, {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-violet-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm: {progress.currentTitle}
              </p>
            )}
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-2.5 max-h-32 overflow-y-auto cute-scrollbar">
                <p className="text-xs font-medium text-red-600 mb-1">
                  {errors.length} chương lỗi (giữ nguyên, có thể quét lại sau):
                </p>
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-500 truncate">{e.title}: {e.message}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {!!chapters.length && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">{chapters.length} chương có chỗ khớp — mở từng chương để xem và tự quyết định</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto cute-scrollbar">
              {[...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0)).map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenChapter(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-200"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <b>{c.chapter_order}. {c.title}</b>
                    <small className="block text-slate-400">{c.notes.length} chỗ khớp mô tả</small>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!running && !chapters.length && finished && (
          <div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700">
            AI không tìm thấy chỗ nào khớp mô tả trong phạm vi đã quét.
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={onStop} className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl">
              <OctagonX className="w-3.5 h-3.5 mr-1" /> Dừng
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Đóng</Button>
              <Button onClick={handleStart} disabled={!description.trim()} className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl">
                <Target className="w-3.5 h-3.5 mr-1" />
                {finished ? "Tìm lại" : "Tìm & sửa"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
