import { useState } from "react";
import { CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";

function ProgressBar({ value, total, color }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1 overflow-hidden bg-slate-200 dark:bg-white/10">
      <div className={`h-full transition-all ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function WorkflowProgress({
  total,
  editedCount,
  qaCount,
  betaCount,
  qaNeedsRecheck,
  betaNeedsRecheck,
  editedThrough,
  qaThrough,
  betaThrough,
  currentQaStatus,
  currentBetaStatus,
  markingQa,
  markingBeta,
  onMarkQa,
  onMarkBeta,
  onNextEdit,
  onNextQa,
  onNextBeta,
  onRefresh,
  refreshing,
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const editPercent = total ? Math.round((editedCount / total) * 100) : 0;
  const qaPercent = total ? Math.round((qaCount / total) * 100) : 0;
  const betaPercent = total ? Math.round((betaCount / total) * 100) : 0;
  return (
    <section className="shrink-0 border-b border-slate-200 bg-white/95 px-3 py-1 shadow-sm backdrop-blur md:px-4 dark:border-white/10 dark:bg-[#252526] dark:shadow-none">
      <button
        type="button"
        onClick={() => setMobileExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 text-left md:hidden"
        aria-expanded={mobileExpanded}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
            <span>Tiến độ công việc</span>
            <span className="text-violet-700 dark:text-violet-300">Edit {editPercent}% · QA {qaPercent}% · Beta {betaPercent}%</span>
          </span>
          <span className="mt-1.5 grid grid-cols-3 gap-1">
            <ProgressBar value={editedCount} total={total} color="bg-violet-500" />
            <ProgressBar value={qaCount} total={total} color="bg-emerald-500" />
            <ProgressBar value={betaCount} total={total} color="bg-fuchsia-500" />
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${mobileExpanded ? "rotate-180" : ""}`} />
      </button>
      <div className={`${mobileExpanded ? "flex" : "hidden"} flex-wrap items-center gap-3 border-t border-slate-100 pt-2 md:flex md:gap-3 md:border-0 md:pt-0 dark:border-white/10`}>
        <div className="min-w-[110px] flex-1" title={`Liên tục: ${editedThrough || "chưa có"}`}>
          <div className="mb-0.5 text-[10px] text-slate-500 dark:text-slate-400">Edit {editPercent}%</div>
          <ProgressBar value={editedCount} total={total} color="bg-violet-500" />
        </div>
        <div className="min-w-[110px] flex-1" title={`Liên tục: ${qaThrough || "chưa có"}`}>
          <div className="mb-0.5 text-[10px] text-slate-500 dark:text-slate-400">QA {qaPercent}%</div>
          <ProgressBar value={qaCount} total={total} color="bg-emerald-500" />
        </div>
        <div className="min-w-[110px] flex-1" title={`Liên tục: ${betaThrough || "chưa có"}`}>
          <div className="mb-0.5 text-[10px] text-slate-500 dark:text-slate-400">Beta {betaPercent}%</div>
          <ProgressBar value={betaCount} total={total} color="bg-fuchsia-500" />
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500 dark:text-slate-500 md:w-auto">
          {qaNeedsRecheck > 0 && <span className="text-amber-600 dark:text-amber-400">{qaNeedsRecheck} cần kiểm lại</span>}
          {betaNeedsRecheck > 0 && <span className="text-fuchsia-600 dark:text-fuchsia-400">{betaNeedsRecheck} cần Beta lại</span>}
          <button onClick={onNextEdit} className="hover:text-violet-600 hover:underline dark:hover:text-violet-300">Edit tiếp</button>
          <button onClick={onNextQa} className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-300">QA tiếp</button>
          <button onClick={onNextBeta} className="hover:text-fuchsia-600 hover:underline dark:hover:text-fuchsia-300">Beta tiếp</button>
          <button onClick={onMarkQa} disabled={currentQaStatus === "done" || markingQa} className={`inline-flex items-center gap-0.5 disabled:cursor-wait ${currentQaStatus === "done" ? "text-emerald-600 dark:text-emerald-400" : "hover:text-slate-800 hover:underline dark:hover:text-slate-200"}`}>
            {currentQaStatus === "done" && <CheckCircle2 className="h-3 w-3" />}
            {markingQa ? "Đang lưu QA…" : currentQaStatus === "done" ? "Đã kiểm QA" : currentQaStatus === "stale" ? "Xác nhận kiểm lại" : "Đánh dấu đã QA"}
          </button>
          <button onClick={onMarkBeta} disabled={currentBetaStatus === "done" || markingBeta} className={`inline-flex items-center gap-0.5 disabled:cursor-wait ${currentBetaStatus === "done" ? "text-fuchsia-600 dark:text-fuchsia-400" : "hover:text-slate-800 hover:underline dark:hover:text-slate-200"}`}>
            {currentBetaStatus === "done" && <CheckCircle2 className="h-3 w-3" />}
            {markingBeta ? "Đang lưu Beta…" : currentBetaStatus === "done" ? "Đã Beta" : currentBetaStatus === "stale" ? "Xác nhận Beta lại" : "Đánh dấu đã Beta"}
          </button>
          <button onClick={onRefresh} disabled={refreshing} title="Làm mới tiến độ" className="text-slate-400 hover:text-slate-700 disabled:opacity-40 dark:text-slate-500 dark:hover:text-slate-200"><RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
    </section>
  );
}
