import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Pencil, Plus, RotateCcw, Sparkles, Loader2, ListChecks, X, SearchCheck, Compass, Bot } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ruleSummary } from "@/lib/pronounMatrix";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import PronounInventoryDialog from "@/components/glossary/PronounInventoryDialog";
import PronounBootstrapDialog from "@/components/glossary/PronounBootstrapDialog";
import StoryPronounAiDialog from "@/components/glossary/StoryPronounAiDialog";

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
  onCheckPronouns,
  checkingPronouns,
  pronounCheckDiff,
  hasPronounCheckPreview,
  onApplyPronounCheck,
  onDiscardPronounCheck,
  pronounInventory,
  scanningPronounInventory,
  onScanPronounInventory,
  onOpenPronounOccurrence,
  pronounBootstrap,
  runningPronounBootstrap,
  onRunPronounBootstrap,
  storyPronounAiReport,
  runningStoryPronounAi,
  storyPronounAiFinished,
  storyPronounAiProgress,
  storyPronounAiErrors,
  onStartStoryPronounAi,
  onStopStoryPronounAi,
  onOpenStoryPronounAiChapter,
  onApplyAllStoryPronounAi,
  applyingStoryPronounAiAll,
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isDefault, setIsDefault] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [storyPronounAiOpen, setStoryPronounAiOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setRules(Array.isArray(project?.contextual_pronoun_rules) ? project.contextual_pronoun_rules : []);
      setEditingIndex(-1);
      setForm(EMPTY_FORM);
      setIsDefault(false);
      setSelectMode(false);
      setSelectedIndices(new Set());
    }
  }, [open, project]);

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIndices(new Set());
  };

  const toggleSelected = (idx) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const next = rules.filter((_, i) => !selectedIndices.has(i));
    setRules(next);
    setSelectedIndices(new Set());
    setSelectMode(false);
    setConfirmBulkDelete(false);
    if (selectedIndices.has(editingIndex)) {
      setEditingIndex(-1);
      setForm(EMPTY_FORM);
      setIsDefault(false);
    }
    await persist(next);
  };

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

  const handleApplyBootstrap = async (rows) => {
    if (!rows.length) return;
    const key = (r) => `${r.speaker.trim().toLocaleLowerCase("vi")}${r.listener.trim().toLocaleLowerCase("vi")}`;
    let next = [...rules];
    rows.forEach((row) => {
      const idx = next.findIndex((r) => key(r) === key(row));
      if (idx >= 0) next[idx] = { ...next[idx], ...row };
      else next = [...next, row];
    });
    setRules(next);
    setBootstrapOpen(false);
    toast({ title: `Đã thêm ${rows.length} quy tắc từ đề xuất khởi tạo` });
    await persist(next);
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
    if (isDefault) {
      const duplicateDefault = rules.findIndex((rule, index) =>
        index !== editingIndex &&
        rule.speaker?.trim().toLocaleLowerCase("vi") === speaker.toLocaleLowerCase("vi") &&
        (!rule.listener?.trim() || rule.listener.trim() === "*")
      );
      if (duplicateDefault >= 0) {
        toast({
          title: `${speaker} đã có quy tắc “Mọi người khác”`,
          description: "Mỗi nhân vật chỉ có một quy tắc mặc định. Hãy sửa quy tắc đang có.",
          variant: "destructive",
        });
        return;
      }
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
            Chọn “Mọi người khác” để tạo quy tắc dự phòng; quy tắc người nghe cụ thể luôn được ưu tiên.
          </DialogDescription>
        </DialogHeader>

        {onRunPronounBootstrap && (
          <button
            type="button"
            onClick={() => { setBootstrapOpen(true); if (!pronounBootstrap && !runningPronounBootstrap) onRunPronounBootstrap(5); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            <Compass className="h-3.5 w-3.5" />
            Khởi tạo Ma Trận từ chương đầu · Không AI
          </button>
        )}

        {onStartStoryPronounAi && (
          <button
            type="button"
            onClick={() => setStoryPronounAiOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <Bot className="h-3.5 w-3.5" />
            Kiểm tra AI xưng hô toàn truyện{storyPronounAiReport?.chapters.length ? ` · ${storyPronounAiReport.chapters.length} chương có đề xuất` : ""}
          </button>
        )}

        {onCheckPronouns && (
          <div className="grid gap-2 sm:grid-cols-2"><button
            onClick={onCheckPronouns}
            disabled={checkingPronouns}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-50 to-pink-50 hover:from-violet-100 hover:to-pink-100 text-violet-700 text-xs font-medium border border-violet-100 transition-colors disabled:opacity-50"
            title="AI chỉ tạo danh sách đề xuất. Bản Edit chỉ thay đổi sau khi bạn xem và bấm Áp dụng đề xuất."
          >
            {checkingPronouns ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {checkingPronouns ? "Đang kiểm tra Bản Edit..." : "Kiểm tra xưng hô bằng AI (chỉ đề xuất)"}
          </button><button type="button" onClick={()=>{setInventoryOpen(true);if(!pronounInventory&&!scanningPronounInventory)onScanPronounInventory?.();}} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><SearchCheck className="h-3.5 w-3.5"/>Bản đồ xưng hô toàn truyện · Không AI</button></div>
        )}

        {pronounCheckDiff && pronounCheckDiff.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              AI đề xuất {pronounCheckDiff.length} thay đổi — Bản Edit chưa bị sửa:
            </p>
            <div className="max-h-48 overflow-y-auto cute-scrollbar space-y-1.5 rounded-lg bg-white/70 p-2">
              {pronounCheckDiff.map((c, i) => (
                <p key={i} className="text-xs text-slate-600 leading-relaxed">
                  <span className="text-slate-400">Dòng {c.line}: </span>
                  {c.before && <span className="text-slate-400">…{c.before} </span>}
                  <span className="line-through text-red-400">{c.removed}</span>
                  {" → "}
                  <span className="text-emerald-600 font-medium">{c.added}</span>
                  {c.after && <span className="text-slate-400"> {c.after}…</span>}
                </p>
              ))}
            </div>
            {hasPronounCheckPreview && (
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onDiscardPronounCheck} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  Bỏ đề xuất
                </button>
                <button type="button" onClick={onApplyPronounCheck} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                  Áp dụng đề xuất
                </button>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-violet-700">Áp dụng khi nói với *</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-violet-100 bg-white p-1">
              <button
                type="button"
                onClick={() => setIsDefault(false)}
                className={`rounded-lg px-3 py-2 text-left transition-colors ${
                  !isDefault ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50"
                }`}
              >
                <span className="block text-xs font-semibold">Một người cụ thể</span>
                <span className={`block text-[10px] ${!isDefault ? "text-violet-100" : "text-slate-400"}`}>
                  Ví dụ: năm người vợ dùng Ta – nàng
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsDefault(true)}
                className={`rounded-lg px-3 py-2 text-left transition-colors ${
                  isDefault ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50"
                }`}
              >
                <span className="block text-xs font-semibold">Mọi người khác (mặc định)</span>
                <span className={`block text-[10px] ${isDefault ? "text-violet-100" : "text-slate-400"}`}>
                  Chỉ dùng khi không khớp người cụ thể
                </span>
              </button>
            </div>
          </div>
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
                placeholder={isDefault ? "Mọi người khác (tự động)" : "VD: Diệp Khinh Thần"}
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

          <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
            Quy tắc cho người cụ thể luôn được ưu tiên. “Mọi người khác” chỉ là phương án dự phòng
            khi QA/AI không tìm thấy người nghe nào khớp quy tắc cụ thể.
          </p>

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
          {rules.length > 0 && (
            <div className="flex items-center gap-2">
              {selectMode ? (
                <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-violet-50 border border-violet-100">
                  <span className="text-xs text-violet-700 font-medium flex-1">
                    Đã chọn {selectedIndices.size}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    disabled={selectedIndices.size === 0}
                    className="text-xs px-2 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Xóa đã chọn
                  </button>
                  <button
                    type="button"
                    onClick={toggleSelectMode}
                    className="p-1 rounded-md hover:bg-violet-100 text-violet-500"
                    title="Thoát chế độ chọn"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
                  title="Chọn nhiều để xóa hàng loạt"
                >
                  <ListChecks className="w-3.5 h-3.5" /> Chọn nhiều
                </button>
              )}
            </div>
          )}
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
                  selectedIndices.has(idx)
                    ? "border-violet-400 bg-violet-50/60"
                    : editingIndex === idx
                    ? "border-violet-400 bg-violet-50"
                    : "border-violet-100 bg-white hover:border-violet-200"
                }`}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIndices.has(idx)}
                    onChange={() => toggleSelected(idx)}
                    className="mt-1 accent-violet-600 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{ruleSummary(r)}</p>
                  {r.note && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{r.note}</p>
                  )}
                  {(!r.listener || r.listener === "*") ? (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600">
                      Mọi người khác · Mặc định
                    </span>
                  ) : (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                      Cụ thể: nói với {r.listener}
                    </span>
                  )}
                </div>
                {!selectMode && (
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
                )}
              </div>
            ))
          )}
        </div>

        <ConfirmDialog
          open={confirmBulkDelete}
          onOpenChange={setConfirmBulkDelete}
          title={`Xóa ${selectedIndices.size} quy tắc đã chọn?`}
          description="AI sẽ không còn áp dụng các quy tắc xưng hô này khi biên tập nữa."
          confirmLabel="Xóa tất cả"
          onConfirm={handleBulkDelete}
        />
        <PronounInventoryDialog open={inventoryOpen} onOpenChange={setInventoryOpen} report={pronounInventory} running={scanningPronounInventory} onScan={onScanPronounInventory} onOpenOccurrence={(item)=>{setInventoryOpen(false);onOpenChange(false);onOpenPronounOccurrence?.(item);}} onUsePair={(group)=>{setForm({...EMPTY_FORM,speaker:group.speaker,listener:group.listener});setIsDefault(false);setEditingIndex(-1);setInventoryOpen(false);}} />
        <PronounBootstrapDialog open={bootstrapOpen} onOpenChange={setBootstrapOpen} report={pronounBootstrap} running={runningPronounBootstrap} onScan={onRunPronounBootstrap} onApply={handleApplyBootstrap} />
        <StoryPronounAiDialog
          open={storyPronounAiOpen}
          onOpenChange={setStoryPronounAiOpen}
          report={storyPronounAiReport}
          running={runningStoryPronounAi}
          finished={storyPronounAiFinished}
          progress={storyPronounAiProgress}
          errors={storyPronounAiErrors}
          onStart={onStartStoryPronounAi}
          onStop={onStopStoryPronounAi}
          onOpenChapter={(chapterId) => { setStoryPronounAiOpen(false); onOpenStoryPronounAiChapter?.(chapterId); }}
          onApplyAll={onApplyAllStoryPronounAi}
          applyingAll={applyingStoryPronounAiAll}
        />

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
