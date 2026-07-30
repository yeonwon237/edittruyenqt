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
  TTS_AI_PROVIDERS,
  getTtsProvider,
  saveTtsProvider,
  hasGcpTtsKey,
  getGcpTtsKey,
  saveGcpTtsKey,
  getGcpTtsVoice,
  saveGcpTtsVoice,
  generateGcpSpeech,
  GCP_TTS_VOICES,
  hasOpenAiKey,
  getOpenAiTtsVoice,
  saveOpenAiTtsVoice,
  generateOpenAiSpeech,
  OPENAI_TTS_VOICES,
  hasElevenLabsKey,
  getElevenLabsKey,
  saveElevenLabsKey,
  getElevenLabsVoiceId,
  saveElevenLabsVoiceId,
  generateElevenLabsSpeech,
  hasGeminiKey,
  getGeminiTtsModel,
  saveGeminiTtsModel,
  getGeminiTtsVoice,
  saveGeminiTtsVoice,
  generateGeminiSpeech,
  GEMINI_TTS_VOICES,
} from "@/lib/tts";

// Per-provider setup notes shown above the key input — each is a different
// product with its own account/CORS/quirks (see src/lib/tts.js).
const PROVIDER_HINTS = {
  gcp: {
    keyLabel: "Google Cloud API Key",
    setup: (
      <ol className="list-decimal list-inside mt-2 space-y-1">
        <li>Vào <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">console.cloud.google.com</a>, tạo (hoặc chọn) 1 dự án.</li>
        <li>Vào "APIs & Services" → tìm bật "Cloud Text-to-Speech API".</li>
        <li>Google có thể yêu cầu liên kết thẻ tín dụng (billing) để bật API này — vẫn miễn phí trong hạn mức (Wavenet: 1 triệu ký tự/tháng).</li>
        <li>Vào "Credentials" → "Create Credentials" → "API key". Copy dán vào ô bên dưới.</li>
      </ol>
    ),
  },
  openai: {
    keyLabel: null, // reuses the key already saved for AI Edit — no input needed
    setup: (
      <p className="mt-2">Dùng chung API Key OpenAI bạn đã nhập ở phần Auto Edit (Cài đặt → AI). Nếu chưa có, vào Cài đặt để thêm.</p>
    ),
  },
  elevenlabs: {
    keyLabel: "ElevenLabs API Key",
    setup: (
      <ol className="list-decimal list-inside mt-2 space-y-1">
        <li>Đăng ký tại <a href="https://elevenlabs.io/" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">elevenlabs.io</a>.</li>
        <li>Vào phần Profile (góc trên phải) → "API Keys" → tạo key mới, copy dán vào ô bên dưới.</li>
        <li>Gói miễn phí giới hạn khá ít ký tự/tháng — dùng cho truyện dài sẽ cần nâng cấp gói trả phí.</li>
      </ol>
    ),
  },
  gemini: {
    keyLabel: null, // reuses the key already saved for AI Edit — no input needed
    setup: (
      <p className="mt-2">Dùng chung API Key Gemini bạn đã nhập ở phần Auto Edit (Cài đặt → AI). Nếu chưa có, vào Cài đặt để thêm.</p>
    ),
  },
};

