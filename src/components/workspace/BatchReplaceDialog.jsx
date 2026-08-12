import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

export default function BatchReplaceDialog({
  open,
  onOpenChange,
  project,
  onUpdateProject,
  onApply,
  onPreview,
  onUndo,
  canUndo = false,
  busy = false,
}) {
  const [rules, setRules] = useState([]);
  const [target, setTarget] = useState("edited");
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState("chapter");
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (open) {
      setRules(project?.batch_rules || [{ find: "", replace: "" }]);
      setTarget("edited");
      setWholeWord(false);
      setScope("chapter");
      setPreview(null);
    }
  }, [open, project]);

  const updateRule = (i, field, value) => {
    setPreview(null);
    setRules((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r))
    );
  };

  const addRule = () => {
    setPreview(null);
    setRules((prev) => [...prev, { find: "", replace: "" }]);
  };

  const removeRule = (i) => {
    setPreview(null);
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleApply = async () => {
    const validRules = rules.filter((rule) => String(rule.find || "").length > 0);
    if (!validRules.length) return;
    if (scope === "story" && !preview) {
      setScanning(true);
      try {
        setPreview(await onPreview(validRules, target, wholeWord));
      } finally {
        setScanning(false);
      }
      return;
    }
    await onUpdateProject({ batch_rules: rules });
    await onApply(validRules, target, wholeWord, scope);
    if (scope === "chapter") onOpenChange(false);
    else setPreview(null);
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
            Lập danh sách lỗi cần sửa, chọn một chương hoặc toàn bộ truyện. Với
            toàn truyện, hệ thống luôn quét và cho xem trước trước khi sửa.
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

          <div className="pt-2 border-t border-violet-100 space-y-2">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Phạm vi kiểm tra
            </label>
            <select
              value={scope}
              onChange={(e) => { setScope(e.target.value); setPreview(null); }}
              className="px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              <option value="chapter">Chương đang mở</option>
              <option value="story">Toàn bộ truyện</option>
            </select>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Áp dụng vào cột
            </label>
            <select
              value={target}
              onChange={(e) => { setTarget(e.target.value); setPreview(null); }}
              className="px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              <option value="edited">Cột 3: Bản Edit</option>
              <option value="qt_raw">Cột 2: QT thô</option>
              <option value="raw_original">Cột 1: Văn bản gốc</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => { setWholeWord(e.target.checked); setPreview(null); }}
                className="accent-amber-500"
              />
              Chỉ khớp nguyên từ (tránh thay nhầm bên trong từ khác)
            </label>
          </div>

          {scope === "story" && preview && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-slate-600">
              <p className="font-semibold text-amber-700">
                Tìm thấy {preview.totalMatches} vị trí trong {preview.chapters.length} chương
              </p>
              {preview.chapters.length > 0 ? (
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto cute-scrollbar">
                  {preview.chapters.map((chapter) => (
                    <div key={chapter.id} className="flex justify-between gap-3">
                      <span className="truncate">{chapter.chapter_order}. {chapter.title}</span>
                      <b className="shrink-0">{chapter.count} lỗi</b>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-1">Không có chương nào cần thay đổi.</p>}
              <p className="mt-2 text-[10px] text-slate-400">Đây chỉ là kết quả quét. Chưa có nội dung nào bị sửa.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {canUndo && (
            <Button variant="outline" disabled={busy} onClick={onUndo} className="mr-auto">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Hoàn tác toàn truyện
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleApply}
            disabled={busy || scanning || (scope === "story" && preview?.totalMatches === 0)}
            className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white border-0"
          >
            {(busy || scanning) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : scope === "story" && !preview ? <Search className="mr-1.5 h-4 w-4" /> : null}
            {scope === "chapter" ? "Áp dụng vào chương" : preview ? "Áp dụng toàn truyện" : "Quét toàn truyện"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
