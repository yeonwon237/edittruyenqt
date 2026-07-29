import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Volume2,
  Play,
  Pause,
  Square,
  Loader2,
  Sparkles,
  Download,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  supportsBrowserTts,
  loadBrowserVoices,
  speakWithBrowser,
  pauseBrowser,
  resumeBrowser,
  stopBrowser,
  hasGcpTtsKey,
  getGcpTtsKey,
  saveGcpTtsKey,
  getGcpTtsVoice,
  saveGcpTtsVoice,
  generateGcpSpeech,
  GCP_TTS_VOICES,
} from "@/lib/tts";

export default function TextToSpeech() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [text, setText] = useState("");

  // Browser TTS state (free quick preview)
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [browserStatus, setBrowserStatus] = useState("idle"); // idle | playing | paused

  // Google Cloud TTS state (downloadable audiobook-quality)
  const [gcpKeyInput, setGcpKeyInput] = useState(getGcpTtsKey());
  const [gcpKeySaved, setGcpKeySaved] = useState(hasGcpTtsKey());
  const [showGcpKey, setShowGcpKey] = useState(false);
  const [gcpVoice, setGcpVoice] = useState(getGcpTtsVoice());
  const [gcpLoading, setGcpLoading] = useState(false);
  const [gcpProgress, setGcpProgress] = useState(null); // { i, total }
  const [gcpAudioUrl, setGcpAudioUrl] = useState("");
  const [gcpAudioBlob, setGcpAudioBlob] = useState(null);
  const [fileName, setFileName] = useState("");
  const audioRef = useRef(null);

  const browserSupported = supportsBrowserTts();

  useEffect(() => {
    if (!browserSupported) return;
    loadBrowserVoices().then((list) => {
      setVoices(list);
      const vi = list.find((v) => v.lang?.toLowerCase().startsWith("vi"));
      setVoiceURI(vi?.voiceURI || list[0]?.voiceURI || "");
    });
    return () => stopBrowser();
  }, [browserSupported]);

  useEffect(() => {
    return () => {
      if (gcpAudioUrl) URL.revokeObjectURL(gcpAudioUrl);
    };
  }, [gcpAudioUrl]);

  const handlePlayBrowser = () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để đọc", variant: "destructive" });
      return;
    }
    setBrowserStatus("playing");
    speakWithBrowser(text, {
      voiceURI,
      rate,
      onEnd: () => setBrowserStatus("idle"),
    });
  };

  const handlePauseResumeBrowser = () => {
    if (browserStatus === "playing") {
      pauseBrowser();
      setBrowserStatus("paused");
    } else if (browserStatus === "paused") {
      resumeBrowser();
      setBrowserStatus("playing");
    }
  };

  const handleStopBrowser = () => {
    stopBrowser();
    setBrowserStatus("idle");
  };

  const handleSaveGcpKey = () => {
    saveGcpTtsKey(gcpKeyInput);
    setGcpKeySaved(!!gcpKeyInput.trim());
    toast({ title: gcpKeyInput.trim() ? "Đã lưu API Key ✅" : "Đã xoá API Key" });
  };

  const handleGenerateGcp = async () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để tạo audio", variant: "destructive" });
      return;
    }
    setGcpLoading(true);
    setGcpProgress(null);
    try {
      if (gcpAudioUrl) URL.revokeObjectURL(gcpAudioUrl);
      saveGcpTtsVoice(gcpVoice);
      const { blob, url } = await generateGcpSpeech(text, {
        voiceName: gcpVoice,
        onProgress: (i, total) => setGcpProgress({ i, total }),
      });
      setGcpAudioUrl(url);
      setGcpAudioBlob(blob);
      toast({ title: "🎧 Đã tạo xong audio!" });
      setTimeout(() => audioRef.current?.play(), 50);
    } catch (e) {
      toast({ title: "Lỗi Google Cloud TTS", description: e.message, variant: "destructive" });
    }
    setGcpLoading(false);
    setGcpProgress(null);
  };

  const handleDownload = () => {
    if (!gcpAudioBlob) return;
    const a = document.createElement("a");
    a.href = gcpAudioUrl;
    const safeName = (fileName.trim() || `audio-${Date.now()}`).replace(/[/\\?%*:|"<>]/g, "-");
    a.download = safeName.toLowerCase().endsWith(".mp3") ? safeName : `${safeName}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const charCount = text.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Volume2 className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              Tạo Audio Truyện
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Dán văn bản vào, tạo file âm thanh, tải về máy
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Text input */}
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dán văn bản (Bản Edit của chương, hoặc bất kỳ đoạn nào) vào đây..."
            rows={12}
            className="w-full px-3 py-2.5 text-sm leading-7 rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors resize-none"
          />
          <p className="text-xs text-slate-400 mt-1.5 text-right">{charCount.toLocaleString("vi")} ký tự</p>
        </div>

        {/* Google Cloud TTS — main path: downloadable, audiobook quality */}
        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-4 h-4 text-violet-500" /> Tạo Audio (Google Cloud TTS)
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Giọng tự nhiên, tải về được file .mp3. Cần API Key riêng của Google Cloud (khác với key Gemini/GPT/Claude
            dùng để Auto Edit) — xem hướng dẫn lấy key bên dưới nếu chưa có.
          </p>

          {!gcpKeySaved && (
            <details className="mb-3 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <summary className="cursor-pointer font-medium text-violet-600">Cách lấy Google Cloud TTS API Key</summary>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Vào <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">console.cloud.google.com</a>, tạo (hoặc chọn) 1 dự án.</li>
                <li>Vào mục "APIs & Services" → tìm bật "Cloud Text-to-Speech API".</li>
                <li>Google có thể yêu cầu bạn liên kết thẻ/tài khoản thanh toán (billing) để bật API này — kể cả khi dùng trong hạn mức miễn phí (WaveNet miễn phí tới 1 triệu ký tự/tháng), đây là yêu cầu của Google chứ không tính phí ngay nếu chưa vượt hạn mức.</li>
                <li>Vào "Credentials" → "Create Credentials" → "API key". Copy key vừa tạo, dán vào ô bên dưới.</li>
              </ol>
            </details>
          )}

          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <input
                type={showGcpKey ? "text" : "password"}
                value={gcpKeyInput}
                onChange={(e) => setGcpKeyInput(e.target.value)}
                placeholder="Dán Google Cloud API Key vào đây..."
                className="w-full pl-3 pr-9 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
              />
              <button
                onClick={() => setShowGcpKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-violet-600"
              >
                {showGcpKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleSaveGcpKey}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors shrink-0"
            >
              {gcpKeySaved ? <Check className="w-3.5 h-3.5" /> : null} Lưu
            </button>
          </div>

          {gcpKeySaved && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Giọng đọc</label>
                <select
                  value={gcpVoice}
                  onChange={(e) => setGcpVoice(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                >
                  {GCP_TTS_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateGcp}
                disabled={gcpLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white text-sm font-semibold transition-all disabled:opacity-50"
              >
                {gcpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {gcpLoading
                  ? gcpProgress
                    ? `Đang tạo đoạn ${gcpProgress.i}/${gcpProgress.total}...`
                    : "Đang tạo audio..."
                  : "Tạo audio"}
              </button>

              {gcpAudioUrl && (
                <div className="space-y-2 pt-1 border-t border-violet-50">
                  <audio ref={audioRef} src={gcpAudioUrl} controls className="w-full" />
                  <div className="flex items-center gap-2">
                    <input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="Tên file (không cần .mp3)..."
                      className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                    />
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" /> Tải về .mp3
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Browser TTS — free quick preview, not downloadable */}
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
            🔊 Nghe thử nhanh bằng trình duyệt <span className="text-xs font-normal text-slate-400">(miễn phí, không tải về được)</span>
          </h2>
          {!browserSupported ? (
            <p className="text-sm text-slate-400">Trình duyệt này không hỗ trợ đọc văn bản.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Giọng đọc</label>
                  <select
                    value={voiceURI}
                    onChange={(e) => setVoiceURI(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  >
                    {voices.length === 0 && <option value="">Đang tải danh sách giọng...</option>}
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Tốc độ đọc: {rate.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-violet-600"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {browserStatus === "idle" ? (
                  <button
                    onClick={handlePlayBrowser}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                  >
                    <Play className="w-4 h-4" /> Đọc
                  </button>
                ) : (
                  <button
                    onClick={handlePauseResumeBrowser}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                  >
                    {browserStatus === "playing" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {browserStatus === "playing" ? "Tạm dừng" : "Tiếp tục"}
                  </button>
                )}
                <button
                  onClick={handleStopBrowser}
                  disabled={browserStatus === "idle"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Square className="w-3.5 h-3.5" /> Dừng
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