export default function TextToSpeech() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [text, setText] = useState("");

  // Browser TTS state (free quick preview)
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [browserStatus, setBrowserStatus] = useState("idle"); // idle | playing | paused

  const computeProviderReady = (p) => ({
    gcp: hasGcpTtsKey(),
    openai: hasOpenAiKey(),
    elevenlabs: hasElevenLabsKey(),
    gemini: hasGeminiKey(),
  }[p]);

  // AI TTS provider selection
  const [provider, setProvider] = useState(getTtsProvider());
  const [providerReady, setProviderReady] = useState(() => computeProviderReady(getTtsProvider()));

  // Per-provider key inputs (draft, before "Lưu")
  const [gcpKeyInput, setGcpKeyInput] = useState(getGcpTtsKey());
  const [elevenKeyInput, setElevenKeyInput] = useState(getElevenLabsKey());
  const [showKey, setShowKey] = useState(false);

  // Per-provider voice selection
  const [gcpVoice, setGcpVoice] = useState(getGcpTtsVoice());
  const [openaiVoice, setOpenaiVoice] = useState(getOpenAiTtsVoice());
  const [elevenVoiceId, setElevenVoiceId] = useState(getElevenLabsVoiceId());
  const [geminiVoice, setGeminiVoice] = useState(getGeminiTtsVoice());
  const [geminiModel, setGeminiModel] = useState(getGeminiTtsModel());
  const [aiSpeed, setAiSpeed] = useState(1);

  // Shared generation state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { i, total }
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handlePlayBrowser = () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để đọc", variant: "destructive" });
      return;
    }
    setBrowserStatus("playing");
    speakWithBrowser(text, { voiceURI, rate, onEnd: () => setBrowserStatus("idle") });
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

  const handleChangeProvider = (p) => {
    setProvider(p);
    saveTtsProvider(p);
    setShowKey(false);
    setProviderReady(computeProviderReady(p));
  };

  const handleSaveKey = () => {
    if (provider === "gcp") {
      saveGcpTtsKey(gcpKeyInput);
    } else if (provider === "elevenlabs") {
      saveElevenLabsKey(elevenKeyInput);
    }
    toast({ title: "Đã lưu ✅" });
    setProviderReady(computeProviderReady(provider));
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để tạo audio", variant: "destructive" });
      return;
    }
    setLoading(true);
    setProgress(null);
    try {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      let result;
      const onProgress = (i, total) => setProgress({ i, total });
      if (provider === "gcp") {
        saveGcpTtsVoice(gcpVoice);
        result = await generateGcpSpeech(text, { voiceName: gcpVoice, speed: aiSpeed, onProgress });
      } else if (provider === "openai") {
        saveOpenAiTtsVoice(openaiVoice);
        result = await generateOpenAiSpeech(text, { voice: openaiVoice, speed: aiSpeed, onProgress });
      } else if (provider === "elevenlabs") {
        saveElevenLabsVoiceId(elevenVoiceId);
        result = await generateElevenLabsSpeech(text, { voiceId: elevenVoiceId, speed: aiSpeed, onProgress });
      } else if (provider === "gemini") {
        saveGeminiTtsVoice(geminiVoice);
        saveGeminiTtsModel(geminiModel);
        result = await generateGeminiSpeech(text, { voiceName: geminiVoice, model: geminiModel, speed: aiSpeed, onProgress });
      }
      setAudioUrl(result.url);
      setAudioBlob(result.blob);
      toast({ title: "🎧 Đã tạo xong audio!" });
      setTimeout(() => audioRef.current?.play(), 50);
    } catch (e) {
      toast({ title: "Lỗi tạo audio", description: e.message, variant: "destructive" });
    }
    setLoading(false);
    setProgress(null);
  };

  const handleDownload = () => {
    if (!audioBlob) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    const safeName = (fileName.trim() || `audio-${Date.now()}`).replace(/[/\\?%*:|"<>]/g, "-");
    a.download = safeName.toLowerCase().endsWith(".mp3") ? safeName : `${safeName}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const charCount = text.length;
  const hint = PROVIDER_HINTS[provider];

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

        {/* AI TTS — downloadable, audiobook quality. Provider is a choice. */}
        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-4 h-4 text-violet-500" /> Tạo Audio (AI)
          </h2>
          <p className="text-xs text-slate-400 mb-3">Chọn dịch vụ đọc bên dưới — mỗi dịch vụ cần API Key riêng.</p>

          {/* Provider tabs */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TTS_AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleChangeProvider(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  provider === p.id
                    ? "bg-violet-600 text-white"
                    : "bg-violet-50 text-slate-600 hover:bg-violet-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {TTS_AI_PROVIDERS.find((p) => p.id === provider)?.note}
          </p>

          {!providerReady && (
            <details className="mb-3 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <summary className="cursor-pointer font-medium text-violet-600">Cách lấy {hint.keyLabel || "API Key"}</summary>
              {hint.setup}
            </details>
          )}

          {/* Key input — OpenAI/Gemini have none, both reuse the existing AI Edit key */}
          {provider !== "openai" && provider !== "gemini" && (
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={provider === "gcp" ? gcpKeyInput : elevenKeyInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (provider === "gcp") setGcpKeyInput(v);
                      else setElevenKeyInput(v);
                    }}
                    placeholder={`Dán ${hint.keyLabel} vào đây...`}
                    className="w-full pl-3 pr-9 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-violet-600"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveKey}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  {providerReady ? <Check className="w-3.5 h-3.5" /> : null} Lưu
                </button>
              </div>
            </div>
          )}

          {providerReady && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Giọng đọc</label>
                {provider === "gcp" && (
                  <select
                    value={gcpVoice}
                    onChange={(e) => setGcpVoice(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  >
                    {GCP_TTS_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                )}
                {provider === "openai" && (
                  <select
                    value={openaiVoice}
                    onChange={(e) => setOpenaiVoice(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  >
                    {OPENAI_TTS_VOICES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
                {provider === "elevenlabs" && (
                  <input
                    value={elevenVoiceId}
                    onChange={(e) => setElevenVoiceId(e.target.value)}
                    placeholder="Voice ID (lấy từ ElevenLabs Voice Library)"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                )}
                {provider === "gemini" && (
                  <select
                    value={geminiVoice}
                    onChange={(e) => setGeminiVoice(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  >
                    {GEMINI_TTS_VOICES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
              </div>

              {provider === "gemini" && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Model (nâng cao — chỉ sửa nếu bị lỗi model không tồn tại)
                  </label>
                  <input
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Tốc độ đọc: {aiSpeed.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={aiSpeed}
                  onChange={(e) => setAiSpeed(parseFloat(e.target.value))}
                  className="w-full accent-violet-600"
                />
                {provider === "gemini" && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠️ Gemini không có tuỳ chỉnh tốc độ chính xác như 3 dịch vụ kia — chỉ điều chỉnh gần đúng, có thể không rõ rệt.
                  </p>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white text-sm font-semibold transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading
                  ? progress
                    ? `Đang tạo đoạn ${progress.i}/${progress.total}...`
                    : "Đang tạo audio..."
                  : "Tạo audio"}
              </button>

              {audioUrl && (
                <div className="space-y-2 pt-1 border-t border-violet-50">
                  <audio ref={audioRef} src={audioUrl} controls className="w-full" />
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
