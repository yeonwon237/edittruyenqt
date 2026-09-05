import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { CATEGORY_EMOJI } from "@/lib/highlight";

// AI proposes missing proper names plus address/pronoun vocabulary from the
// current chapter. Nothing is saved until the translator reviews the rows.
export default function DetectNamesDialog({ open, onOpenChange, detecting, candidates, onConfirm }) {
  const [selected, setSelected] = useState({});
  const [edited, setEdited] = useState({});

  useEffect(() => {
    if (candidates) {
      const sel = {};
      candidates.forEach((_, i) => {
        sel[i] = true;
      });
      setSelected(sel);
      setEdited({});
    }
  }, [candidates]);

  const toggle = (i) => setSelected((prev) => ({ ...prev, [i]: !prev[i] }));
  const updateTranslation = (i, value) => setEdited((prev) => ({ ...prev, [i]: value }));

  const handleConfirm = () => {
    const chosen = (candidates || [])
      .map((c, i) => ({
        ...c,
        translation: edited[i] !== undefined ? edited[i] : c.translation,
      }))
      .filter((_, i) => selected[i]);
    onConfirm(chosen);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Phát hiện Glossary bằng AI
          </DialogTitle>
          <DialogDescription>
            AI đọc toàn bộ chương và tìm cả tên riêng lẫn đại từ, danh xưng, cách tự xưng và
            cách gọi chưa có. Hãy sửa bản Việt nếu cần rồi chọn mục muốn thêm vào Glossary.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto cute-scrollbar space-y-2">
          {detecting ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Đang phân tích...
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">
              Không tìm thấy mục mới nào, hoặc tất cả đã có trong Glossary.
            </p>
          ) : (
            candidates.map((c, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                  selected[i] ? "border-violet-300 bg-violet-50/50" : "border-violet-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!selected[i]}
                  onChange={() => toggle(i)}
                  className="accent-violet-600 shrink-0"
                />
                <span
                  className="text-sm text-slate-500 shrink-0 min-w-[64px] truncate"
                  title="Chữ Hán gốc"
                >
                  {c.source_term}
                </span>
                <input
                  value={edited[i] !== undefined ? edited[i] : c.translation}
                  onChange={(e) => updateTranslation(i, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border border-violet-100 focus:outline-none focus:border-violet-400"
                />
                <span className="text-[10px] text-slate-400 shrink-0" title={c.category}>
                  {CATEGORY_EMOJI[c.category] || "📌"}
                </span>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={detecting || !candidates || selectedCount === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
          >
            Thêm {selectedCount} mục vào Glossary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
