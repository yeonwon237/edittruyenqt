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
  Captions,
  Mic,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  supportsBrowserTts,
  supportsBrowserTtsRecording,
  loadBrowserVoices,
  speakWithBrowser,
  recordBrowserSpeech,
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
import {
  DEFAULT_READING_WPM,
  MIN_READING_WPM,
  MAX_READING_WPM,
  generateSubtitleLines,
  generateSubtitleLinesFromDuration,
  getAudioDuration,
  downloadSrt,
  downloadVtt,
} from "@/lib/subtitles";
import { convertAudioToMp3 } from "@/lib/videoRender";

function formatMinSec(totalSeconds) {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} phút ${sec} giây`;
}

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

  // Browser TTS recording (tab-capture workaround — see recordBrowserSpeech)
  const [recordingBrowser, setRecordingBrowser] = useState(false);
  const [browserRecordStatus, setBrowserRecordStatus] = useState("");
  const [browserAudioBlob, setBrowserAudioBlob] = useState(null);
  const [browserAudioUrl, setBrowserAudioUrl] = useState("");
  const [convertingMp3, setConvertingMp3] = useState(false);
  const [mp3ConvertProgress, setMp3ConvertProgress] = useState(0);
  const [browserRecordError, setBrowserRecordError] = useState("");

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

  // Subtitle generation — reuses the same `text` and `audioBlob` already on
  // this page (no separate paste-box or file picker needed, unlike the
  // standalone /create-subtitle page): the audio was already made from this
  // exact text, so both timing modes work with zero extra input.
  const [readingWpm, setReadingWpm] = useState(DEFAULT_READING_WPM);
  const [timingMode, setTimingMode] = useState("audio"); // "audio" | "wpm"
  const [detectedAudioDuration, setDetectedAudioDuration] = useState(0);
  const [generatingSubtitles, setGeneratingSubtitles] = useState(false);
  const [subtitleLines, setSubtitleLines] = useState([]);

  const browserSupported = supportsBrowserTts();
  const browserRecordingSupported = supportsBrowserTtsRecording();

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

  useEffect(() => {
    return () => {
      if (browserAudioUrl) URL.revokeObjectURL(browserAudioUrl);
    };
  }, [browserAudioUrl]);

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

  const handleRecordBrowser = async () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để đọc", variant: "destructive" });
      return;
    }
    // Recording takes over from any ongoing preview playback (it cancels and
    // restarts the speech internally) — reset the preview UI so it doesn't
    // show a stale "Tạm dừng"/"Dừng" state while recording runs.
    setBrowserStatus("idle");
    setRecordingBrowser(true);
    setBrowserRecordStatus("");
    setBrowserRecordError("");
    try {
      if (browserAudioUrl) URL.revokeObjectURL(browserAudioUrl);
      setBrowserAudioBlob(null);
      setBrowserAudioUrl("");
      const blob = await recordBrowserSpeech(text, { voiceURI, rate, onStatus: setBrowserRecordStatus });
      setBrowserAudioBlob(blob);
      setBrowserAudioUrl(URL.createObjectURL(blob));
      toast({ title: "🎙️ Đã ghi xong giọng đọc!" });
    } catch (e) {
      setBrowserRecordError(e.message);
      toast({ title: "Không ghi được audio", description: e.message, variant: "destructive" });
    }
    setRecordingBrowser(false);
    setBrowserRecordStatus("");
  };

  const handleDownloadBrowserWebm = () => {
    if (!browserAudioBlob) return;
    const a = document.createElement("a");
    a.href = browserAudioUrl;
    const safeName = (fileName.trim() || `giong-may-${Date.now()}`).replace(/[/\\?%*:|"<>]/g, "-");
    a.download = `${safeName}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleConvertAndDownloadMp3 = async () => {
    if (!browserAudioBlob) return;
    setConvertingMp3(true);
    setMp3ConvertProgress(0);
    try {
      const mp3Blob = await convertAudioToMp3(browserAudioBlob, {
        onProgress: setMp3ConvertProgress,
        onStatus: setBrowserRecordStatus,
      });
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (fileName.trim() || `giong-may-${Date.now()}`).replace(/[/\\?%*:|"<>]/g, "-");
      a.download = `${safeName}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: "🎧 Đã chuyển và tải file .mp3!" });
    } catch (e) {
      toast({ title: "Lỗi chuyển đổi mp3", description: e.message, variant: "destructive" });
    }
    setConvertingMp3(false);
    setBrowserRecordStatus("");
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

  const subtitleFileBaseName = (fileName.trim() || "phu-de").replace(/[/\\?%*:|"<>]/g, "-");

  const handleGenerateSubtitles = async () => {
    if (!text.trim()) {
      toast({ title: "Chưa có văn bản để tạo phụ đề", variant: "destructive" });
      return;
    }
    if (timingMode === "audio" && !audioBlob) {
      toast({ title: "Chưa có audio", description: "Bấm \"Tạo audio\" ở trên trước, hoặc chuyển sang chế độ ước lượng theo tốc độ đọc.", variant: "destructive" });
      return;
    }

    setGeneratingSubtitles(true);
    try {
      let lines;
      if (timingMode === "audio") {
        const duration = await getAudioDuration(audioBlob);
        setDetectedAudioDuration(duration);
        lines = generateSubtitleLinesFromDuration(text, duration);
      } else {
        lines = generateSubtitleLines(text, readingWpm);
      }
      if (!lines.length) {
        toast({ title: "Không tách được câu nào từ văn bản này", variant: "destructive" });
        return;
      }
      setSubtitleLines(lines);
      toast({ title: `Đã tạo ${lines.length} dòng phụ đề`, description: "Xem và sửa lại nội dung/thời gian bên dưới trước khi tải." });
    } catch (e) {
      toast({ title: "Lỗi tạo phụ đề", description: e?.message, variant: "destructive" });
    }
    setGeneratingSubtitles(false);
  };

  const updateSubtitleLine = (id, patch) => {
    setSubtitleLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleDownloadSrt = () => {
    if (!subtitleLines.length) return;
    downloadSrt(subtitleLines, subtitleFileBaseName);
  };

  const handleDownloadVtt = () => {
    if (!subtitleLines.length) return;
    downloadVtt(subtitleLines, subtitleFileBaseName);
  };

  const charCount = text.length;
  const hint = PROVIDER_HINTS[provider];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/80 backdrop-blur-xl">
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
              Dán văn bản, tạo audio và phụ đề, tải về máy
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
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

        {/* Subtitle generator — reuses the text + audio already above */}
        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Captions className="w-4 h-4 text-sky-500" /> Tạo Phụ Đề (.srt / .vtt)
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Dùng luôn văn bản và audio ở trên để tự tách câu, căn thời gian, rồi cho sửa tay trước khi tải về.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Cách tính thời gian</label>
              <div className="flex gap-1.5 mb-2">
                <button
                  onClick={() => setTimingMode("audio")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    timingMode === "audio" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Đồng bộ theo audio đã tạo
                </button>
                <button
                  onClick={() => setTimingMode("wpm")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    timingMode === "wpm" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Ước lượng theo tốc độ đọc
                </button>
              </div>

              {timingMode === "audio" ? (
                <p className="text-[11px] text-slate-400 mb-2">
                  {audioBlob ? (
                    <>
                      Sẽ đo thời lượng thật của audio đã tạo ở trên và chia đều cho từng câu theo số từ — khớp đúng với giọng đọc thật.
                      {detectedAudioDuration > 0 && ` Lần trước đo được: ${formatMinSec(detectedAudioDuration)}.`}
                    </>
                  ) : (
                    <>Chưa có audio — bấm "Tạo audio" ở mục trên trước, hoặc chuyển sang chế độ ước lượng.</>
                  )}
                </p>
              ) : (
                <div className="mb-2">
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                    Tốc độ đọc: {readingWpm} từ/phút (chỉ là ước lượng)
                  </label>
                  <input
                    type="range"
                    min={MIN_READING_WPM}
                    max={MAX_READING_WPM}
                    value={readingWpm}
                    onChange={(e) => setReadingWpm(Number(e.target.value))}
                    className="w-40 accent-sky-600"
                  />
                </div>
              )}

              <button
                onClick={handleGenerateSubtitles}
                disabled={generatingSubtitles}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {generatingSubtitles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Captions className="w-3.5 h-3.5" />}
                Tạo Phụ Đề Tự Động
              </button>
            </div>

            {subtitleLines.length > 0 && (
              <>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-violet-100 divide-y divide-violet-50">
                  {subtitleLines.map((line) => (
                    <div key={line.id} className="p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-500 w-6 shrink-0">#{line.id}</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={Number(line.start.toFixed(1))}
                          onChange={(e) => updateSubtitleLine(line.id, { start: Number(e.target.value) })}
                          className="w-16 px-1.5 py-1 rounded-lg border border-violet-100 text-xs"
                        />
                        <span>→</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={Number(line.end.toFixed(1))}
                          onChange={(e) => updateSubtitleLine(line.id, { end: Number(e.target.value) })}
                          className="w-16 px-1.5 py-1 rounded-lg border border-violet-100 text-xs"
                        />
                        <span>giây</span>
                      </div>
                      <textarea
                        value={line.text}
                        onChange={(e) => updateSubtitleLine(line.id, { text: e.target.value })}
                        rows={1}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-violet-100 bg-slate-50/50 resize-none focus:outline-none focus:border-violet-400"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleDownloadSrt}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Tải File Phụ Đề .srt
                  </button>
                  <button
                    onClick={handleDownloadVtt}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-700 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Tải File Phụ Đề .vtt
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Browser TTS — free, quick preview + downloadable via tab-capture workaround */}
        <div className="rounded-2xl bg-white border border-violet-100 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
            Nghe thử nhanh bằng trình duyệt <span className="text-xs font-normal text-slate-400">(miễn phí — có thể ghi âm để tải về)</span>
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
                    disabled={recordingBrowser}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

              {/* Recording (tab-capture) — the only way to get a real file out of SpeechSynthesis */}
              <div className="pt-3 border-t border-violet-50 space-y-2">
                {browserRecordingSupported ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Ghi lại giọng đọc này thành file để tải về: trình duyệt sẽ hỏi chọn tab để chia sẻ —
                      chọn đúng <b>"Thẻ Chrome" / "Chrome Tab"</b> (không chọn "Toàn màn hình" hay "Cửa sổ") và
                      nhớ tick <b>"Chia sẻ âm thanh" / "Share tab audio"</b>, nếu không sẽ không có tiếng.
                      Chỉ hoạt động trên Chrome/Edge máy tính.
                    </p>
                    <button
                      onClick={handleRecordBrowser}
                      disabled={recordingBrowser}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {recordingBrowser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {recordingBrowser ? (browserRecordStatus || "Đang ghi âm...") : "Ghi âm để tải về"}
                    </button>

                    {browserRecordError && (
                      <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                        {browserRecordError}
                      </p>
                    )}

                    {browserAudioUrl && (
                      <div className="space-y-2 pt-1">
                        <audio src={browserAudioUrl} controls className="w-full" />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleDownloadBrowserWebm}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" /> Tải .webm (gốc)
                          </button>
                          <button
                            onClick={handleConvertAndDownloadMp3}
                            disabled={convertingMp3}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {convertingMp3 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            {convertingMp3
                              ? `${browserRecordStatus || "Đang chuyển đổi"}${mp3ConvertProgress ? ` (${mp3ConvertProgress}%)` : ""}`
                              : "Chuyển sang .mp3 & Tải"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Tải giọng đọc máy về file cần trình duyệt hỗ trợ ghi tab (chỉ Chrome/Edge trên máy tính) —
                    trình duyệt hiện tại không hỗ trợ. Dùng phần "Tạo Audio (AI)" ở trên để có file tải về được.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
