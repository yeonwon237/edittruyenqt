import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CATEGORIES, CATEGORY_EMOJI } from "@/lib/highlight";

export default function GlossaryTermForm({
  open,
  onOpenChange,
  project,
  onUpdateProject,
  editingTerm,
  prefillTerm,
  onSave,
}) {
  const [form, setForm] = useState({
    source_term: "",
    translation: "",
    category: "Khác",
    notes: "",
    custom_fields: {},
  });
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [editingFieldLabel, setEditingFieldLabel] = useState({});

  useEffect(() => {
    if (open) {
      if (editingTerm) {
        setForm({
          source_term: editingTerm.source_term || "",
          translation: editingTerm.translation || "",
          category: editingTerm.category || "Khác",
          notes: editingTerm.notes || "",
          custom_fields: { ...(editingTerm.custom_fields || {}) },
        });
      } else {
        setForm({
          source_term: prefillTerm || "",
          translation: "",
          category: "Khác",
          notes: "",
          custom_fields: {},
        });
      }
      setShowFieldManager(false);
      setNewFieldLabel("");
      setEditingFieldLabel({});
    }
  }, [open, editingTerm, prefillTerm]);

  const fieldDefs = project?.custom_field_definitions || [];

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    const newField = {
      name: `field_${Date.now()}`,
      label: newFieldLabel.trim(),
    };
    await onUpdateProject({
      custom_field_definitions: [...fieldDefs, newField],
    });
    setNewFieldLabel("");
  };

  const handleRenameField = async (fieldName, newLabel) => {
    if (!newLabel.trim()) return;
    const updated = fieldDefs.map((f) =>
      f.name === fieldName ? { ...f, label: newLabel.trim() } : f
    );
    await onUpdateProject({ custom_field_definitions: updated });
  };

  const handleDeleteField = async (fieldName) => {
    const updated = fieldDefs.filter((f) => f.name !== fieldName);
    await onUpdateProject({ custom_field_definitions: updated });
  };

  const handleSubmit = () => {
    if (!form.source_term.trim() || !form.translation.trim()) return;
    onSave({
      source_term: form.source_term.trim(),
      translation: form.translation.trim(),
      category: form.category,
      notes: form.notes.trim(),
      custom_fields: form.custom_fields,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-violet-100">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            {editingTerm ? "✏️ Sửa thuật ngữ" : "🌸 Thêm thuật ngữ mới"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto cute-scrollbar pr-1">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Từ gốc
            </label>
            <input
              value={form.source_term}
              onChange={(e) =>
                setForm({ ...form, source_term: e.target.value })
              }
              placeholder="VD: 林动"
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2.5">
            <div>
              <label className="text-xs font-medium text-blue-700 mb-1 block">Cách QA kiểm tra</label>
              <select
                value={form.custom_fields.__qa_mode || (form.category === "Xưng hô" ? "contextual" : "strict")}
                onChange={(e) => setForm({
                  ...form,
                  custom_fields: { ...form.custom_fields, __qa_mode: e.target.value },
                })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-blue-100 bg-white focus:outline-none focus:border-blue-400"
              >
                <option value="strict">Thay bắt buộc — có thể áp dụng tất cả</option>
                <option value="contextual">Theo ngữ cảnh — xét từng vị trí</option>
              </select>
            </div>
            {(form.custom_fields.__qa_mode === "contextual" || (!form.custom_fields.__qa_mode && form.category === "Xưng hô")) && (
              <div>
                <label className="text-xs font-medium text-blue-700 mb-1 block">Các cách thay khác</label>
                <input
                  value={form.custom_fields.__qa_alternatives || ""}
                  onChange={(e) => setForm({
                    ...form,
                    custom_fields: { ...form.custom_fields, __qa_alternatives: e.target.value },
                  })}
                  placeholder="VD: Ta | muội | nàng"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-blue-100 bg-white focus:outline-none focus:border-blue-400"
                />
                <p className="mt-1 text-[10px] text-slate-400">QA sẽ kết hợp danh sách này với Ma trận xưng hô.</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Bản dịch
            </label>
            <input
              value={form.translation}
              onChange={(e) =>
                setForm({ ...form, translation: e.target.value })
              }
              placeholder="VD: Lâm Động"
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Danh mục
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_EMOJI[cat]} {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Ghi chú
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ghi chú thêm về thuật ngữ này..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 resize-none"
            />
          </div>

          {/* Custom fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500">
                Trường tùy chỉnh
              </label>
              <button
                onClick={() => setShowFieldManager(!showFieldManager)}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
              >
                <Pencil className="w-3 h-3" /> Quản lý trường
              </button>
            </div>

            {showFieldManager && (
              <div className="mb-3 p-3 rounded-xl bg-violet-50/50 border border-violet-100 space-y-2">
                {fieldDefs.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">
                    Chưa có trường tùy chỉnh nào
                  </p>
                )}
                {fieldDefs.map((field) => (
                  <div key={field.name} className="flex items-center gap-2">
                    <input
                      value={
                        editingFieldLabel[field.name] !== undefined
                          ? editingFieldLabel[field.name]
                          : field.label
                      }
                      onChange={(e) =>
                        setEditingFieldLabel({
                          ...editingFieldLabel,
                          [field.name]: e.target.value,
                        })
                      }
                      onBlur={() => {
                        if (
                          editingFieldLabel[field.name] !== undefined &&
                          editingFieldLabel[field.name] !== field.label
                        ) {
                          handleRenameField(
                            field.name,
                            editingFieldLabel[field.name]
                          );
                        }
                      }}
                      className="flex-1 px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-400"
                    />
                    <button
                      onClick={() => handleDeleteField(field.name)}
                      className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                  <input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddField()}
                    placeholder="Tên trường mới..."
                    className="flex-1 px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={handleAddField}
                    className="p-1 rounded-md bg-violet-100 hover:bg-violet-200 text-violet-700"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {fieldDefs.map((field) => (
              <div key={field.name} className="mb-2">
                <label className="text-xs text-slate-400 mb-0.5 block">
                  {field.label}
                </label>
                <input
                  value={form.custom_fields[field.name] || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      custom_fields: {
                        ...form.custom_fields,
                        [field.name]: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.source_term.trim() || !form.translation.trim()}
            className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white border-0"
          >
            {editingTerm ? "Cập nhật" : "Thêm mới"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
