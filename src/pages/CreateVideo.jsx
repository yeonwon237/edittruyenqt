import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clapperboard, Download, ImagePlus, RefreshCw, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  buildPollinationsUrl,
  loadImage,
  drawCover,
  canvasToPngBlob,
  POLLINATIONS_MODELS,
  canAutoTranslatePrompt,
  translatePromptToEnglish,
} from "@/lib/videoCover";

export default function CreateVideo() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("flux");
  const [seed, setSeed] = useState(0);
  const [image, setImage] = useState(null); // loaded HTMLImageElement
  const [loadingImage, setLoadingImage] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(canAutoTranslatePrompt());
  const [usedPrompt, setUsedPrompt] = useState(""); // actual prompt sent to Pollinations, shown for transparency
  const [translatedFrom, setTranslatedFrom] = useState(""); // last raw prompt a translation was cached for

  const chapterLabel = [
    chapterNumber.trim() ? `Chương ${chapterNumber.trim()}` : "",
    chapterTitle.trim(),
  ]
    .filter(Boolean)
    .join(": ");

  // Redraw whenever any input changes.
  useEffect(() => {
    if (canvasRef.current) {
      drawCover(canvasRef.current, { image, title, chapterLabel });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, title, chapterLabel]);

  const handleGenerateBackground = async () => {
    if (!prompt.trim()) {
      toast({ title: "Nhập mô tả bối cảnh trước đã", variant: "destructive" });
      return;
    }
    setLoadingImage(true);
    try {
      const trimmed = prompt.trim();
      // Reuse the cached translation on "đổi ảnh khác" (same wording, just a
      // new random seed) instead of re-translating and burning AI quota
      // for no reason.
      let effectivePrompt = usedPrompt && translatedFrom === trimmed ? usedPrompt : null;
      if (!effectivePrompt) {
        effectivePrompt =
          autoTranslate && canAutoTranslatePrompt() ? await translatePromptToEnglish(trimmed) : trimmed;
        setUsedPrompt(effectivePrompt);
        setTranslatedFrom(trimmed);
      }
      const url = buildPollinationsUrl(effectivePrompt, seed, model);
      const img = await loadImage(url, true);
      setImage(img);
    } catch (e) {
      toast({ title: "Lỗi tạo ảnh nền", description: e.message, variant: "destructive" });
    }
    setLoadingImage(false);
  };

  const handleRegenerateBackground = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  };
  useEffect(() => {
    if (seed !== 0 && prompt.trim()) handleGenerateBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const handleUploadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingImage(true);
    const objectUrl = URL.createObjectURL(file);
    loadImage(objectUrl, false)
      .then((img) => setImage(img))
      .catch((err) => toast({ title: "Lỗi tải ảnh", description: err.message, variant: "destructive" }))
      .finally(() => {
        setLoadingImage(false);
        URL.revokeObjectURL(objectUrl);
      });
    e.target.value = "";
  };

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await canvasToPngBlob(canvasRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (title.trim() || "bia-video").replace(/[/\\?%*:|"<>]/g, "-");
      a.download = `${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Không xuất được ảnh",
        description: "Ảnh nền từ Pollinations có thể không cho phép xuất trực tiếp. Thử tải ảnh nền lên từ máy thay vì tạo bằng AI.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Clapperboard className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              Tạo Video
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Tạo ảnh bìa, ghép cùng audio thành video
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-1">🖼️ Tạo Ảnh Bìa</h2>
          <p className="text-xs text-slate-400 mb-4">
            Điền tên truyện/chương, chọn ảnh nền, rồi tải ảnh bìa 1920×1080 về máy.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: form */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Tên bộ truyện</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Cơ Duyên Thiên Hạ"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Số chương</label>
                  <input
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value)}
                    placeholder="VD: 12"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Tên chương</label>
                  <input
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="VD: Sư tỷ vô thường"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-violet-50">
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Mô tả bối cảnh (để AI vẽ ảnh nền)
                </label>
                <div className="flex gap-2">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="VD: cổ trang, cung điện huyền ảo, đêm trăng"
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={handleGenerateBackground}
                    disabled={loadingImage}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shrink-0 disabled:opacity-50"
                  >
                    {loadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    Tạo ảnh
                  </button>
                </div>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full mt-2 px-3 py-1.5 text-xs rounded-lg border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                >
                  {POLLINATIONS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                {canAutoTranslatePrompt() && (
                  <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(e) => setAutoTranslate(e.target.checked)}
                      className="accent-violet-600"
                    />
                    Dịch mô tả sang tiếng Anh bằng AI trước khi tạo ảnh (khuyến nghị — AI vẽ ảnh hiểu tiếng Anh chính xác hơn nhiều so với tiếng Việt)
                  </label>
                )}
                {usedPrompt && (
                  <p className="text-[11px] text-slate-400 mt-1.5 italic">
                    Mô tả thực tế đã gửi: "{usedPrompt}"
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleRegenerateBackground}
                    disabled={loadingImage || !prompt.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" /> Đổi ảnh khác (cùng mô tả)
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
                  >
                    <Upload className="w-3 h-3" /> Tải ảnh nền từ máy
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadFile}
                    className="hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Ảnh nền tạo bằng AI miễn phí (Pollinations.ai), không cần đăng ký/API Key.
                </p>
              </div>

              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" /> Tải Bìa PNG HD
              </button>
            </div>

            {/* Right: preview */}
            <div className="rounded-xl overflow-hidden border border-violet-100 bg-slate-900 aspect-video">
              <canvas ref={canvasRef} className="w-full h-full object-contain" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/60 border border-slate-100 p-4 text-center">
          <p className="text-sm text-slate-500">
            🎬 <span className="font-medium">Ghép Audio + Bìa thành Video MP4</span> — đang phát triển, sẽ có ở đây.
          </p>
        </div>
      </main>
    </div>
  );
}
