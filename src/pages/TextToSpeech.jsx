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
  Settings as SettingsIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  supportsBrowserTts,
  loadBrowserVoices,
  speakWithBrowser,
  pauseBrowser,
  resumeBrowser,
  stopBrowser,
  hasGeminiKey,
  generateGeminiSpeech,
  getTtsModel,
  saveTtsModel,
  getTtsVoice,
  saveTtsVoice,
  GEMINI_TTS_VOICES,
} from "@/lib/tts";

export default function TextToSpeech() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [text, setText] = useState("");

  // Browser TTS state
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [browserStatus, setBrowserStatus] = useState("idle"); // idle | playing | paused

  // Gemini TTS state
  const [geminiModel, setGeminiModel] = useState(getTtsModel());
  const [geminiVoice, setGeminiVoice] = useState(getTtsVoice());
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiAudioUrl, setGeminiAudioUrl] = useState("");
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);
  const audioRef = useRef(null);

  const browserSupported = supportsBrowserTts();
  const geminiAvailable = hasGeminiKey();

  useEffect(() => {
    if (!browserSupported) return;
    loadBrowserVoices().then((list) => {
      setVoices(list);
      // Prefer a Vietnamese voice by default if the browser/OS has one.
      const vi = list.find((v) => v.lang?.toLowerCase().startsWith("vi"));
      setVoiceURI(vi?.voiceURI || list[0]?.voiceURI || "");
    });
    return () => stopBrowser();
  }, [browserSupported]);

  useEffect(() => {
    return () => {
      if (geminiAudioUrl) URL.revokeObjectURL(geminiAudioUrl);
    };
  }, [geminiAudioUrl]);

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

  const handleGenerateGemini = async () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để đọc", variant: "destructive" });
      return;
    }
    setGeminiLoading(true);
    try {
      if (geminiAudioUrl) URL.revokeObjectURL(geminiAudioUrl);
      const url = await generateGeminiSpeech(text, { model: geminiModel, voiceName: geminiVoice });
      setGeminiAudioUrl(url);
      // Autoplay once ready.
      setTimeout(() => audioRef.current?.play(), 50);
    } catch (e) {
      toast({ title: "Lỗi Gemini TTS", description: e.message, variant: "destructive" });
    }
    setGeminiLoading(false);
  };

  const handleSaveGeminiSettings = () => {
    saveTtsModel(geminiModel);
    saveTtsVoice(geminiVoice);
    setShowGeminiSettings(false);
    toast({ title: "Đã lưu cài đặt Gemini TTS" });
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
              Đọc văn bản thành giọng nói
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Dán văn bản vào để nghe lại — hữu ích khi soát câu có mượt không
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
            placeholder="Dán đoạn văn bản (tiếng Việt hoặc ngôn ngữ khác) vào đây để nghe đọc..."
            rows={10}
            className="w-full px-3 py-2.5 text-sm leading-7 rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors resize-none"
          />
          <p className="text-xs text-slate-400 mt-1.5 text-right">{charCount.toLocaleString("vi")} ký tự</p>
        </div>

        {/* Browser TTS — always available */}
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
            🔊 Đọc bằng trình duyệt <span className="text-xs font-normal text-slate-400">(miễn phí, không cần cài gì)</span>
          </h2>
          {!browserSupported ? (
            <p className="text-sm text-slate-400">Trình duyệt này không hỗ trợ đọc văn bản. Hãy thử Chrome/Edge/Safari mới nhất.</p>
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
              {!voices.some((v) => v.lang?.toLowerCase().startsWith("vi")) && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  ⚠️ Máy/trình duyệt này không có sẵn giọng tiếng Việt — sẽ đọc bằng giọng ngôn ngữ khác, có thể không tự nhiên. Nếu cần giọng Việt chuẩn hơn, dùng "Đọc bằng Gemini" bên dưới.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Gemini TTS — optional, needs API key */}
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-500" /> Đọc bằng Gemini
              <span className="text-xs font-normal text-slate-400">(chất lượng cao hơn, tốn hạn mức Gemini riêng)</span>
            </h2>
            {geminiAvailable && (
              <button
                onClick={() => setShowGeminiSettings((s) => !s)}
                className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
                title="Cài đặt model/giọng Gemini TTS"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {!geminiAvailable ? (
            <p className="text-sm text-slate-400">
              Cần thêm Gemini API Key để dùng tính năng này.{" "}
              <button onClick={() => navigate("/settings")} className="text-violet-600 hover:underline font-medium">
                Vào Cài đặt để thêm
              </button>
            </p>
          ) : (
            <div className="space-y-3">
              {showGeminiSettings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-violet-50/50 border border-violet-100">
                  <div>
                    <label className="text-xs font-medium text-violet-700 mb-1 block">
                      Model TTS (kiểm tra tên đúng ở Google AI Studio nếu lỗi)
                    </label>
                    <input
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-violet-700 mb-1 block">Giọng đọc</label>
                    <select
                      value={geminiVoice}
                      onChange={(e) => setGeminiVoice(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
                    >
                      {GEMINI_TTS_VOICES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      onClick={handleSaveGeminiSettings}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
                    >
                      Lưu cài đặt
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={handleGenerateGemini}
                disabled={geminiLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white text-sm font-semibold transition-all disabled:opacity-50"
              >
                {geminiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {geminiLoading ? "Đang tạo giọng đọc..." : "Tạo & đọc bằng Gemini"}
              </button>
              {geminiAudioUrl && (
                <audio ref={audioRef} src={geminiAudioUrl} controls className="w-full mt-1" />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
