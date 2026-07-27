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

export default function BatchReplaceDialog({
  open,
  onOpenChange,
  project,
  onUpdateProject,
  onApply,
}) {
  const [rules, setRules] = useState([]);
  const [target, setTarget] = useState("edited");

  useEffect(() => {
    if (open) {
      setRules(project?.batch_rules || [{ find: "", replace: "" }]);
      setTarget("edited");
    }
  }, [open, project]);

  const updateRule = (i, field, value) => {
    setRules((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  };

  const addRule = () => {
    setRules((prev) => [...prev, { find: "", replace: "" }]);
  };

  const removeRule = (i) => {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleApply = async () => {
    await onUpdateProject({ batch_rules: rules });
    onApply(rules, target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-violet-100">
        <DialogHeader>
          <DialogTitle className="text-amber-600 flex items-center gap-2">
            🔄 Thay thế hàng loạt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[50vh] overflow-y-auto cute-scrollbar">
          <p className="text-xs text-slate-500">
            Lập danh sách các từ QT thô/sượng cần sửa mượt. Bấm "Áp dụng" để tự
            động thay thế toàn bộ chương.
          </p>

          {rules.length === 0 && (
            <p className="text-center text-sm text-slate-300 py-4">
              Chưa có quy tắc nào. Bấm "Thêm quy tắc" để bắt đầu.
            </p>
          )}

          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={rule.find}
                onChange={(e) => updateRule(i, "find", e.target.value)}
                placeholder="Từ cần thay"
                className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
              />
              <span className="text-slate-300 text-xs">→</span>
              <input
                value={rule.replace}
                onChange={(e) => updateRule(i, "replace", e.target.value)}
                placeholder="Thay bằng"
                className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
              />
              <button
                onClick={() => removeRule(i)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <button
            onClick={addRule}
            className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm quy tắc
          </button>

          <div className="pt-2 border-t border-violet-100">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Áp dụng vào cột
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              <option value="edited">Cột 3: Bản Edit</option>
              <option value="qt_raw">Cột 2: QT thô</option>
              <option value="raw_original">Cột 1: Văn bản gốc</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleApply}
            className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white border-0"
          >
            Áp dụng vào chương
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}