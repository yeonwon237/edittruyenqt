import { useState, useRef } from "react";
import { Search, Plus, Pencil, Trash2, Upload, Download, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CATEGORY_STYLES, CATEGORY_EMOJI, CATEGORIES } from "@/lib/highlight";
import { parseGlossaryFile } from "@/lib/importGlossary";
import { exportGlossaryJson } from "@/lib/exportUtils";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";

export default function GlossarySidebar({
  terms,
  project,
  onAddTerm,
  onEditTerm,
  onDeleteTerm,
  onImportTerms,
  onOpenContextualPronoun,
  onDetectNames,
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileInputRef = useRef(null);

  const filtered = terms.filter((t) => {
    const matchSearch =
      !search ||
      t.source_term?.toLowerCase().includes(search.toLowerCase()) ||
      t.translation?.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      activeCategory === "all" || t.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseGlossaryFile(text, file.name);
      if (parsed.length === 0) {
        toast({
          title: "File không có thuật ngữ hợp lệ",
          variant: "destructive",
        });
        return;
      }
      onImportTerms(parsed);
    } catch (err) {
      toast({
        title: "Lỗi nhập file",
        description: err.message,
        variant: "destructive",
      });
    }
    e.target.value = "";
  };

  const handleExport = () => {
    if (terms.length === 0) {
      toast({ title: "Chưa có thuật ngữ để xuất", variant: "destructive" });
      return;
    }
    exportGlossaryJson(
      terms,
      project,
      `${project?.title || "Glossary"} - Từ điển`
    );
    toast({ title: "Đã xuất từ điển 📤" });
  };

  return (
    <aside className="absolute md:static inset-y-0 left-0 z-40 md:z-auto md:w-[280px] w-[85%] max-w-[320px] shrink-0 flex flex-col border-r border-violet-100 bg-white md:bg-white/60 backdrop-blur shadow-lg md:shadow-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-violet-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            📖 Từ điển
            <span className="text-xs font-normal text-slate-400">
              ({terms.length})
            </span>
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
              title="Nhập từ điển (JSON/CSV)"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
              title="Xuất từ điển (JSON)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onAddTerm}
              className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-600 transition-colors"
              title="Thêm thuật ngữ"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,.tsv"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm thuật ngữ..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-300"
          />
        </div>
        <button
          onClick={onOpenContextualPronoun}
          className="mt-2 w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 transition-colors"
          title="Quản lý ma trận xưng hô theo nhân vật"
        >
          🗣️ Ma Trận Xưng Hô
          <span className="ml-auto text-[10px] text-violet-400 font-normal">
            {Array.isArray(project?.contextual_pronoun_rules)
              ? project.contextual_pronoun_rules.length
              : 0}{" "}
            quy tắc
          </span>
        </button>
        <button
          onClick={onDetectNames}
          className="mt-1.5 w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
          title="Dùng AI tìm tên riêng trong chương hiện tại, không cần biết tiếng Trung"
        >
          <Sparkles className="w-3.5 h-3.5" /> Phát hiện tên riêng (AI)
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto cute-scrollbar border-b border-violet-100">
        <button
          onClick={() => setActiveCategory("all")}
          className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeCategory === "all" ? "bg-violet-600 text-white" : "bg-violet-50 text-slate-500 hover:bg-violet-100"}`}
        >
          Tất cả
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activeCategory === cat ? "bg-violet-600 text-white" : "bg-violet-50 text-slate-500 hover:bg-violet-100"}`}
          >
            {CATEGORY_EMOJI[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Term list */}
      <div className="flex-1 overflow-y-auto cute-scrollbar p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <p className="text-3xl mb-2">📖</p>
            <p>Chưa có thuật ngữ nào</p>
            <button
              onClick={onAddTerm}
              className="mt-2 text-violet-600 text-xs hover:underline"
            >
              + Thêm thuật ngữ đầu tiên
            </button>
          </div>
        ) : (
          filtered.map((term) => (
            <div
              key={term.id}
              className="group p-3 rounded-xl bg-white/80 border border-violet-100 hover:border-violet-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {term.source_term}
                  </p>
                  <p className="text-sm text-violet-600 truncate">
                    {term.translation}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditTerm(term)}
                    className="p-1 rounded-md hover:bg-violet-50 text-slate-400 hover:text-violet-600"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(term)}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Xóa thuật ngữ "${deleteTarget?.source_term || ""}"?`}
        description="Bản dịch tương ứng sẽ không còn được tô sáng hoặc áp dụng khi AI biên tập nữa."
        confirmLabel="Xóa thuật ngữ"
        onConfirm={() => {
          onDeleteTerm(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </aside>
  );
}