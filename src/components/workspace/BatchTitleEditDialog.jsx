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
import { Languages, Loader2, OctagonX } from "lucide-react";

// Companion to BatchEditDialog (content), but for chapter TITLES: lets the
// user pick which chapters' titles get sent to AI (default: all checked,
// since most of the time that's what's wanted, but the user explicitly
// asked to be able to narrow it down — not everyone wants every chapter
// retitled in one go). Re-running after a stop/error just re-picks from the
// same checklist, no "already done" skip logic like the content batch has,
// since a title has no separate "AI already touched this" marker to check.
export default function BatchTitleEditDialog({
  open,
  onOpenChange,
  chapters,
  running,
  finished,
  progress,
  errors,
  onStart,
  onStop,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (open) setSelectedIds(new Set(chapters.map((c) => c.id)));
  }, [open, chapters]);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const allSelected = chapters.length > 0 && selectedIds.size === chapters.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(chapters.map((c) => c.id)));
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = (v) => {
    if (!v && running) return; // don't let an accidental outside-click/Esc drop a running batch
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Languages className="w-4 h-4" /> Dịch tên chương bằng AI
          </DialogTitle>
          {progress.total === 0 && !running && (
            <DialogDescription>
              Chọn những chương muốn AI dịch/làm sạch tên (giữ nguyên số thứ tự ở đầu, chỉ dịch
              phần tiêu đề phía sau). Sau khi xong vẫn sửa tay được từng tên trong "Quản lý chương"
              nếu AI dịch chưa đúng.
            </DialogDescription>
          )}
        </DialogHeader>

        {!running && (
          <>
            <button
              onClick={toggleAll}
              className="text-xs text-violet-600 hover:underline text-left shrink-0"
            >
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"} ({selectedIds.size}/{chapters.length})
            </button>
            <div className="flex-1 overflow-y-auto cute-scrollbar -mx-1 px-1 space-y-1 min-h-0">
              {chapters.map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-violet-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(ch.id)}
                    onChange={() => toggleOne(ch.id)}
                    className="accent-violet-600 shrink-0"
                  />
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{ch.title}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {progress.total > 0 && (
          <div className="space-y-3 shrink-0">
            <div className="w-full h-2.5 rounded-full bg-violet-100 overflow-hidden">
              <div className="h-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — ✨ {progress.edited} đã dịch,{" "}
              {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-violet-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý: {progress.currentTitle}
              </p>
            )}
            {finished && !running && (
              <p className="text-sm font-medium text-emerald-600">
                {progress.done >= progress.total ? "Hoàn tất!" : "Đã dừng."} Kiểm tra lại tên chương,
                sửa tay nếu cần.
              </p>
            )}
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-2.5 max-h-32 overflow-y-auto cute-scrollbar">
                <p className="text-xs font-medium text-red-600 mb-1">{errors.length} chương lỗi:</p>
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-500 truncate">
                    {e.title}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button
              variant="outline"
              onClick={onStop}
              className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl"
            >
              <OctagonX className="w-3.5 h-3.5 mr-1" /> Dừng
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Đóng
              </Button>
              <Button
                onClick={() => onStart([...selectedIds])}
                disabled={selectedIds.size === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
              >
                <Languages className="w-3.5 h-3.5 mr-1" />
                {finished ? `Dịch lại (${selectedIds.size} chương)` : `Dịch ${selectedIds.size} tên chương`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
