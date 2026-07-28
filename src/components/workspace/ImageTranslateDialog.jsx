import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Settings as SettingsIcon } from "lucide-react";

// Dịch từ ảnh (OCR + translate): lets a translator drop in a photo/screenshot
// of source text and get both the transcription and a Vietnamese draft back.
// Requires a custom AI key (Gemini/GPT/Claude) — the Base44 managed AI path
// doesn't take image input here, and this is the one place in the app that
// genuinely needs a real multimodal model.
export default function ImageTranslateDialog({
  open,
  onOpenChange,
  hasCustomAI,
  onOpenSettings,
  translating,
  result,
  onSelectFile,
  onEditRaw,
  onApply,
}) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onSelectFile(file);
  };

  const handleClose = (v) => {
    if (!v) setPreviewUrl(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto cute-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <ImagePlus className="w-4 h-4" /> Dịch từ ảnh
          </DialogTitle>
          <DialogDescription>
            Tải lên ảnh/chụp màn hình chứa văn bản gốc — AI sẽ đọc chữ trong ảnh và dịch sang
            tiếng Việt luôn.
          </DialogDescription>
        </DialogHeader>

        {!hasCustomAI ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 space-y-3">
            <p>
              Tính năng này cần AI đọc được hình ảnh (Gemini / GPT / Claude) — chưa hỗ trợ qua AI
              nền tảng mặc định. Vào Cài đặt để nhập API key riêng trước.
            </p>
            <Button
              size="sm"
              onClick={onOpenSettings}
              className="bg-amber-600 hover:bg-amber-700 text-white border-0 rounded-xl"
            >
              <SettingsIcon className="w-3.5 h-3.5 mr-1" /> Vào Cài đặt
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="hidden"
            />
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Xem trước"
                  className="w-full max-h-56 object-contain rounded-xl border border-violet-100 bg-slate-50"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2 text-xs px-2.5 py-1 rounded-lg bg-white/90 border border-violet-100 text-violet-600 hover:bg-white"
                >
                  Đổi ảnh khác
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-violet-200 p-8 text-center hover:border-violet-300 hover:bg-violet-50/40 transition-colors"
              >
                <ImagePlus className="w-8 h-8 text-violet-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Bấm để chọn ảnh</p>
              </button>
            )}

            {translating && (
              <div className="flex items-center justify-center gap-2 py-4 text-violet-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> AI đang đọc & dịch ảnh...
              </div>
            )}

            {result && !translating && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Văn bản gốc (chép từ ảnh, có thể sửa lại)
                  </label>
                  <textarea
                    value={result.raw}
                    onChange={(e) => onEditRaw(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Bản dịch tiếng Việt
                  </label>
                  <textarea
                    value={result.translated}
                    readOnly
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50 focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Đóng
          </Button>
          {result && !translating && (
            <Button
              onClick={onApply}
              className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
            >
              Áp dụng vào chương
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
