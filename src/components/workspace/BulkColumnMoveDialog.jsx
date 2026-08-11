import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const COLUMNS = [
  { value: "raw_original", label: "Cột 1: Văn bản gốc" },
  { value: "qt_raw", label: "Cột 2: QT thô" },
  { value: "edited", label: "Cột 3: Bản Edit" },
];

export default function BulkColumnMoveDialog({ open, onOpenChange, totalChapters, onRun, running, undoCount, onUndo }) {
  const [source, setSource] = useState("raw_original");
  const [target, setTarget] = useState("qt_raw");
  const [operation, setOperation] = useState("move");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSource("raw_original");
    setTarget("qt_raw");
    setOperation("move");
    setResult(null);
  }, [open]);

  const run = async () => {
    const next = await onRun({ source, target, operation });
    if (next) setResult(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-violet-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700"><ArrowRightLeft className="h-5 w-5" /> Chuyển dữ liệu giữa các cột</DialogTitle>
          <DialogDescription>Khắc phục trường hợp nhập hàng loạt vào nhầm cột cho toàn bộ {totalChapters} chương.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-500">CỘT NGUỒN
              <select value={source} onChange={(event) => setSource(event.target.value)} className="h-10 rounded-xl border border-violet-100 bg-white px-2 text-sm outline-none focus:border-violet-400">
                {COLUMNS.map((column) => <option key={column.value} value={column.value} disabled={column.value === target}>{column.label}</option>)}
              </select>
            </label>
            <ArrowRightLeft className="mb-3 h-4 w-4 text-violet-400" />
            <label className="grid gap-1 text-xs font-medium text-slate-500">CỘT ĐÍCH
              <select value={target} onChange={(event) => setTarget(event.target.value)} className="h-10 rounded-xl border border-violet-100 bg-white px-2 text-sm outline-none focus:border-violet-400">
                {COLUMNS.map((column) => <option key={column.value} value={column.value} disabled={column.value === source}>{column.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-violet-50 p-1">
            <button onClick={() => setOperation("move")} className={`rounded-lg px-3 py-2 text-xs font-medium ${operation === "move" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>Di chuyển — xóa cột nguồn</button>
            <button onClick={() => setOperation("copy")} className={`rounded-lg px-3 py-2 text-xs font-medium ${operation === "copy" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>Sao chép — giữ cột nguồn</button>
          </div>

          <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Chỉ xử lý chương có cột nguồn chứa dữ liệu và cột đích đang trống. Chương đã có dữ liệu ở cột đích sẽ được bỏ qua, không bao giờ bị ghi đè.</p>
          </div>

          {result && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Đã {operation === "move" ? "di chuyển" : "sao chép"} <strong>{result.changed}</strong> chương. Bỏ qua <strong>{result.emptySource}</strong> chương nguồn trống và <strong>{result.targetOccupied}</strong> chương có cột đích đã chứa dữ liệu.</div>}

          {undoCount > 0 && <button onClick={onUndo} disabled={running} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Hoàn tác lần chuyển gần nhất ({undoCount} chương)</button>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button onClick={run} disabled={running || source === target} className="rounded-xl border-0 bg-violet-600 text-white hover:bg-violet-700">
            {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {running ? "Đang xử lý…" : `${operation === "move" ? "Di chuyển" : "Sao chép"} tất cả chương`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
