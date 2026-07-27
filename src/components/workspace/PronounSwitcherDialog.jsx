import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export default function PronounSwitcherDialog({
  open,
  onOpenChange,
  project,
  onUpdateProject,
  onApply,
  selectedText,
}) {
  const [rules, setRules] = useState([]);
  const [target, setTarget] = useState("edited");

  useEffect(() => {
    if (open) {
      setRules(project?.pronoun_rules || []);
      setTarget("edited");
    }
  }, [open, project]);

  const updateRule = (i, field, value) => {
    setRules((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  };

  const updateWords = (i, field, value) => {
    const words = value
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w);
    setRules((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: words } : r))
    );
  };

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { name: "Quy tắc mới", from_words: [], to_words: [] },
    ]);
  };

  const removeRule = (i) => {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    await onUpdateProject({ pronoun_rules: rules });
  };

  const handleApplyRule = async (rule) => {
    await onUpdateProject({ pronoun_rules: rules });
    onApply(rule, target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-violet-100">
        <DialogHeader>
          <DialogTitle className="text-violet-600 flex items-center gap-2">
            👥 Đổi đại từ xưng hô
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto cute-scrollbar">
          <div className="p-2.5 rounded-xl bg-violet-50/60 border border-violet-100 text-xs text-violet-600">
            {selectedText ? (
              <span>
                ✅ Đã bôi đen đoạn văn. Quy tắc sẽ áp dụng cho đoạn đã chọn.
              </span>
            ) : (
              <span>
                💡 Bôi đen một đoạn trong bản edit trước khi mở hộp này để chỉ áp
                dụng cho đoạn đó. Không bôi đen = áp dụng toàn bộ chương.
              </span>
            )}
          </div>

          {rules.length === 0 && (
            <div className="text-center text-sm text-slate-300 py-4">
              <p>Chưa có quy tắc nào.</p>
              <p className="text-xs mt-1">VD: from "Hắn, Ta" → to "Huynh, Muội"</p>
            </div>
          )}

          {rules.map((rule, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-violet-50/50 border border-violet-100 space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  value={rule.name}
                  onChange={(e) => updateRule(i, "name", e.target.value)}
                  placeholder="Tên quy tắc"
                  className="flex-1 px-2 py-1 text-sm font-medium rounded-lg border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-300"
                />
                <button
                  onClick={() => removeRule(i)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-slate-400">
                    Từ cũ (phẩy ngăn cách)
                  </label>
                  <input
                    value={(rule.from_words || []).join(", ")}
                    onChange={(e) =>
                      updateWords(i, "from_words", e.target.value)
                    }
                    placeholder="Hắn, Ta"
                    className="w-full px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-300"
                  />
                </div>
                <span className="text-violet-300 text-sm pb-1.5">→</span>
                <div className="flex-1">
                  <label className="text-xs text-slate-400">Từ mới</label>
                  <input
                    value={(rule.to_words || []).join(", ")}
                    onChange={(e) =>
                      updateWords(i, "to_words", e.target.value)
                    }
                    placeholder="Huynh, Muội"
                    className="w-full px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-300"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleApplyRule(rule)}
                className="w-full bg-violet-100 hover:bg-violet-200 text-violet-700 border-0"
              >
                {selectedText ? "Áp dụng cho đoạn đã chọn" : "Áp dụng toàn bộ"}
              </Button>
            </div>
          ))}

          <button
            onClick={addRule}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm quy tắc xưng hô
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button variant="outline" onClick={handleSave}>
            Lưu tất cả
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}