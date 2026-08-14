import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, OctagonX } from "lucide-react";

export default function BatchBetaAiDialog({
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
    if (!v && running) return;
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-fuchsia-700 flex items-center gap-2">
            <Bot className="w-4 h-4" /> AI Beta hàng loạt
          </DialogTitle>
          {!running && !finished && (
            <DialogDescription>
              Chạy lần lượt "AI xem câu khó" (giống nút trong Beta từng chương) qua tất cả{" "}
              {totalChapters} chương đã có Bản Edit. Gợi ý của AI được lưu lại — lần sau mở Beta
              từng chương, các câu AI đã nghi ngờ sẽ có sẵn để bạn duyệt ngay, không cần bấm AI
              lại từng chương một.
              <br />
              <br />
              Quá trình có thể mất khá lâu và tốn quota AI của bạn. Có thể bấm Dừng bất cứ lúc
              nào — các chương đã xong vẫn giữ nguyên gợi ý.
            </DialogDescription>
          )}
        </DialogHeader>

        {(running || finished) && (
          <div className="space-y-3">
            <div className="w-full h-2.5 rounded-full bg-fuchsia-100 overflow-hidden">
              <div
                className="h-full bg-fuchsia-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — 🔎 {progress.found} có gợi ý,{" "}
              {progress.skipped} bỏ qua, {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-fuchsia-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý: {progress.currentTitle}
              </p>
            )}
            {finished && !running && (
              <p className="text-sm font-medium text-emerald-600">
                {progress.done >= progress.total ? "Hoàn tất!" : "Đã dừng."} Mở từng chương trong
                danh sách "Chương cần Beta" để duyệt gợi ý của AI.
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
                className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white border-0 rounded-xl"
              >
                <Bot className="w-3.5 h-3.5 mr-1" />
                {finished ? "Chạy lại (tất cả chương)" : `Bắt đầu AI Beta ${totalChapters} chương`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
