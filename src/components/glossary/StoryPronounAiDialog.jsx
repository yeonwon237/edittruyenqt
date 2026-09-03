import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, ExternalLink, Loader2, OctagonX } from "lucide-react";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";

// Whole-story counterpart of the single-chapter "Kiểm tra xưng hô bằng AI":
// runs the same AI call chapter by chapter, but only ever stores the
// resulting diffs (never writes Bản Edit) — the user opens a chapter to see
// the real diff and apply it there (the existing, already-trusted flow), or
// confirms the bulk shortcut once they've seen enough to trust it.
export default function StoryPronounAiDialog({
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
  onApplyAll,
  applyingAll,
}) {
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const chapters = report?.chapters || [];

  const handleClose = (v) => {
    if (!v && running) return;
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-blue-700 flex items-center gap-2">
            <Bot className="w-4 h-4" /> Kiểm tra AI xưng hô toàn truyện
          </DialogTitle>
          {!running && (
            <DialogDescription>
              AI đọc từng chương, tự xác định người nói/người nghe từ ngữ cảnh và đối chiếu
              Ma Trận Xưng Hô — chính xác hơn nhiều so với quét bằng luật, vì luật chỉ đoán
              người nói dựa vào khoảng cách chữ. Chỉ đề xuất, <b>không tự sửa Bản Edit</b> —
              bạn mở từng chương để xem diff thật rồi mới quyết định áp dụng.
              <br />
              <br />
              Tốn quota AI của bạn và có thể mất khá lâu (mỗi chương dài có thể cần vài lượt
              gọi AI). Có thể bấm Dừng bất cứ lúc nào — các chương đã quét xong vẫn giữ nguyên
              đề xuất.
            </DialogDescription>
          )}
        </DialogHeader>

        {(running || finished) && (
          <div className="space-y-3">
            <div className="w-full h-2.5 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — 🔎 {progress.found} có đề xuất,{" "}
              {progress.skipped} bỏ qua, {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-blue-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang xử lý: {progress.currentTitle}
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">{chapters.length} chương có đề xuất — mở từng chương để duyệt diff thật trước khi áp dụng</p>
              <Button
                size="sm"
                variant="outline"
                disabled={running || applyingAll}
                onClick={() => setConfirmApplyAll(true)}
                className="border-blue-200 text-blue-700 hover:bg-blue-50 shrink-0"
              >
                {applyingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Áp dụng tất cả {chapters.length} chương
              </Button>
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto cute-scrollbar">
              {[...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0)).map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenChapter(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-200"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <b>{c.chapter_order}. {c.title}</b>
                    <small className="block text-slate-400">{c.diff.length} chỗ AI đề xuất sửa</small>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!running && !chapters.length && finished && (
          <div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700">
            AI không tìm thấy chỗ nào cần sửa thêm.
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
              <Button onClick={onStart} className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl">
                <Bot className="w-3.5 h-3.5 mr-1" />
                {finished ? "Quét lại toàn truyện" : "Bắt đầu kiểm tra AI toàn truyện"}
              </Button>
            </>
          )}
        </DialogFooter>

        <ConfirmDialog
          open={confirmApplyAll}
          onOpenChange={setConfirmApplyAll}
          title={`Áp dụng đề xuất AI cho ${chapters.length} chương?`}
          description="Sẽ ghi đè Bản Edit của các chương này theo đề xuất AI. Có thể hoàn tác ngay sau đó bằng nút Hoàn tác thay hàng loạt trong Trung tâm QA."
          confirmLabel="Áp dụng tất cả"
          destructive={false}
          onConfirm={() => { setConfirmApplyAll(false); onApplyAll(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
