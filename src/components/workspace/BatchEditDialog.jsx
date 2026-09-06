import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  OctagonX,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";

const sortChapters = (chapters) =>
  [...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));

export default function BatchEditDialog({
  open,
  onOpenChange,
  chapters = [],
  editedChapterIds = new Set(),
  storyMemory = {},
  learningEnabled = true,
  running,
  finished,
  progress,
  errors,
  onStart,
  onStop,
}) {
  const ordered = useMemo(() => sortChapters(chapters), [chapters]);
  const pendingIds = useMemo(
    () => ordered.filter((chapter) => !editedChapterIds.has(chapter.id)).map((chapter) => chapter.id),
    [ordered, editedChapterIds]
  );
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    if (open && !running) {
      setSelectedIds(new Set(pendingIds));
      setSearch("");
      setOverwriteExisting(false);
    }
    // Initialize only when the dialog is opened; live progress must not reset the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    if (!needle) return ordered;
    return ordered.filter((chapter) =>
      String(chapter.title || "").toLocaleLowerCase("vi").includes(needle)
    );
  }, [ordered, search]);

  const errorIds = new Set(errors.map((error) => error.id).filter(Boolean));
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visible.length > 0 && visible.every((chapter) => selectedIds.has(chapter.id));
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const toggleChapter = (id) => {
    if (running) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    if (running) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((chapter) => next.delete(chapter.id));
      else visible.forEach((chapter) => next.add(chapter.id));
      return next;
    });
  };

  const handleClose = (value) => {
    if (!value && running) return;
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Xưởng Edit AI hàng loạt
          </DialogTitle>
          <DialogDescription>
            Chọn chương rồi bấm Bắt đầu. Mỗi chương được lưu ngay khi hoàn tất; bạn có thể dừng
            và lần sau tiếp tục các chương còn thiếu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Tổng số</p>
            <p className="text-lg font-bold text-slate-700">{ordered.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Đã edit</p>
            <p className="text-lg font-bold text-emerald-700">{ordered.length - pendingIds.length}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Chưa edit</p>
            <p className="text-lg font-bold text-amber-700">{pendingIds.length}</p>
          </div>
          <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">AI đã học</p>
            <p className="text-lg font-bold text-fuchsia-700">
              {(storyMemory.learnedRuleCount || 0) +
                (storyMemory.learnedTermCount || 0) +
                (storyMemory.learnedNarrativeCount || 0)}
            </p>
            <p className="text-[10px] text-slate-400">
              {(storyMemory.candidates || []).length} đề xuất cần thêm bằng chứng
            </p>
          </div>
        </div>

        {(running || finished) && (
          <div className="rounded-xl border border-violet-100 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{progress.done}/{progress.total} chương</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-violet-100 overflow-hidden">
              <div className="h-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              ✨ {progress.edited} hoàn tất · {progress.skipped} bỏ qua · {progress.failed} lỗi
            </p>
            {running && progress.currentTitle && (
              <p className="text-sm text-violet-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress.currentTitle}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={running}
              placeholder="Tìm tên chương..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-400 disabled:bg-slate-50"
            />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set(pendingIds))} disabled={running || pendingIds.length === 0}>
              Chọn chưa edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set(ordered.filter((chapter) => editedChapterIds.has(chapter.id)).map((chapter) => chapter.id)))}
              disabled={running || !learningEnabled || ordered.length === pendingIds.length}
              title={learningEnabled ? "Chọn các chương đã Edit để AI học dữ liệu" : "Bật AI tự học trong Ma trận xưng hô để dùng chức năng này"}
            >
              {learningEnabled ? "Chọn đã edit để học" : "Tự học đã tắt"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set(ordered.map((chapter) => chapter.id)))} disabled={running || ordered.length === 0}>
              Chọn tất cả
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={toggleVisible}
            disabled={running || visible.length === 0}
            className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 disabled:opacity-60"
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${allVisibleSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300"}`}>
              {allVisibleSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>
            {allVisibleSelected ? "Bỏ chọn danh sách đang xem" : "Chọn danh sách đang xem"}
            <span className="ml-auto font-normal text-slate-400">Đã chọn {selectedCount}</span>
          </button>
          {visible.map((chapter, index) => {
            const isEdited = editedChapterIds.has(chapter.id);
            const isSelected = selectedIds.has(chapter.id);
            const isCurrent = running && progress.currentChapterId === chapter.id;
            const hasError = errorIds.has(chapter.id);
            return (
              <button
                type="button"
                key={chapter.id}
                onClick={() => toggleChapter(chapter.id)}
                disabled={running}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 ${isCurrent ? "bg-violet-50" : "hover:bg-white"} disabled:cursor-default`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white"}`}>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
                <span className="w-9 shrink-0 text-right text-xs text-slate-400">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{chapter.title || `Chương ${index + 1}`}</span>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-xs text-violet-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang edit</span>
                ) : hasError ? (
                  <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> Lỗi</span>
                ) : isEdited ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Đã edit</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-slate-400"><Circle className="h-3.5 w-3.5" /> Chưa edit</span>
                )}
              </button>
            );
          })}
          {visible.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Không tìm thấy chương phù hợp.</p>}
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(event) => setOverwriteExisting(event.target.checked)}
            disabled={running}
            className="mt-0.5 accent-violet-600"
          />
          <span>
            <strong className="text-amber-800">Dịch lại chương đã có Bản Edit.</strong> Nếu tắt,
            các chương đã hoàn thành trong vùng chọn sẽ được bỏ qua an toàn.
          </span>
        </label>

        <p className={`rounded-xl border p-3 text-xs ${learningEnabled ? "border-violet-100 bg-violet-50/60 text-violet-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          <strong>{learningEnabled ? "AI tự học đang bật:" : "AI tự học đang tắt:"}</strong>{" "}
          {learningEnabled
            ? "mỗi chương được xử lý sẽ tự cập nhật tên riêng, cặp xưng hô có bằng chứng rõ và ngữ cảnh cho chương kế tiếp."
            : "các chương vẫn được Edit bằng AI và dùng dữ liệu đã học, nhưng không ghi thêm dữ liệu học mới."}
        </p>

        {errors.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50/60 p-3 max-h-24 overflow-y-auto">
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-red-700">
              <AlertCircle className="h-3.5 w-3.5" /> {errors.length} chương lỗi
            </p>
            {errors.map((error, index) => (
              <p key={`${error.id || error.title}-${index}`} className="text-xs text-red-600">
                {error.title}: {error.message}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {running ? (
            <Button variant="outline" onClick={onStop} className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl">
              <OctagonX className="w-3.5 h-3.5 mr-1" /> Dừng sau chương hiện tại
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>Đóng</Button>
              <Button
                onClick={() => onStart([...selectedIds], { overwriteExisting })}
                disabled={selectedCount === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
              >
                {finished ? <RotateCcw className="w-3.5 h-3.5 mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                Bắt đầu {selectedCount} chương
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
