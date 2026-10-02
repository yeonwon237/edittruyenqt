import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { spaceParagraphs } from "@/lib/paragraphSpacing";

export default function ParagraphSpacingDialog({ open, onOpenChange, chapters, onLoad, onSave }) {
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [previewId, setPreviewId] = useState("");
  const [undo, setUndo] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const selectedCount = chapters.filter(ch => selected.has(ch.id)).length;
  const allSelected = chapters.length > 0 && selectedCount === chapters.length;
  const changeSelection = (next) => { setSelected(next); setPreview(null); setMessage(""); };

  const loadPreview = async () => {
    setBusy(true);
    setMessage("");
    try {
      const rows = await onLoad(chapters.filter(ch => selected.has(ch.id)).map(ch => ch.id));
      const changes = rows.map(ch => ({ id: ch.id, title: ch.title, before: ch.edited || "", after: spaceParagraphs(ch.edited) }));
      setPreview(changes);
      setPreviewId(changes.find(ch => ch.before !== ch.after)?.id || changes[0]?.id || "");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const run = async (restore = false) => {
    setBusy(true);
    const rows = restore ? undo : preview.filter(ch => ch.before !== ch.after);
    const succeeded = [];
    const failed = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(`${i + 1}/${rows.length}: ${row.title}`);
      try {
        await onSave(row.id, restore ? row.after : row.before, restore ? row.before : row.after);
        succeeded.push(row);
      } catch (error) { failed.push({ row, error: error.message }); }
    }
    if (restore) setUndo(failed.map(item => item.row));
    else if (succeeded.length) setUndo(succeeded);
    setPreview(null);
    setMessage(`Đã ${restore ? "hoàn tác" : "giãn đoạn"} ${succeeded.length} chương.${failed.length ? ` ${failed.length} chương chưa lưu: ${failed[0].row.title} — ${failed[0].error}` : ""}`);
    setProgress("");
    setBusy(false);
  };
  const sample = preview?.find(ch => ch.id === previewId);
  const changedCount = preview?.filter(ch => ch.before !== ch.after).length || 0;

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) { setPreview(null); onOpenChange(value); } }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Giãn đoạn Bản Edit</DialogTitle>
          <DialogDescription>Thêm một dòng trống giữa các đoạn đã xuống dòng. Giữ khoảng cách đã có. Văn bản liền một đoạn cần được tách đoạn trước.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <Button variant="outline" disabled={busy || !chapters.length} onClick={() => changeSelection(allSelected ? new Set() : new Set(chapters.map(ch => ch.id)))}>
            {allSelected ? "Bỏ chọn tất cả" : "Chọn cả truyện"} ({selectedCount}/{chapters.length})
          </Button>
          <div className="max-h-48 overflow-y-auto rounded border p-2">
            {chapters.map(ch => <label key={ch.id} className="flex items-center gap-2 p-2 text-sm">
              <input type="checkbox" disabled={busy} checked={selected.has(ch.id)} onChange={() => {
                const next = new Set(selected);
                if (next.has(ch.id)) next.delete(ch.id); else next.add(ch.id);
                changeSelection(next);
              }} />
              <span className="truncate">{ch.title}</span>
            </label>)}
          </div>
          {preview && <div className="space-y-2">
            <p className="text-sm">{changedCount} chương cần giãn đoạn; {preview.length - changedCount} chương trống hoặc đã có khoảng cách phù hợp.</p>
            <select aria-label="Chương xem trước" value={previewId} onChange={event => setPreviewId(event.target.value)} className="w-full border rounded p-2 bg-background">
              {preview.map(ch => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
            </select>
            {sample && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[["Trước", sample.before], ["Sau", sample.after]].map(([label, text]) => <div key={label}>
                <p className="text-sm font-medium mb-1">{label}</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed border rounded p-3 h-48 overflow-y-auto">{text || "(Bản Edit trống)"}</pre>
              </div>)}
            </div>}
          </div>}
          <p role="status" className="text-sm">{busy ? progress || "Đang tải nội dung…" : message}</p>
          {undo.length > 0 && <Button variant="outline" disabled={busy} onClick={() => run(true)}>Hoàn tác lần giãn gần nhất ({undo.length} chương)</Button>}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => { setPreview(null); onOpenChange(false); }}>Đóng</Button>
          <Button variant="outline" disabled={busy || !selectedCount} onClick={loadPreview}>Xem trước</Button>
          <Button disabled={busy || !changedCount} onClick={() => run()}>Giãn đoạn {changedCount} chương</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
