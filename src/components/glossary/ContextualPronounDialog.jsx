import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Pencil, Plus, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ruleSummary } from "@/lib/pronounMatrix";

const EMPTY_FORM = {
  speaker: "",
  listener: "",
  self_word: "",
  target_word: "",
  note: "",
};

export default function ContextualPronounDialog({
  open,
  onOpenChange,
  project,
  onUpdateProject,
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (open) {
      setRules(Array.isArray(project?.contextual_pronoun_rules) ? project.contextual_pronoun_rules : []);
      setEditingIndex(-1);
      setForm(EMPTY_FORM);
      setIsDefault(false);
    }
  }, [open, project]);

  const upsertRule = (newRule, idx) => {
    let next;
    if (idx >= 0) {
      next = rules.map((r, i) => (i === idx ? newRule : r));
    } else {
      next = [...rules, newRule];
    }
    setRules(next);
  };

  const persist = async (next) => {
    try {
      await onUpdateProject({ contextual_pronoun_rules: next });
    } catch (e) {
      toast({ title: "Lỗi lưu ma trận", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const speaker = form.speaker.trim();
    const selfWord = form.self_word.trim();
    const targetWord = form.target_word.trim();
    if (!speaker) {
      toast({ title: "Vui lòng nhập tên nhân vật nói", variant: "destructive" });
      return;
    }
    if (!selfWord || !targetWord) {
      toast({ title: "Vui lòng nhập đầy đủ cách xưng / cách gọi", variant: "destructive" });
      return;
    }
    const listener = isDefault ? "*" : form.listener.trim();
    if (!isDefault && !listener) {
      toast({ title: "Vui lòng nhập người nghe hoặc chọn mặc định", variant: "destructive" });
      return;
    }
    const newRule = { speaker, listener, self_word: selfWord, target_word: targetWord, note: form.note.trim() };

    const next =
      editingIndex >= 0
        ? rules.map((r, i) => (i === editingIndex ? newRule : r))
        : [...rules, newRule];
    setRules(next);
    setEditingIndex(-1);
    setForm(EMPTY_FORM);
    setIsDefault(false);
    await persist(next);
  };

  const handleEdit = (idx) => {
    const r = rules[idx];
    setForm({
      speaker: r.speaker || "",
      listener: r.listener && r.listener !== "*" ? r.listener : "",
      self_word: r.self_word || "",
      target_word: r.target_word || "",
      note: r.note || "",
    });
    setIsDefault(!r.listener || r.listener === "*");
    setEditingIndex(idx);
  };

  const handleDelete = async (idx) => {
    const next = rules.filter((_, i) => i !== idx);
    setRules(next);
    if (editingIndex === idx) {
      setEditingIndex(-1);
      setForm(EMPTY_FORM);
      setIsDefault(false);
    }
    await persist(next);
  };

  const handleCancelEdit = () => {
    setEditingIndex(-1);
    setForm(EMPTY_FORM);
    setIsDefault(false);
  };

  // Collect existing character names (from speaker/listener) for autocomplete suggestions.
  const nameOptions = Array.from(
    new Set(
      rules.flatMap((r) => [r.speaker, r.listener].filter((n) => n && n !== "*"))
    )
  ).sort((a, b) => a.localeCompare(b, "vi"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto cute-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            🗣️ Ma Trận Xưng Hô theo Cảnh
          </DialogTitle>
          <DialogDescription>
            Thiết lập cách xưng hô theo từng cặp Nhân vật nói ↔ Người nghe. AI Gemini sẽ
            tự nhận diện người nói — người nghe trong từng câu thoại để áp dụng đúng đại từ.
            Người nghe để trống / chọn "Mặc định" nghĩa là quy tắc chung cho mọi người.
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-violet-700">Người nói (Nhân vật) *</label>
              <input
                list="pronoun-char-names"
                value={form.speaker}
                onChange={(e) => setForm({ ...form, speaker: e.target.value })}
                placeholder="VD: Lâm Mộc Châu"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-violet-700">Người nghe (Nhân vật)</label>
              <input
                list="pronoun-char-names"
                value={form.listener}
                disabled={isDefault}
                onChange={(e) => setForm({ ...form, listener: e.target.value })}
                placeholder={isDefault ? "Mặc định cho mọi người" : "VD: Diệp Khinh Thần"}
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300 disabled:opacity-60"
              />
              <datalist id="pronoun-char-names">
                {nameOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-violet-700">Xưng là *</label>
              <input
                value={form.self_word}
                onChange={(e) => setForm({ ...form, self_word: e.target.value })}
                placeholder="VD: Ta / Ta / Bản tọa"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-violet-700">Gọi đối phương là *</label>
              <input
                value={form.target_word}
                onChange={(e) => setForm({ ...form, target_word: e.target.value })}
                placeholder="VD: Nàng / Ngươi / Các ngươi"
                className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-violet-700">Ghi chú (tuỳ chọn)</label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="VD: Khi tức giận dùng 'Ngươi' thay cho 'Nàng'"
              className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="accent-violet-600"
            />
            Quy tắc MẶC ĐỊNH (áp dụng cho mọi đối thoại với tất cả mọi người).
            Bỏ tick nếu chỉ dùng với một nhân vật cụ thể.
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {editingIndex >= 0 ? "Cập nhật" : "Thêm quy tắc"}
            </button>
            {editingIndex >= 0 && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3 py-1.5 rounded-lg bg-white border border-violet-200 hover:bg-violet-50 text-slate-600 text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Huỷ chỉnh sửa
              </button>
            )}
          </div>
        </form>

        {/* List of rules */}
        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              <p className="text-2xl mb-1">🗣️</p>
              <p>Chưa có quy tắc nào. Thêm ma trận xưng hô ở trên để AI áp dụng chính xác.</p>
            </div>
          ) : (
            rules.map((r, idx) => (
              <div
                key={idx}
                className={`group flex items-start justify-between gap-2 p-3 rounded-xl border transition-colors ${
                  editingIndex === idx
                    ? "border-violet-400 bg-violet-50"
                    : "border-violet-100 bg-white hover:border-violet-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{ruleSummary(r)}</p>
                  {r.note && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{r.note}</p>
                  )}
                  {(!r.listener || r.listener === "*") ? (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
                      Mặc định
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                      Cụ thể: nói với {r.listener}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleEdit(idx)}
                    className="p-1 rounded-md hover:bg-violet-50 text-slate-400 hover:text-violet-600"
                    title="Sửa"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(idx)}
                    className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"
                    title="Xoá"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="pt-2">
          <p className="text-xs text-slate-400 mr-auto max-w-md">
            💡 Mẹo: Thiết lập quy tắc mặc định cho mỗi nhân vật (hộp chọn "Mặc định"),
            rồi thêm các ngoại lệ riêng bằng cách bỏ tick và chỉ định người nghe. Khi AI
            biên tập, nó sẽ phân tích từng câu thoại để chọn quy tắc đúng.
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm"
          >
            Xong
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}