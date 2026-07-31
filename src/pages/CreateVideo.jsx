import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clapperboard, Download, ImagePlus, RefreshCw, Upload, Loader2, Music, Film } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  buildPollinationsUrl,
  loadImage,
  drawCover,
  canvasToPngBlob,
  POLLINATIONS_MODELS,
  canAutoTranslatePrompt,
  translatePromptToEnglish,
  hasGeminiImageKey,
  generateGeminiCoverImage,
  getGeminiImageModel,
  saveGeminiImageModel,
  generateCloudflareCoverImage,
  getCloudflareWorkerUrl,
  saveCloudflareWorkerUrl,
} from "@/lib/videoCover";
import { renderVideoFromAudioAndImage } from "@/lib/videoRender";

export default function CreateVideo() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");

  const [prompt, setPrompt] = useState("");
  // Cloudflare (own Worker, free, verified good quality 2026-07-30) is now
  // the default — Gemini has repeatedly hit "limit: 0" quota on this
  // account regardless of model tried.
  const [imageSource, setImageSource] = useState("cloudflare");
  const [geminiImageModel, setGeminiImageModel] = useState(getGeminiImageModel());
  const [cloudflareWorkerUrl, setCloudflareWorkerUrl] = useState(getCloudflareWorkerUrl());
  const [model, setModel] = useState("flux");
  const [seed, setSeed] = useState(0);
  const [image, setImage] = useState(null); // loaded HTMLImageElement
  const [loadingImage, setLoadingImage] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(canAutoTranslatePrompt());
  const [usedPrompt, setUsedPrompt] = useState(""); // actual prompt sent to Pollinations, shown for transparency
  const [translatedFrom, setTranslatedFrom] = useState(""); // last raw prompt a translation was cached for

  const [audioFile, setAudioFile] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

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

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Generates the background from an already-final English prompt — no
  // translation step. Used both after translation happens and directly by
  // the editable-prompt box, so the user can hand-tune the exact wording
  // and regenerate without it being silently re-translated over.
  const generateFromPrompt = async (englishPrompt, nextSeed) => {
    setLoadingImage(true);
    try {
      if (imageSource === "gemini") {
        const dataUrl = await generateGeminiCoverImage(englishPrompt, geminiImageModel);
        // A data: URL is same-origin by definition — no CORS/tainted-canvas
        // risk the way a remote Pollinations URL can have.
        const img = await loadImage(dataUrl, false);
        setImage(img);
      } else if (imageSource === "cloudflare") {
        const dataUrl = await generateCloudflareCoverImage(englishPrompt);
        const img = await loadImage(dataUrl, false);
        setImage(img);
      } else {
        const url = buildPollinationsUrl(englishPrompt, nextSeed, model);
        const img = await loadImage(url, true);
        setImage(img);
      }
    } catch (e) {
      toast({ title: "Lỗi tạo ảnh nền", description: e.message, variant: "destructive" });
    }
    setLoadingImage(false);
  };

  const handleGenerateBackground = async () => {
    if (!prompt.trim()) {
      toast({ title: "Nhập mô tả bối cảnh trước đã", variant: "destructive" });
      return;
    }
    const trimmed = prompt.trim();
    setLoadingImage(true);
    let effectivePrompt = trimmed;
    try {
      // Reuse the cached translation on "đổi ảnh khác" (same wording, just a
      // new random seed) instead of re-translating and burning AI quota
      // for no reason.
      effectivePrompt =
        usedPrompt && translatedFrom === trimmed
          ? usedPrompt
          : autoTranslate && canAutoTranslatePrompt()
          ? await translatePromptToEnglish(trimmed)
          : trimmed;
      setUsedPrompt(effectivePrompt);
      setTranslatedFrom(trimmed);
    } catch (e) {
      toast({ title: "Lỗi dịch mô tả", description: e.message, variant: "destructive" });
    }
    await generateFromPrompt(effectivePrompt, seed);
  };

  const handleRegenerateBackground = () => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  };
  useEffect(() => {
    if (seed !== 0 && prompt.trim()) handleGenerateBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // "Tạo lại với mô tả này" — regenerate straight from whatever is in the
  // editable English-prompt box right now, exactly as typed, no AI call.
  const handleRegenerateFromEditedPrompt = () => {
    if (!usedPrompt.trim()) {
      toast({ title: "Chưa có mô tả để tạo ảnh", variant: "destructive" });
      return;
    }
    generateFromPrompt(usedPrompt.trim(), Math.floor(Math.random() * 1_000_000));
  };

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

  const handleSelectAudio = (e) => {
    const file = e.target.files?.[0];
    if (file) setAudioFile(file);
  };

  const handleRenderVideo = async () => {
    if (!audioFile) {
      toast({ title: "Chưa chọn file audio (.mp3)", variant: "destructive" });
      return;
    }
    if (!canvasRef.current) return;
    setRendering(true);
    setRenderProgress(0);
    setRenderStatus("");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl("");
    try {
      const coverBlob = await canvasToPngBlob(canvasRef.current);
      const blob = await renderVideoFromAudioAndImage({
        imageBlob: coverBlob,
        audioFile,
        onProgress: setRenderProgress,
        onStatus: setRenderStatus,
      });
      setVideoUrl(URL.createObjectURL(blob));
      toast({ title: "🎬 Đã tạo xong video!" });
    } catch (e) {
      toast({
        title: "Lỗi dựng video",
        description: e?.message || "Lỗi không rõ nguyên nhân — thử tải lại trang rồi làm lại.",
        variant: "destructive",
      });
    }
    setRendering(false);
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    const safeName = (title.trim() || "video").replace(/[/\\?%*:|"<>]/g, "-");
    a.download = `${safeName}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
                <label className="text-xs font-medium text-slate-500 mb-1 block">Nguồn ảnh</label>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  <button
                    onClick={() => setImageSource("cloudflare")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      imageSource === "cloudflare" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    ☁️ Cloudflare (miễn phí, chất lượng cao)
                  </button>
                  {hasGeminiImageKey() && (
                    <button
                      onClick={() => setImageSource("gemini")}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        imageSource === "gemini" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      ✨ Gemini
                    </button>
                  )}
                  <button
                    onClick={() => setImageSource("pollinations")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      imageSource === "pollinations" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    🌸 Pollinations (miễn phí, không cần key)
                  </button>
                </div>

                {imageSource === "cloudflare" && (
                  <div className="mb-2">
                    <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                      URL Cloudflare Worker (nâng cao — chỉ sửa nếu bạn deploy lại worker khác)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={cloudflareWorkerUrl}
                        onChange={(e) => setCloudflareWorkerUrl(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 font-mono"
                      />
                      <button
                        onClick={() => {
                          saveCloudflareWorkerUrl(cloudflareWorkerUrl);
                          toast({ title: "Đã lưu URL" });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}

                {imageSource === "gemini" && (
                  <div className="mb-2">
                    <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                      Model Gemini tạo ảnh (nâng cao — chỉ sửa nếu bị lỗi "quota"/"model không tồn tại")
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={geminiImageModel}
                        onChange={(e) => setGeminiImageModel(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 font-mono"
                      />
                      <button
                        onClick={() => {
                          saveGeminiImageModel(geminiImageModel);
                          toast({ title: "Đã lưu model" });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}

                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Mô tả bối cảnh (để AI vẽ ảnh nền) — nên nói rõ <span className="font-semibold text-slate-600">có ai trong cảnh</span> (nam/nữ chính, ngoại hình, đang làm gì), không chỉ thể loại — chỉ nói thể loại/không khí thì AI phải tự bịa nhân vật, dễ ra ảnh không đúng ý
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    placeholder="VD: nữ chính tóc dài đen, mặc áo lụa xanh cổ trang, đứng bên hồ sen nhìn xa xăm, hoàng hôn buồn man mác"
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 resize-y"
                  />
                  <button
                    onClick={handleGenerateBackground}
                    disabled={loadingImage}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shrink-0 disabled:opacity-50 self-start"
                  >
                    {loadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    Tạo ảnh
                  </button>
                </div>
                {imageSource === "pollinations" && (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full mt-2 px-3 py-1.5 text-xs rounded-lg border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  >
                    {POLLINATIONS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                )}
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
                  <div className="mt-2">
                    <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                      Mô tả tiếng Anh thực tế (sửa trực tiếp rồi tạo lại nếu ảnh chưa đúng ý)
                    </label>
                    <textarea
                      value={usedPrompt}
                      onChange={(e) => setUsedPrompt(e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-400 resize-none"
                    />
                    <button
                      onClick={handleRegenerateFromEditedPrompt}
                      disabled={loadingImage}
                      className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium disabled:opacity-40"
                    >
                      {loadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                      Tạo lại với mô tả này
                    </button>
                  </div>
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
                  {imageSource === "cloudflare"
                    ? "Chạy trên Cloudflare Worker riêng của bạn (FLUX.1), miễn phí — đủ dùng thoải mái hàng ngày (giới hạn theo 'Neuron' tính toán của Cloudflare, không phải theo số ảnh cụ thể)."
                    : imageSource === "gemini"
                    ? "Dùng chung API Key Gemini bạn đã có, chất lượng cao hơn, miễn phí tới 500 ảnh/ngày."
                    : "Ảnh nền tạo bằng AI miễn phí (Pollinations.ai), không cần đăng ký/API Key."}
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

        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Film className="w-4 h-4 text-amber-500" /> Ghép Audio + Bìa thành Video MP4
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Cần đã có ảnh bìa (tạo ở phần trên) và file audio .mp3 (tải về từ trang "Tạo Audio").
            Dựng video chạy ngay trên trình duyệt của bạn, có thể mất vài phút với chương dài.
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={() => audioInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
            >
              <Music className="w-3.5 h-3.5" /> {audioFile ? "Đổi file audio" : "Chọn file audio (.mp3)"}
            </button>
            {audioFile && <span className="text-xs text-slate-500 truncate max-w-[220px]">{audioFile.name}</span>}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleSelectAudio}
              className="hidden"
            />
          </div>

          <button
            onClick={handleRenderVideo}
            disabled={rendering || !audioFile}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            🎬 Tự Động Render Video MP4
          </button>

          {rendering && (
            <div className="mt-3">
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {renderStatus} {renderProgress > 0 && `(${renderProgress}%)`}
              </p>
            </div>
          )}

          {videoUrl && (
            <div className="mt-4 space-y-2">
              <video src={videoUrl} controls className="w-full rounded-xl border border-violet-100" />
              <button
                onClick={handleDownloadVideo}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" /> Tải Video MP4 Hoàn Chỉnh
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
