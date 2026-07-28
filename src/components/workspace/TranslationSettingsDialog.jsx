import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import { Plus, Trash2, Save } from "lucide-react";

const EMPTY_FORM = { name: "", description: "", prompt_instructions: "", forbidden_words: [] };

export default function TranslationSettingsDialog({
  open,
  onOpenChange,
  presets,
  activePresetId,
  styleToggles,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  onUpdateStyleToggles,
}) {
  const [selectedId, setSelectedId] = useState(activePresetId || "");
  const [form, setForm] = useState(EMPTY_FORM);
  const [toggles, setToggles] = useState(styleToggles || {});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToggles(styleToggles || {});
    const initialId = activePresetId || "";
    setSelectedId(initialId);
    const preset = (presets || []).find((p) => p.id === initialId);
    setForm(
      preset
        ? {
            name: preset.name || "",
            description: preset.description || "",
            prompt_instructions: preset.prompt_instructions || "",
            forbidden_words: preset.forbidden_words || [],
          }
        : EMPTY_FORM
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelectChange = (id) => {
    setSelectedId(id);
    onSelectPreset(id || null);
    const preset = (presets || []).find((p) => p.id === id);
    setForm(
      preset
        ? {
            name: preset.name || "",
            description: preset.description || "",
            prompt_instructions: preset.prompt_instructions || "",
            forbidden_words: preset.forbidden_words || [],
          }
        : EMPTY_FORM
    );
  };

  const handleNewPreset = () => {
    setSelectedId("");
    onSelectPreset(null);
    setForm(EMPTY_FORM);
  };

  const updateRule = (i, field, value) => {
    setForm((prev) => ({
      ...prev,
      forbidden_words: prev.forbidden_words.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    }));
  };
  const addRule = () =>
    setForm((prev) => ({ ...prev, forbidden_words: [...prev.forbidden_words, { find: "", replace: "" }] }));
  const removeRule = (i) =>
    setForm((prev) => ({ ...prev, forbidden_words: prev.forbidden_words.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt_instructions.trim()) return;
    setSaving(true);
    try {
      const saved = await onSavePreset(
        {
          name: form.name.trim(),
          description: form.description.trim(),
          prompt_instructions: form.prompt_instructions.trim(),
          forbidden_words: form.forbidden_words.filter((r) => r.find),
        },
        selectedId || null
      );
      if (saved?.id) {
        setSelectedId(saved.id);
        onSelectPreset(saved.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key) => {
    const next = { ...toggles, [key]: !toggles[key] };
    setToggles(next);
    onUpdateStyleToggles(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto cute-scrollbar rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-violet-700">🎭 Cài đặt dịch thuật</DialogTitle>
            <DialogDescription>
              Preset quy định văn phong/nguyên tắc riêng cho bộ truyện này — được gộp vào prompt AI
              mỗi khi bấm Auto Edit / AI. Công tắc bên dưới áp dụng chung, không phụ thuộc preset.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={selectedId}
                  onChange={(e) => handleSelectChange(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                >
                  <option value="">— Không dùng preset —</option>
                  {(presets || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNewPreset}
                  className="border-violet-200 text-violet-600 rounded-xl shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Preset mới
                </Button>
              </div>

              <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                <div>
                  <label className="text-xs font-medium text-violet-700">Tên preset *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Cổ trang Đại Tề"
                    className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-violet-700">Mô tả ngắn</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="VD: Văn phong cổ trang, xưng hô huynh-muội"
                    className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-violet-700">
                    Văn phong / nguyên tắc dịch (chèn thẳng vào prompt AI) *
                  </label>
                  <textarea
                    value={form.prompt_instructions}
                    onChange={(e) => setForm({ ...form, prompt_instructions: e.target.value })}
                    placeholder={'VD: Dùng văn phong cổ trang điền nhã, tinh tế. Xưng hô "huynh/muội/ta/ngươi", tuyệt đối không dùng từ hiện đại như "ok", "oke", "cute".'}
                    rows={4}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-violet-700 mb-1 block">
                    Từ cấm & thay thế cố định (áp dụng bằng code, không phụ thuộc AI)
                  </label>
                  <div className="space-y-1.5">
                    {form.forbidden_words.map((rule, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={rule.find}
                          onChange={(e) => updateRule(i, "find", e.target.value)}
                          placeholder="Từ cấm (VD: anh)"
                          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                        />
                        <span className="text-slate-300 text-xs">→</span>
                        <input
                          value={rule.replace}
                          onChange={(e) => updateRule(i, "replace", e.target.value)}
                          placeholder="Thay bằng (VD: huynh)"
                          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                        />
                        <button
                          onClick={() => removeRule(i)}
                          className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addRule}
                      className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm từ cấm
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !form.name.trim() || !form.prompt_instructions.trim()}
                    className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" /> {selectedId ? "Lưu thay đổi" : "Tạo preset"}
                  </Button>
                  {selectedId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-500 hover:bg-red-50 rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa preset
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Công tắc văn phong</p>
              <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!toggles.protect_plot}
                  onChange={() => handleToggle("protect_plot")}
                  className="accent-violet-600"
                />
                Bảo vệ cốt truyện (cấm AI tự bịa/thêm bớt chi tiết)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!toggles.declunkify_qt}
                  onChange={() => handleToggle("declunkify_qt")}
                  className="accent-violet-600"
                />
                Lọc từ QT sượng (đảo ngữ, dịch thoát ý thay vì bám sát từng chữ)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!toggles.strip_polite_a}
                  onChange={() => handleToggle("strip_polite_a")}
                  className="accent-violet-600"
                />
                Xóa chữ "ạ" cuối câu thoại (áp dụng bằng code sau khi AI dịch xong)
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Xóa preset "${form.name}"?`}
        description="Các bộ truyện khác đang dùng preset này sẽ không còn áp dụng được nữa."
        confirmLabel="Xóa preset"
        onConfirm={() => {
          onDeletePreset(selectedId);
          setConfirmDelete(false);
          setSelectedId("");
          setForm(EMPTY_FORM);
        }}
      />
    </>
  );
}
