import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, PenTool, RefreshCw, ShieldCheck } from "lucide-react";

function ProgressBar({ value, total, color }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percent}%` }} />
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
    <section className="shrink-0 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:px-4">
      <button
        type="button"
        onClick={() => setMobileExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 text-left md:hidden"
        aria-expanded={mobileExpanded}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Tiến độ công việc</span>
            <span className="text-violet-700">Edit {editPercent}% · QA {qaPercent}% · Beta {betaPercent}%</span>
          </span>
          <span className="mt-1.5 grid grid-cols-3 gap-1">
            <ProgressBar value={editedCount} total={total} color="bg-violet-500" />
            <ProgressBar value={qaCount} total={total} color="bg-emerald-500" />
            <ProgressBar value={betaCount} total={total} color="bg-fuchsia-500" />
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${mobileExpanded ? "rotate-180" : ""}`} />
      </button>
      <div className={`${mobileExpanded ? "flex" : "hidden"} flex-wrap items-center gap-3 border-t border-slate-100 pt-3 md:flex md:gap-4 md:border-0 md:pt-0`}>
        <div className="min-w-[150px] flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-violet-700">Edit · {editedCount}/{total} ({editPercent}%)</span>
            <span className="truncate text-slate-400">Liên tục: {editedThrough || "chưa có"}</span>
          </div>
          <ProgressBar value={editedCount} total={total} color="bg-violet-500" />
        </div>
        <div className="min-w-[150px] flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-emerald-700">QA · {qaCount}/{total} ({qaPercent}%)</span>
            <span className="truncate text-slate-400">Liên tục: {qaThrough || "chưa có"}</span>
          </div>
          <ProgressBar value={qaCount} total={total} color="bg-emerald-500" />
        </div>
        <div className="min-w-[150px] flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]"><span className="font-semibold text-fuchsia-700">Beta · {betaCount}/{total} ({betaPercent}%)</span><span className="truncate text-slate-400">Liên tục: {betaThrough || "chưa có"}</span></div>
          <ProgressBar value={betaCount} total={total} color="bg-fuchsia-500" />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap md:items-center md:gap-1.5">
          {qaNeedsRecheck > 0 && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">{qaNeedsRecheck} cần kiểm lại</span>}
          {betaNeedsRecheck > 0 && <span className="rounded-lg bg-fuchsia-50 px-2 py-1 text-[10px] font-medium text-fuchsia-700">{betaNeedsRecheck} cần Beta lại</span>}
          <button onClick={onNextEdit} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-violet-100 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100 md:min-h-0 md:justify-start md:rounded-lg md:px-2 md:py-1 md:text-[10px]">Edit tiếp <ChevronRight className="h-3 w-3" /></button>
          <button onClick={onNextQa} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 md:min-h-0 md:justify-start md:rounded-lg md:px-2 md:py-1 md:text-[10px]">QA tiếp <ChevronRight className="h-3 w-3" /></button>
          <button onClick={onNextBeta} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100 md:min-h-0 md:justify-start md:rounded-lg md:px-2 md:py-1 md:text-[10px]">Beta tiếp <ChevronRight className="h-3 w-3" /></button>
          <button onClick={onMarkQa} disabled={currentQaStatus === "done" || markingQa} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold disabled:cursor-wait disabled:opacity-70 md:min-h-0 md:justify-start md:rounded-lg md:px-2 md:py-1 md:text-[10px] ${currentQaStatus === "done" ? "bg-emerald-100 text-emerald-700" : "bg-slate-800 text-white hover:bg-slate-700"}`}>
            {currentQaStatus === "done" ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {markingQa ? "Đang lưu QA…" : currentQaStatus === "done" ? "Đã kiểm QA" : currentQaStatus === "stale" ? "Xác nhận kiểm lại" : "Đánh dấu đã QA"}
          </button>
          <button onClick={onMarkBeta} disabled={currentBetaStatus === "done" || markingBeta} className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold disabled:opacity-70 md:min-h-0 md:justify-start md:rounded-lg md:px-2 md:py-1 md:text-[10px] ${currentBetaStatus==="done"?"bg-fuchsia-100 text-fuchsia-700":"bg-slate-800 text-white"}`}><PenTool className="h-3 w-3"/>{markingBeta?"Đang lưu Beta…":currentBetaStatus==="done"?"Đã Beta":currentBetaStatus==="stale"?"Xác nhận Beta lại":"Đánh dấu đã Beta"}</button>
          <button onClick={onRefresh} disabled={refreshing} title="Làm mới tiến độ" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
    </section>
  );
}
