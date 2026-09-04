import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Loader2, Sparkles, Check, X, Undo2, AlertTriangle } from "lucide-react";

// Free-form counterpart to the rule-bound checks (QA, Beta, "Kiểm tra xưng hô
// bằng AI"): the model reads the whole chapter like an actual beta reader
// and can flag anything — not just what a fixed rule or a code-detected
// candidate sentence already narrowed it down to. Every note is a pure
// suggestion; nothing is written to Bản Edit until the user applies one.
export default function BetaReaderDialog({
  open,
  onOpenChange,
  running,
  progress,
  notes,
  onScan,
  onApply,
  onDismiss,
  canUndo,
  onUndo,
  onOpenStoryScan,
  onOpenTargetedFix,
  contextNote,
}) {
  const pct = progress?.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto cute-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-indigo-700 flex items-center gap-2">
            <MessageSquareText className="w-4 h-4" /> Beta reader AI
          </DialogTitle>
          {!notes && !running && (
            <DialogDescription>
              AI đọc toàn bộ chương hiện tại như một biên tập viên thật — không chỉ đối chiếu
              luật hay xưng hô, mà góp ý bất cứ chỗ nào khiến người đọc khựng lại: xưng hô không
              hợp bối cảnh, lời văn gượng gạo, mâu thuẫn tình tiết, lặp ý... Nếu QA đã phát hiện
              vài chỗ, AI dùng đó làm gợi ý để đọc lại kỹ hơn, không bị giới hạn chỉ ở đó. Chỉ đề
              xuất — <b>không tự sửa Bản Edit</b>, bạn xem từng chỗ rồi tự quyết định.
              <br />
              <br />
              Tốn quota AI và có thể mất một lúc với chương dài (chia nhiều đoạn để gọi AI).
            </DialogDescription>
          )}
        </DialogHeader>

        {running && (
          <div className="space-y-2">
            <div className="w-full h-2.5 rounded-full bg-indigo-100 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-indigo-600 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progress.total > 1 ? `Đang đọc đoạn ${progress.done}/${progress.total}...` : "Đang đọc chương..."}
            </p>
          </div>
        )}

        {!running && notes && notes.length === 0 && (
          <div className="rounded-xl bg-emerald-50 p-6 text-center text-emerald-700">
            AI đọc xong, không có gì đáng góp ý thêm.
          </div>
        )}

        {!running && !!notes?.length && (
          <div className="space-y-2.5">
            {contextNote && (
              <p className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700">{contextNote}</p>
            )}
            <p className="text-xs font-semibold text-slate-500">{notes.length} chỗ AI góp ý — mỗi chỗ tự quyết định riêng</p>
            <div className="max-h-[55vh] space-y-2.5 overflow-y-auto cute-scrollbar pr-1">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
                  <blockquote className="border-l-2 border-indigo-200 pl-2.5 text-sm italic text-slate-600">
                    “{note.quote}”
                  </blockquote>
                  <p className="mt-2 text-sm text-slate-700">{note.comment}</p>
                  {note.suggestion && (
                    <p className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-sm text-indigo-700">
                      <span className="font-medium">Đề xuất: </span>{note.suggestion}
                    </p>
                  )}
                  {!note.located && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> Không định vị chính xác trong Bản Edit — tự tìm và sửa thủ công nếu đồng ý.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {note.suggestion && note.located && (
                      <Button
                        size="sm"
                        onClick={() => onApply(note)}
                        className="h-7 rounded-lg bg-indigo-600 px-2.5 text-xs text-white hover:bg-indigo-700"
                      >
                        <Check className="mr-1 h-3 w-3" /> Áp dụng
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDismiss(note.id)}
                      className="h-7 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100"
                    >
                      <X className="mr-1 h-3 w-3" /> Bỏ qua
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {onOpenStoryScan && (
              <Button variant="ghost" onClick={onOpenStoryScan} className="rounded-xl text-indigo-600 hover:bg-indigo-50">
                📚 Quét nhiều chương
              </Button>
            )}
            {onOpenTargetedFix && (
              <Button variant="ghost" onClick={onOpenTargetedFix} className="rounded-xl text-violet-600 hover:bg-violet-50">
                🎯 Sửa theo mô tả
              </Button>
            )}
            {canUndo && (
              <Button variant="outline" onClick={onUndo} className="rounded-xl border-slate-200 text-slate-600">
                <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Hoàn tác AI
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Đóng</Button>
            <Button
              onClick={onScan}
              disabled={running}
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 rounded-xl"
            >
              {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {notes ? "Đọc lại" : "Đọc & góp ý"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
