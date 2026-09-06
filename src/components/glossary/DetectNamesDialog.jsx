import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { CATEGORIES } from "@/lib/highlight";

export default function DetectNamesDialog({ open, onOpenChange, detecting, candidates, onConfirm,
  progress, warnings = [], saving, onStop, chapterTitle }) {
  const [selected, setSelected] = useState({});
  const [edited, setEdited] = useState({});
  const [filter, setFilter] = useState("proposed");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setSelected({});
    setEdited({});
    setFilter("proposed");
    setQuery("");
  }, [candidates]);
  const update = (index, field, value) => setEdited(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } }));
  const rows = (candidates || []).map((c, index) => ({ ...c, ...edited[index], index }));
  const visible = rows.filter(c => (filter === "all" || (filter === "proposed" ? c.status === "proposed" : c.status !== "proposed")) &&
    `${c.source_term} ${c.translation}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));
  const chosen = rows.filter(c => selected[c.index] && c.translation.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Máy + AI phát hiện Glossary</DialogTitle>
          <DialogDescription>
            {chapterTitle ? `${chapterTitle} · ` : ""}Máy lấy ứng viên, AI kiểm tra rồi đọc lại để tìm thêm. Chỉ lưu mục bạn chọn.
            Mỗi đoạn khoảng 6.000 chữ gọi AI một lần. Xưng hô là cách dịch QT mặc định; khi Edit cần theo quan hệ nhân vật.
          </DialogDescription>
        </DialogHeader>
        {detecting ? <div className="space-y-3 py-8 text-center text-sm text-slate-600" role="status">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          <p>{progress?.label || "Đang quét…"}</p>
          <p>{progress?.machineCount || 0} ứng viên máy · {progress?.done || 0}/{progress?.total || 0} đoạn AI</p>
          <Button variant="outline" onClick={onStop}>Dừng sau lượt hiện tại</Button>
        </div> : <>
          {warnings.length > 0 && <details className="text-xs text-amber-800 bg-amber-50 p-2 rounded" open>
            <summary>{warnings.length} lưu ý — kết quả có thể chưa đầy đủ</summary>
            <ul className="list-disc pl-4 max-h-24 overflow-auto">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>}
          <div className="flex flex-wrap gap-2 text-sm">
            <select aria-label="Lọc kết quả" value={filter} onChange={e => setFilter(e.target.value)} className="border rounded p-2">
              <option value="proposed">AI đề xuất ({rows.filter(c => c.status === "proposed").length})</option>
              <option value="review">Cần xem lại / AI loại ({rows.filter(c => c.status !== "proposed").length})</option>
              <option value="all">Tất cả ({rows.length})</option>
            </select>
            <input aria-label="Tìm thuật ngữ" placeholder="Tìm chữ Hán / bản Việt…" value={query} onChange={e => setQuery(e.target.value)} className="border rounded p-2 flex-1 min-w-0" />
            <Button variant="outline" disabled={saving} onClick={() => setSelected(prev => ({ ...prev,
              ...Object.fromEntries(visible.filter(c => c.translation.trim()).map(c => [c.index, true])) }))}>Chọn mục đang hiện</Button>
            <Button variant="ghost" disabled={saving} onClick={() => setSelected({})}>Bỏ chọn</Button>
          </div>
          <div className="flex-1 overflow-y-auto cute-scrollbar space-y-2 min-h-0">
            {!visible.length && <p className="text-center text-sm text-slate-400 py-8">Không có mục trong nhóm này. Xem nhóm Cần xem lại để kiểm tra ứng viên còn lại.</p>}
            {visible.map(c => <div key={c.index} className={`p-3 rounded-xl border space-y-2 ${selected[c.index] ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Chọn ${c.source_term}`} checked={!!selected[c.index]} disabled={saving} onChange={() => setSelected(prev => ({ ...prev, [c.index]: !prev[c.index] }))} />
                <strong className="text-sm break-all w-24 shrink-0">{c.source_term}</strong>
                <input aria-label={`Bản Việt của ${c.source_term}`} value={c.translation} disabled={saving} onChange={e => update(c.index, "translation", e.target.value)} placeholder="Nhập bản Việt để lưu" className="flex-1 min-w-0 border rounded p-1 text-sm" />
                <select aria-label={`Loại của ${c.source_term}`} value={c.category} disabled={saving} onChange={e => update(c.index, "category", e.target.value)} className="w-24 border rounded p-1 text-xs">
                  {CATEGORIES.map(category => <option key={category}>{category}</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-500">{c.origin} · {c.count} lần · {c.status === "unreviewed" ? "Chưa được AI kiểm tra" : c.status === "rejected" ? "AI đề nghị bỏ" : "AI đề xuất"}{c.confidence > 0 ? ` · AI tự đánh giá ${Math.round(c.confidence * 100)}%` : ""}</p>
              {c.conflict && <p className="text-xs text-amber-700">AI đưa ra nhiều bản dịch, hãy chọn lại: {c.alternatives?.join(" / ")}</p>}
              {(c.evidence || c.reasons?.length > 0) && <p className="text-xs text-slate-600">{c.evidence || c.reasons.join(" · ")}</p>}
              <details className="text-xs text-slate-500"><summary>Xem câu gốc</summary>{c.contexts?.map((context, i) => <p className="mt-1 break-words" key={i}>{context}</p>)}</details>
            </div>)}
          </div>
        </>}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button disabled={detecting || saving || !chosen.length} onClick={() => onConfirm(chosen)} className="bg-violet-600 hover:bg-violet-700 text-white">
            {saving ? "Đang lưu…" : `Lưu ${chosen.length} mục đã chọn`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
