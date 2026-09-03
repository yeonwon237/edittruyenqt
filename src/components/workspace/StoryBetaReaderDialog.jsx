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
import { MessageSquareText, ExternalLink, Loader2, OctagonX } from "lucide-react";

// Whole-story counterpart of BetaReaderDialog: loops the same free-form
// reading across "toàn truyện" or "N chương tiếp theo" from the chapter
// currently open. Suggestions only, same as the single-chapter version —
// each chapter is opened and applied through the normal BetaReaderDialog,
// so there's deliberately no "apply all" shortcut here: these are reading
// notes meant to be read, not blind find/replace rules safe to bulk-apply.
export default function StoryBetaReaderDialog({
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
  const [scopeType, setScopeType] = useState("next");
  const [nextCount, setNextCount] = useState(10);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const chapters = report?.chapters || [];

  const handleClose = (v) => {
    if (!v && running) return;
    onOpenChange(v);
  };

  const handleStart = () => {
    onStart(scopeType === "next" ? { type: "next", count: Math.max(1, nextCount) } : { type: "all" });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto cute-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-indigo-700 flex items-center gap-2">
            <MessageSquareText className="w-4 h-4" /> Beta reader AI — nhiều chương
          </DialogTitle>
          {!running && (
            <DialogDescription>
              AI đọc lần lượt nhiều chương như một beta reader thật, không chỉ đối chiếu luật.
              Chỉ đề xuất — <b>không tự sửa Bản Edit</b>. Không có nút "áp dụng tất cả": đây là
              nhận xét đọc hiểu, không phải quy tắc thay thế an toàn để sửa hàng loạt — mở từng
              chương để xem và tự quyết định từng chỗ.
              <br />
              <br />
              Tốn quota AI và có thể mất khá lâu với nhiều chương. Có thể bấm Dừng bất cứ lúc
              nào — các chương đã đọc xong vẫn giữ nguyên góp ý.
            </DialogDescription>
          )}
        </DialogHeader>

        {!running && !finished && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={scopeType === "next"} onChange={() => setScopeType("next")} className="accent-indigo-600" />
              <input
                type="number"
                min={1}
                max={200}
                value={nextCount}
                onChange={(e) => setNextCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                onFocus={() => setScopeType("next")}
                className="w-16 rounded-lg border border-indigo-100 px-2 py-1 text-sm"
              />
              chương tiếp theo từ chương đang mở
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={scopeType === "all"} onChange={() => setScopeType("all")} className="accent-indigo-600" />
              Toàn truyện
            </label>
          </div>
        )}

        {(running || finished) && (
          <div className="space-y-3">
            <div className="w-full h-2.5 rounded-full bg-indigo-100 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              {progress.done}/{progress.total} chương — 🔎 {progress.found} có góp ý,{" "}
              {progress.skipped} bỏ qua, {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-indigo-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc: {progress.currentTitle}
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
            <p className="text-xs font-semibold text-slate-600">{chapters.length} chương có góp ý — mở từng chương để xem và tự quyết định</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto cute-scrollbar">
              {[...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0)).map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenChapter(c.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-200"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <b>{c.chapter_order}. {c.title}</b>
                    <small className="block text-slate-400">{c.notes.length} chỗ AI góp ý</small>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!running && !chapters.length && finished && (
          <div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700">
            AI không tìm thấy chỗ nào đáng góp ý thêm.
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
              <Button onClick={handleStart} className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 rounded-xl">
                <MessageSquareText className="w-3.5 h-3.5 mr-1" />
                {finished ? "Đọc lại" : "Bắt đầu đọc"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
