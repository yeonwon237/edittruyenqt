import { Check, Pencil, X as XIcon } from "lucide-react";

// Slim replacement for Workspace's web header (src/pages/Workspace.jsx) when
// running in the desktop app — chapter picker and account actions already
// live in the persistent AppSidebar there, so this only needs the project
// title and save status. The "..." menu that used to live here (QA/Beta
// toàn truyện, dịch toàn truyện, quản lý chương, xuất bản, LilyBetaSync)
// moved into EditorToolbar as "Công cụ khác", next to "Công cụ dữ liệu".
export default function WorkspaceDesktopBar({
  projectTitle,
  editingTitle, titleDraft, onTitleDraftChange, onStartEditTitle, onSaveTitle, onCancelEditTitle,
  chapterCount, glossaryCount,
  saving, draftMode, onManualSave,
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-300 bg-slate-100 px-4 py-2.5 dark:border-white/10 dark:bg-[#1a1a1c]">
      <div className="min-w-0 flex-1">
        {editingTitle ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => onTitleDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSaveTitle(); if (e.key === "Escape") onCancelEditTitle(); }}
              onBlur={onSaveTitle}
              className="w-56 border border-violet-500 bg-white px-1.5 py-0.5 text-sm font-bold leading-tight text-slate-800 focus:outline-none dark:border-violet-400 dark:bg-[#111113] dark:text-slate-100"
            />
            <button onMouseDown={(e) => e.preventDefault()} onClick={onSaveTitle} className="shrink-0 p-1 text-violet-700 hover:bg-violet-200 dark:text-violet-300 dark:hover:bg-violet-500/20" title="Lưu"><Check className="h-3.5 w-3.5" /></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={onCancelEditTitle} className="shrink-0 p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400" title="Hủy"><XIcon className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <h1 onClick={onStartEditTitle} className="group flex cursor-pointer items-center gap-1 text-sm font-bold leading-tight text-slate-800 transition-colors hover:text-violet-700 dark:text-slate-100 dark:hover:text-violet-300" title="Bấm để đổi tên bộ truyện">
            <span className="truncate">{projectTitle}</span>
            <Pencil className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-violet-500 dark:text-slate-500 dark:group-hover:text-violet-400" />
          </h1>
        )}
        <p className="text-xs text-slate-500">{glossaryCount} thuật ngữ · {chapterCount} chương</p>
      </div>

      {draftMode ? (
        <button onClick={onManualSave} disabled={saving} className="shrink-0 border border-amber-600/40 bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20">
          {saving ? "Đang lưu..." : "Chế độ nháp · Lưu"}
        </button>
      ) : (
        <span className="shrink-0 text-xs text-slate-500">{saving ? "Đang lưu..." : "Đã lưu"}</span>
      )}
    </div>
  );
}
