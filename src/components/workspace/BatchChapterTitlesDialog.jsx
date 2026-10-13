import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { planBatchChapterTitles } from "@/lib/batchChapterTitles";

export default function BatchChapterTitlesDialog({ open, onOpenChange, chapters, onApply }) {
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState(String(Math.max(1, chapters.length)));
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStart("1");
    setEnd(String(Math.max(1, chapters.length)));
    setText("");
    setSaving(false);
    setSaveError("");
  }, [open, chapters.length]);

  const result = useMemo(
    () => planBatchChapterTitles(chapters, { start: Number(start), end: Number(end), text }),
    [chapters, end, start, text]
  );
  const hasInput = text.trim().length > 0;
  const preview = result.plan.slice(0, 5);

  const handleApply = async () => {
    if (result.error || result.plan.length === 0) return;
    setSaving(true);
    setSaveError("");
    try {
      await onApply(result.plan);
      onOpenChange(false);
    } catch (error) {
      setSaveError(error?.message || "Không thể lưu tên chương.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <ClipboardPaste className="h-4 w-4" /> Nhập tên chương hàng loạt
          </DialogTitle>
          <DialogDescription>
            Chọn khoảng chương rồi dán tiêu đề, mỗi dòng ứng với một chương. Ứng dụng sẽ tạo tên theo mẫu
            “Chương số: Tiêu đề”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto cute-scrollbar space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              Từ chương
              <Input
                type="number"
                min="1"
                step="1"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={saving}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              Đến chương
              <Input
                type="number"
                min="1"
                step="1"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Danh sách tiêu đề
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={saving}
              rows={10}
              className="font-mono text-sm resize-y"
              placeholder={"Gặp nhau dưới mưa\nBí mật trong căn phòng\nLời hứa năm ấy"}
            />
          </label>

          <div className={`rounded-xl border p-3 text-sm ${
            hasInput && result.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-violet-100 bg-violet-50/60 text-slate-600"
          }`}>
            {hasInput && result.error ? (
              <p>{result.error}</p>
            ) : (
              <p>
                Khoảng đã chọn cần <strong>{result.expected}</strong> tiêu đề; đã nhập{" "}
                <strong>{result.lines.length}</strong> dòng không trống.
              </p>
            )}
          </div>

          {preview.length > 0 && (
            <div className="rounded-xl border border-violet-100 overflow-hidden">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-700 bg-violet-50">
                Xem trước {result.plan.length} thay đổi
              </p>
              <div className="divide-y divide-violet-50">
                {preview.map((item) => (
                  <div key={item.id} className="px-3 py-2 text-sm">
                    <p className="text-slate-400 line-through truncate">{item.oldTitle}</p>
                    <p className="font-medium text-slate-700 truncate">{item.title}</p>
                  </div>
                ))}
                {result.plan.length > preview.length && (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    …và {result.plan.length - preview.length} chương tiếp theo
                  </p>
                )}
              </div>
            </div>
          )}

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button
            onClick={handleApply}
            disabled={saving || !hasInput || Boolean(result.error) || result.plan.length === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ClipboardPaste className="h-4 w-4 mr-1.5" />}
            {saving ? "Đang lưu..." : `Điền ${result.plan.length} tên chương`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
