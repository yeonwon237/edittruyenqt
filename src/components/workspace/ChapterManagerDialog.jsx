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
import { GripVertical, Pencil, Trash2, Upload, Download, Check, X, Sparkles } from "lucide-react";

export default function ChapterManagerDialog({
  open,
  onOpenChange,
  chapters,
  currentChapterId,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  onOpenImport,
  onExportAll,
  exporting,
  onExportEdited,
  exportingEdited,
  onBatchEdit,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDeleteTarget(null);
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
                  variant="outline"
                  onClick={onBatchEdit}
                  disabled={chapters.length === 0}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Edit AI hàng loạt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportAll}
                  disabled={exporting || exportingEdited || chapters.length === 0}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> {exporting ? "Đang xuất..." : "Xuất tất cả"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExportEdited}
                  disabled={exporting || exportingEdited || chapters.length === 0}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />{" "}
                  {exportingEdited ? "Đang xuất..." : "Xuất chương đã Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenImport}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> Nhập hàng loạt
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription>
              Kéo thả để sắp xếp lại thứ tự chương. Bấm vào tên để đổi tên.
            </DialogDescription>
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
                        <Draggable key={ch.id} draggableId={ch.id} index={index}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                                snapshot.isDragging ? "bg-violet-100 border-violet-300 shadow-lg" : "bg-white border-violet-100"
                              } ${ch.id === currentChapterId ? "ring-2 ring-violet-300" : ""}`}
                            >
                              <span
                                {...dragProvided.dragHandleProps}
                                className="text-slate-300 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>

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
                                    onClick={() => onSelect(ch.id)}
                                    className="flex-1 min-w-0 text-left text-sm text-slate-700 truncate hover:text-violet-600"
                                  >
                                    {ch.title}
                                  </button>
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
    </>
  );
}
