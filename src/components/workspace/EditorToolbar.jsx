import { Wand2, Users, Plus, PanelLeft, Loader2 } from "lucide-react";

export default function EditorToolbar({
  viewMode,
  onViewModeChange,
  onQuickAddGlossary,
  onBatchReplace,
  onPronounSwitcher,
  onAutoEdit,
  aiEditing,
  onToggleSidebar,
}) {
  const preventBlur = (e) => e.preventDefault();

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur border-b border-rose-100 overflow-x-auto cute-scrollbar">
      {/* View toggle */}
      <div className="flex items-center bg-rose-50 rounded-xl p-0.5 shrink-0">
        <button
          onClick={() => onViewModeChange("3col")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === "3col" ? "bg-white text-rose-600 shadow-sm" : "text-slate-400"}`}
        >
          📚 3 Cột
        </button>
        <button
          onClick={() => onViewModeChange("2col")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === "2col" ? "bg-white text-rose-600 shadow-sm" : "text-slate-400"}`}
        >
          📄 2 Cột
        </button>
      </div>

      <div className="w-px h-6 bg-rose-100 shrink-0" />

      <button
        onMouseDown={preventBlur}
        onClick={onQuickAddGlossary}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-600 text-xs font-medium transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> Thêm vào Glossary
      </button>
      <button
        onClick={onBatchReplace}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 text-xs font-medium transition-colors shrink-0"
      >
        <Wand2 className="w-3.5 h-3.5" /> Thay thế hàng loạt
      </button>
      <button
        onMouseDown={preventBlur}
        onClick={onPronounSwitcher}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-medium transition-colors shrink-0"
      >
        <Users className="w-3.5 h-3.5" /> Đổi xưng hô
      </button>

      <div className="flex-1" />

      <button
        onClick={onAutoEdit}
        disabled={aiEditing}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-400 to-pink-500 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-60 shrink-0"
      >
        {aiEditing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang edit...
          </>
        ) : (
          <>🤖 Tự Động Edit Chương</>
        )}
      </button>

      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 transition-colors shrink-0"
        title="Ẩn/hiện từ điển"
      >
        <PanelLeft className="w-4 h-4" />
      </button>
    </div>
  );
}