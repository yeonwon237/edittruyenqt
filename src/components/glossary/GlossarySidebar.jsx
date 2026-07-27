import { useState } from "react";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { CATEGORY_STYLES, CATEGORY_EMOJI, CATEGORIES } from "@/lib/highlight";

export default function GlossarySidebar({
  terms,
  project,
  onAddTerm,
  onEditTerm,
  onDeleteTerm,
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = terms.filter((t) => {
    const matchSearch =
      !search ||
      t.source_term?.toLowerCase().includes(search.toLowerCase()) ||
      t.translation?.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      activeCategory === "all" || t.category === activeCategory;
    return matchSearch && matchCategory;
  });

  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-r border-rose-100 bg-white/50 backdrop-blur">
      {/* Header */}
      <div className="px-4 py-3 border-b border-rose-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            📖 Từ điển
            <span className="text-xs font-normal text-slate-400">
              ({terms.length})
            </span>
          </h2>
          <button
            onClick={onAddTerm}
            className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm thuật ngữ..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-rose-100 bg-white/70 focus:outline-none focus:border-rose-300"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto cute-scrollbar border-b border-rose-100">
        <button
          onClick={() => setActiveCategory("all")}
          className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeCategory === "all" ? "bg-rose-400 text-white" : "bg-rose-50 text-slate-500 hover:bg-rose-100"}`}
        >
          Tất cả
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeCategory === cat ? "bg-rose-400 text-white" : "bg-rose-50 text-slate-500 hover:bg-rose-100"}`}
          >
            {CATEGORY_EMOJI[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Term list */}
      <div className="flex-1 overflow-y-auto cute-scrollbar p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <p className="text-3xl mb-2">🌸</p>
            <p>Chưa có thuật ngữ nào</p>
            <button
              onClick={onAddTerm}
              className="mt-2 text-rose-500 text-xs hover:underline"
            >
              + Thêm thuật ngữ đầu tiên
            </button>
          </div>
        ) : (
          filtered.map((term) => (
            <div
              key={term.id}
              className="group p-3 rounded-xl bg-white/80 border border-rose-100 hover:border-rose-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {term.source_term}
                  </p>
                  <p className="text-sm text-rose-500 truncate">
                    {term.translation}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditTerm(term)}
                    className="p-1 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-500"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteTerm(term.id)}
                    className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {term.category && (
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full border ${CATEGORY_STYLES[term.category]}`}
                >
                  {CATEGORY_EMOJI[term.category]} {term.category}
                </span>
              )}
              {term.notes && (
                <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                  {term.notes}
                </p>
              )}
              {project?.custom_field_definitions?.map((fieldDef) => {
                const val = term.custom_fields?.[fieldDef.name];
                if (!val) return null;
                return (
                  <p key={fieldDef.name} className="text-xs text-slate-500 mt-1">
                    <span className="text-slate-400">{fieldDef.label}:</span>{" "}
                    {val}
                  </p>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}