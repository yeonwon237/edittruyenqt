import { useEffect, useState } from "react";
import { Eraser, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function QtCleanupDialog({ open, onOpenChange, totalChapters, onScan, onApply, onUndo, undoCount, running }) {
  const [scan, setScan] = useState(null);
  useEffect(() => { if (open) setScan(null); }, [open]);
  const scanNow = async () => setScan(await onScan());
  const apply = async () => { const result = await onApply(scan); if (result) setScan({ ...scan, applied:true }); };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg rounded-2xl border-violet-100">
      <DialogHeader><DialogTitle className="flex items-center gap-2 text-violet-700"><Eraser className="h-5 w-5" /> Dọn dấu chia Phần trong QT</DialogTitle><DialogDescription>Quét toàn bộ {totalChapters} chương và chỉ xóa khối rác do tool tải tạo trong cột QT thô.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Chỉ xóa đúng khối <strong>===== / Phần số / =====</strong>. Mọi dòng bắt đầu bằng <strong>Chương</strong>, Bản gốc và Bản edit luôn được giữ nguyên.</p></div>
        {!scan && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Bấm Quét trước. Chưa có dữ liệu nào bị thay đổi.</p>}
        {scan && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          Tìm thấy <strong>{scan.totalBlocks}</strong> khối rác trong <strong>{scan.chapters.length}</strong> chương.
          {scan.chapters.length > 0 && <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg bg-white/70 p-2">{scan.chapters.slice(0,50).map((item)=><p key={item.id}>{item.title}: {item.removed} khối</p>)}{scan.chapters.length > 50 && <p>…và {scan.chapters.length - 50} chương khác</p>}</div>}
          {scan.applied && <p className="mt-2 font-semibold text-emerald-700">Đã áp dụng thành công.</p>}
        </div>}
        {undoCount > 0 && <button onClick={onUndo} disabled={running} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Hoàn tác lần dọn gần nhất ({undoCount} chương)</button>}
      </div>
      <DialogFooter><Button variant="ghost" onClick={()=>onOpenChange(false)}>Đóng</Button><Button onClick={scanNow} disabled={running} variant="outline" className="rounded-xl">{running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Quét toàn truyện</Button><Button onClick={apply} disabled={running || !scan?.chapters?.length || scan.applied} className="rounded-xl bg-violet-600 text-white hover:bg-violet-700">Áp dụng xóa</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
