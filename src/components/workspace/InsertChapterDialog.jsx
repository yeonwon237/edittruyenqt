import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { planChapterInsert } from "@/lib/chapterNumbering";

// Asks where to add a chapter: "vị trí 3" makes the new chapter the 3rd in
// the list (defaults to right after the open chapter), previews its title
// and how many later chapters get renumbered, then hands the position back.
export default function InsertChapterDialog({ open, onOpenChange, chapters, currentChapterId, onConfirm }) {
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const index = chapters.findIndex((c) => c.id === currentChapterId);
    setPosition(String(index >= 0 ? index + 2 : chapters.length + 1));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = Math.round(Number(position));
  const valid = Number.isFinite(pos) && pos >= 1 && pos <= chapters.length + 1;
  const plan = useMemo(() => (valid ? planChapterInsert(chapters, pos - 2) : null), [valid, chapters, pos]);
  const above = valid ? chapters[pos - 2] : null;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onConfirm(pos);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <Plus className="h-4 w-4" /> Thêm chương
          </DialogTitle>
          <DialogDescription>
            Nhập số thứ tự chương mới. Các chương từ vị trí đó trở đi tự nhảy số.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-500">
            Thêm làm chương số (1 – {chapters.length + 1})
          </label>
          <input
            type="number"
            autoFocus
            min={1}
            max={chapters.length + 1}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="w-full rounded-xl border border-violet-200 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
          {plan ? (
            <p className="text-xs text-slate-600">
              Chương mới: <b>{plan.title}</b>
              {above ? <> — ngay sau “{above.title}”</> : " — đứng đầu danh sách"}.
              {plan.renames.length > 0 && <> Đánh lại số <b>{plan.renames.length}</b> chương phía sau.</>}
            </p>
          ) : (
            <p className="text-xs text-red-600">Số chương phải từ 1 đến {chapters.length + 1}.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            onClick={submit}
            disabled={!valid || busy}
            className="rounded-xl border-0 bg-violet-600 text-white hover:bg-violet-700"
          >
            {busy ? "Đang thêm..." : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
