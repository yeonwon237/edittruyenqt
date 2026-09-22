import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  GripVertical,
  Pencil,
  Trash2,
  Upload,
  Download,
  Check,
  X,
  Sparkles,
  ListChecks,
  Languages,
  MoreHorizontal,
  Undo2,
} from "lucide-react";

const EXPORT_FORMATS = [
  { key: "csv", label: "CSV" },
  { key: "txt", label: "TXT" },
  { key: "docx", label: "DOCX (Word)" },
  { key: "pdf", label: "PDF" },
];

// One button that opens a "choose export format" menu, reused for all 3
// export scopes (tất cả / đã Edit / đã chọn) below.
function ExportMenuButton({ label, busyLabel, busy, disabled, onPick, buttonClassName, size = "sm" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" disabled={disabled || busy} className={buttonClassName}>
          <Download className="w-3.5 h-3.5 mr-1" /> {busy ? busyLabel : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {EXPORT_FORMATS.map((f) => (
          <DropdownMenuItem key={f.key} onClick={() => onPick(f.key)}>
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectedExportMenuButton({ busy, disabled, onPick }) {
  const columns = [
    { key: "raw_original", label: "Văn bản gốc" },
    { key: "qt_raw", label: "QT thô" },
    { key: "edited", label: "Bản Edit" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || busy} className="w-full bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl h-8 px-2.5 text-xs">
          <Download className="w-3.5 h-3.5 mr-1" /> {busy ? "Đang xuất..." : "Xuất đã chọn"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {columns.map((column) => (
          <DropdownMenuSub key={column.key}>
            <DropdownMenuSubTrigger>{column.label}</DropdownMenuSubTrigger>
            <DropdownMenuPortal><DropdownMenuSubContent>
              {EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem key={format.key} onClick={() => onPick(column.key, format.key)}>
                  {format.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent></DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DatasetMenuButton({ busy, disabled, onPick }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || busy} className="w-full border-sky-200 bg-white text-sky-700 hover:bg-sky-50 rounded-xl h-8 px-2.5 text-xs">
          <Download className="w-3.5 h-3.5 mr-1" /> {busy ? "Đang tạo..." : "Dataset AI"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Trung raw → Edit</DropdownMenuSubTrigger>
          <DropdownMenuPortal><DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onPick("raw", "paragraph", "csv")}>Theo đoạn — CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("raw", "paragraph", "jsonl")}>Theo đoạn — JSONL</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("raw", "sentence", "csv")}>Theo câu — CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("raw", "sentence", "jsonl")}>Theo câu — JSONL</DropdownMenuItem>
          </DropdownMenuSubContent></DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>QT → Edit</DropdownMenuSubTrigger>
          <DropdownMenuPortal><DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onPick("qt", "paragraph", "csv")}>Theo đoạn — CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("qt", "paragraph", "jsonl")}>Theo đoạn — JSONL</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("qt", "sentence", "csv")}>Theo câu — CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPick("qt", "sentence", "jsonl")}>Theo câu — JSONL</DropdownMenuItem>
          </DropdownMenuSubContent></DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ChapterManagerDialog({
  open,
  onOpenChange,
  chapters,
  currentChapterId,
  onSelect,
  onRename,
  onDelete,
  onDeleteSelected,
  onUndoDelete,
  deleteUndoCount,
  onReorder,
  onOpenImport,
  onExportAll,
  exporting,
  onExportEdited,
  exportingEdited,
  onExportSelected,
  exportingSelected,
  onExportDataset,
  exportingDataset,
  onBatchEdit,
  onBatchTitleEdit,
  qaIssuesByChapter = {},
  betaIssuesByChapter = {},
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDeleteTarget(null);
      setShowBatchDeleteConfirm(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [open]);

  const startEdit = (ch) => {
    setEditingId(ch.id);
    setEditTitle(ch.title || "");
  };

  const commitEdit = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    onReorder(result.source.index, result.destination.index);
  };

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = chapters.length > 0 && selectedIds.size === chapters.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(chapters.map((ch) => ch.id)));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-violet-700 flex items-center justify-between gap-2 flex-wrap">
              <span>📚 Quản lý chương ({chapters.length})</span>
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant={selectMode ? "default" : "outline"}
                  onClick={toggleSelectMode}
                  disabled={chapters.length === 0}
                  className={
                    selectMode
                      ? "bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
                      : "border-violet-200 text-violet-600 rounded-xl"
                  }
                >
                  <ListChecks className="w-3.5 h-3.5 mr-1" /> Chọn chương
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-violet-200 text-violet-600 rounded-xl px-2"
                      title="Thao tác khác"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onOpenImport}>
                      <Upload className="w-3.5 h-3.5" /> Nhập hàng loạt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onBatchEdit} disabled={chapters.length === 0}>
                      <Sparkles className="w-3.5 h-3.5" /> Làm mượt QT hàng loạt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onBatchTitleEdit} disabled={chapters.length === 0}>
                      <Languages className="w-3.5 h-3.5" /> Dịch tên chương bằng AI
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={exportingEdited || chapters.length === 0}>
                        <Download className="w-3.5 h-3.5" />
                        {exporting ? "Đang xuất..." : "Xuất tất cả"}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {EXPORT_FORMATS.map((f) => (
                            <DropdownMenuItem key={f.key} onClick={() => onExportAll(f.key)}>
                              {f.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={exporting || chapters.length === 0}>
                        <Download className="w-3.5 h-3.5" />
                        {exportingEdited ? "Đang xuất..." : "Xuất chương đã Edit"}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {EXPORT_FORMATS.map((f) => (
                            <DropdownMenuItem key={f.key} onClick={() => onExportEdited(f.key)}>
                              {f.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DialogTitle>
            <DialogDescription>
              Kéo thả để sắp xếp lại thứ tự chương. Bấm vào tên để đổi tên.
            </DialogDescription>
            {deleteUndoCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-xs text-amber-800 flex-1">
                  Vừa xóa {deleteUndoCount} chương
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onUndoDelete}
                  className="h-8 rounded-xl border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  <Undo2 className="w-3.5 h-3.5 mr-1" /> Hoàn tác
                </Button>
              </div>
            )}
            {selectMode && (
              <div className="px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-100 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-violet-700 font-semibold hover:text-violet-900 whitespace-nowrap"
                  >
                    {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  </button>
                  <span className="text-xs text-slate-500 flex-1 text-right">
                    Đã chọn <strong className="text-violet-700">{selectedIds.size}</strong>/{chapters.length} chương
                  </span>
                  <button
                    onClick={toggleSelectMode}
                    className="p-1 rounded-md hover:bg-violet-100 text-violet-500"
                    title="Thoát chế độ chọn"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <SelectedExportMenuButton
                    busy={exportingSelected}
                    disabled={selectedIds.size === 0}
                    onPick={(column, format) => onExportSelected([...selectedIds], column, format)}
                  />
                  <DatasetMenuButton
                    busy={exportingDataset}
                    disabled={selectedIds.size === 0}
                    onPick={(source, unit, format) => onExportDataset([...selectedIds], source, unit, format)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedIds.size === 0}
                    onClick={() => setShowBatchDeleteConfirm(true)}
                    className="w-full border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl h-8 px-2.5 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa đã chọn
                  </Button>
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto cute-scrollbar -mx-1 px-1">
            {chapters.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Chưa có chương nào.</p>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="chapters">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                      {chapters.map((ch, index) => (
                        <Draggable
                          key={ch.id}
                          draggableId={ch.id}
                          index={index}
                          isDragDisabled={selectMode}
                        >
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                                snapshot.isDragging ? "bg-violet-100 border-violet-300 shadow-lg" : "bg-white border-violet-100"
                              } ${ch.id === currentChapterId ? "ring-2 ring-violet-300" : ""} ${
                                selectMode && selectedIds.has(ch.id) ? "border-violet-400 bg-violet-50/60" : ""
                              }`}
                            >
                              {selectMode ? (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(ch.id)}
                                  onChange={() => toggleSelected(ch.id)}
                                  className="accent-violet-600 shrink-0"
                                />
                              ) : (
                                <span
                                  {...dragProvided.dragHandleProps}
                                  className="text-slate-300 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>
                              )}

                              {editingId === ch.id ? (
                                <>
                                  <input
                                    autoFocus
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEdit();
                                      if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className="flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border border-violet-300 focus:outline-none"
                                  />
                                  <button onClick={commitEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md shrink-0">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded-md shrink-0">
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() =>
                                      selectMode ? toggleSelected(ch.id) : onSelect(ch.id)
                                    }
                                    className="flex-1 min-w-0 text-left text-sm text-slate-700 truncate hover:text-violet-600"
                                  >
                                    {ch.title}
                                  </button>
                                  {qaIssuesByChapter[ch.id] > 0 && (
                                    <button onClick={() => onSelect(ch.id)} title={`${qaIssuesByChapter[ch.id]} lỗi/nghi vấn QA — bấm để tới chương`} className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-200">
                                      QA {qaIssuesByChapter[ch.id]}
                                    </button>
                                  )}
                                  {betaIssuesByChapter[ch.id] > 0 && <button onClick={()=>onSelect(ch.id)} title={`${betaIssuesByChapter[ch.id]} nghi vấn Beta — bấm để tới chương`} className="shrink-0 rounded-full bg-fuchsia-100 px-2 py-1 text-[10px] font-bold text-fuchsia-700 hover:bg-fuchsia-200">Beta {betaIssuesByChapter[ch.id]}</button>}
                                  {!selectMode && (
                                    <>
                                      <button
                                        onClick={() => startEdit(ch)}
                                        className="p-1.5 rounded-md hover:bg-violet-50 text-slate-400 hover:text-violet-600 shrink-0"
                                        title="Đổi tên"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setDeleteTarget(ch)}
                                        className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"
                                        title="Xóa chương"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Xóa "${deleteTarget?.title || ""}"?`}
        description="Toàn bộ nội dung 3 cột của chương này sẽ bị xóa vĩnh viễn, không thể hoàn tác."
        confirmLabel="Xóa chương"
        onConfirm={() => {
          onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
      <ConfirmDialog
        open={showBatchDeleteConfirm}
        onOpenChange={setShowBatchDeleteConfirm}
        title={`Xóa ${selectedIds.size} chương đã chọn?`}
        description="Toàn bộ nội dung của các chương đã chọn sẽ bị xóa vĩnh viễn và không thể hoàn tác."
        confirmLabel={`Xóa ${selectedIds.size} chương`}
        onConfirm={() => {
          onDeleteSelected([...selectedIds]);
          setShowBatchDeleteConfirm(false);
        }}
      />
    </>
  );
}
