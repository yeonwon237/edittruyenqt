import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, OctagonX } from "lucide-react";

export default function BatchEditDialog({
  open,
  onOpenChange,
  totalChapters,
  running,
  finished,
  progress,
  errors,
  onStart,
  onStop,
}) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const handleClose = (v) => {
    if (!v && running) return; // don't let an accidental outside-click/Esc drop a running batch
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Edit AI hàng loạt
          </DialogTitle>
          {!running && !finished && (
            <DialogDescription>
              Tự động chạy AI Edit lần lượt qua {totalChapters} chương trong bộ truyện, dùng
              đúng Glossary, quy tắc thay thế, Ma Trận Xưng Hô và văn phong preset đang cấu hình
              cho bộ truyện — giống hệt khi bấm Edit AI cho từng chương. Chương nào đã có Bản
              Edit sẽ được bỏ qua tự động.
              <br />
              <br />
              Quá trình có thể mất khá lâu (vài giây đến vài chục giây mỗi chương) và tốn quota
              AI của bạn. Bạn có thể bấm Dừng bất cứ lúc nào — các chương đã edit xong vẫn được
              giữ lại, lần sau chạy tiếp sẽ tự bỏ qua chúng.
            </DialogDescription>
          )}
        </DialogHeader>

        {(running || finished) && (
          <div className="space-y-3">
            <div className="w-full h-2.5 rounded-full bg-violet-100 overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — ✨ {progress.edited} đã edit,{" "}
              {progress.skipped} bỏ qua, {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-violet-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý: {progress.currentTitle}
              </p>
            )}
            {finished && !running && (
              <p className="text-sm font-medium text-emerald-600">
                {progress.done >= progress.total ? "Hoàn tất!" : "Đã dừng."} Kiểm tra lại rồi bấm
                Xuất file để tải CSV.
              </p>
            )}
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-2.5 max-h-32 overflow-y-auto cute-scrollbar">
                <p className="text-xs font-medium text-red-600 mb-1">
                  {errors.length} chương lỗi (giữ nguyên, có thể chạy lại sau):
                </p>
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
                onClick={onStart}
                disabled={totalChapters === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {finished ? "Chạy lại (chương còn thiếu)" : `Bắt đầu edit ${totalChapters} chương`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
