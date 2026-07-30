import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Captions, Download, Loader2, Music } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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

function formatMinSec(totalSeconds) {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} phút ${sec} giây`;
}

export default function CreateSubtitle() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const audioInputRef = useRef(null);

  const [title, setTitle] = useState("");
  const [chapterText, setChapterText] = useState("");
  const [readingWpm, setReadingWpm] = useState(DEFAULT_READING_WPM);
  const [timingMode, setTimingMode] = useState("audio"); // "audio" | "wpm"
  const [audioFile, setAudioFile] = useState(null);
  const [detectedAudioDuration, setDetectedAudioDuration] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [subtitleLines, setSubtitleLines] = useState([]);

  const subtitleFileBaseName = (title.trim() || "phu-de").replace(/[/\\?%*:|"<>]/g, "-");

  const handleSelectAudio = (e) => {
    const file = e.target.files?.[0];
    if (file) setAudioFile(file);
  };

  const updateSubtitleLine = (id, patch) => {
    setSubtitleLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleGenerateSubtitles = async () => {
    if (!chapterText.trim()) {
      toast({ title: "Dán văn bản chương vào trước đã", variant: "destructive" });
      return;
    }
    if (timingMode === "audio" && !audioFile) {
      toast({ title: "Chưa có file audio", description: "Chọn file .mp3 ở trên trước.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      let lines;
      if (timingMode === "audio") {
        const duration = await getAudioDuration(audioFile);
        setDetectedAudioDuration(duration);
        lines = generateSubtitleLinesFromDuration(chapterText, duration);
      } else {
        lines = generateSubtitleLines(chapterText, readingWpm);
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
    setGenerating(false);
  };

  const handleDownloadSrt = () => {
    if (!subtitleLines.length) return;
    downloadSrt(subtitleLines, subtitleFileBaseName);
  };

  const handleDownloadVtt = () => {
    if (!subtitleLines.length) return;
    downloadVtt(subtitleLines, subtitleFileBaseName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Captions className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">Tạo Phụ Đề</h1>
            <p className="text-xs text-slate-400 hidden sm:block">Tự tách câu, căn thời gian, tải .srt / .vtt</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="rounded-2xl bg-white border border-violet-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-1">
            <Captions className="w-4 h-4 text-sky-500" /> Tạo Phụ Đề (.srt / .vtt)
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Dán văn bản chương, hệ thống tự tách câu và tính thời gian, rồi cho sửa tay trước khi tải về.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Tên bộ truyện (để đặt tên file)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Cơ Duyên Thiên Hạ"
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Văn bản chương truyện</label>
              <textarea
                value={chapterText}
                onChange={(e) => setChapterText(e.target.value)}
                rows={8}
                placeholder="Dán nội dung chương vào đây..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 resize-y"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Cách tính thời gian</label>
              <div className="flex gap-1.5 mb-2">
                <button
                  onClick={() => setTimingMode("audio")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    timingMode === "audio" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🎧 Đồng bộ theo Audio (chính xác)
                </button>
                <button
                  onClick={() => setTimingMode("wpm")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    timingMode === "wpm" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📖 Theo tốc độ đọc (ước lượng)
                </button>
              </div>

              {timingMode === "audio" ? (
                <div className="mb-2">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium"
                    >
                      <Music className="w-3.5 h-3.5" /> {audioFile ? "Đổi file audio" : "Thêm file audio (.mp3)"}
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
                  <p className="text-[11px] text-slate-400">
                    {audioFile ? (
                      <>
                        Sẽ đo thời lượng thật của file trên và chia đều cho từng câu theo số từ — không cần biết tốc độ đọc là bao nhiêu, khớp đúng với giọng đọc thật.
                        {detectedAudioDuration > 0 && ` Lần trước đo được: ${formatMinSec(detectedAudioDuration)}.`}
                      </>
                    ) : (
                      <>Chưa có file audio — thêm file .mp3 ở trên trước khi tạo.</>
                    )}
                  </p>
                </div>
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
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Captions className="w-3.5 h-3.5" />}
                Tạo Phụ Đề Tự Động
              </button>
            </div>

            {subtitleLines.length > 0 && (
              <>
                <div className="max-h-96 overflow-y-auto rounded-xl border border-violet-100 divide-y divide-violet-50">
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
      </main>
    </div>
  );
}
