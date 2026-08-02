import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet } from "lucide-react";
import { parseChaptersFile } from "@/lib/importChapters";
import { useToast } from "@/components/ui/use-toast";

const CHUONG_KEYWORD = String.fromCharCode(0x43, 0x68, 0x01b0, 0x01a1, 0x6e, 0x67); // "Chương"

const PRESETS = {
  vi: { label: "Chương 1, Chương 2, ...", source: `^\\s*${CHUONG_KEYWORD}\\s+\\d+[^\\n]*` },
  en: { label: "Chapter 1, Chapter 2, ...", source: "^\\s*Chapter\\s+\\d+[^\\n]*" },
  custom: { label: "Tùy chỉnh (regex)", source: "" },
};

function splitByHeadingRegex(text, source) {
  let regex;
  try {
    regex = new RegExp(source, "gim");
  } catch {
    return null;
  }
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) {
    return [{ title: "Chương 1", content: text.trim() }].filter((c) => c.content);
  }
  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][0].trim();
    const contentStart = matches[i].index + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(contentStart, contentEnd).trim();
    chapters.push({ title: heading || `Chương ${i + 1}`, content });
  }
  return chapters;
}

export default function ImportChaptersDialog({ open, onOpenChange, onImport }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("paste"); // "paste" | "file"
  const [text, setText] = useState("");
  const [presetKey, setPresetKey] = useState("vi");
  const [customPattern, setCustomPattern] = useState("");
  const [targetColumn, setTargetColumn] = useState("raw_original");
  const [importing, setImporting] = useState(false);
  const [fileParsed, setFileParsed] = useState([]);
  const [fileName, setFileName] = useState("");
  const [txtFileName, setTxtFileName] = useState("");
  const fileInputRef = useRef(null);
  const txtFileInputRef = useRef(null);

  const pattern = presetKey === "custom" ? customPattern : PRESETS[presetKey].source;

  const pasteParsed = useMemo(() => {
    if (!text.trim() || !pattern) return [];
    const result = splitByHeadingRegex(text, pattern);
    return result || [];
  }, [text, pattern]);

  const parsed = mode === "file" ? fileParsed : pasteParsed;

  const handleClose = (v) => {
    if (!v) {
      setMode("paste");
      setText("");
      setPresetKey("vi");
      setCustomPattern("");
      setTargetColumn("raw_original");
      setFileParsed([]);
      setFileName("");
      setTxtFileName("");
    }
    onOpenChange(v);
  };

  const handleTxtFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      setTxtFileName(file.name);
    } catch (err) {
      toast({ title: "Lỗi đọc file", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const rows = parseChaptersFile(content, file.name);
      if (rows.length === 0) {
        toast({
          title: "File không có chương hợp lệ",
          description: "Cần cột tiêu đề (title/tên chương) hoặc nội dung (content/nội dung).",
          variant: "destructive",
        });
      }
      setFileParsed(rows);
      setFileName(file.name);
    } catch (err) {
      toast({ title: "Lỗi đọc file", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    try {
      await onImport(parsed, targetColumn);
      handleClose(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto cute-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Nhập hàng loạt chương
          </DialogTitle>
          <DialogDescription>
            Dán toàn bộ văn bản để app tự tách chương, hoặc tải lên file có sẵn cột
            Chương/Tiêu đề/Nội dung.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 p-1 rounded-xl bg-violet-50 border border-violet-100 w-fit">
          <button
            onClick={() => setMode("paste")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === "paste" ? "bg-violet-600 text-white" : "text-violet-600 hover:bg-violet-100"
            }`}
          >
            Dán & tự tách
          </button>
          <button
            onClick={() => setMode("file")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === "file" ? "bg-violet-600 text-white" : "text-violet-600 hover:bg-violet-100"
            }`}
          >
            Tải file có cột
          </button>
        </div>

        <div className="space-y-3">
          {mode === "paste" ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={txtFileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleTxtFileChange}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => txtFileInputRef.current?.click()}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> Tải file .txt lên
                </Button>
                {txtFileName && (
                  <span className="text-xs text-slate-400">Đã tải: {txtFileName}</span>
                )}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Dán toàn bộ văn bản gồm nhiều chương vào đây, hoặc tải file .txt lên ở trên..."
                rows={8}
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 resize-none font-mono"
              />
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Kiểu tiêu đề chương
                </label>
                <select
                  value={presetKey}
                  onChange={(e) => setPresetKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                >
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <option key={k} value={k}>{p.label}</option>
                  ))}
                </select>
              </div>
              {presetKey === "custom" && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Regex nhận diện tiêu đề chương (mỗi dòng khớp = 1 chương mới)
                  </label>
                  <input
                    value={customPattern}
                    onChange={(e) => setCustomPattern(e.target.value)}
                    placeholder="VD: ^\\s*Hồi\\s+\\d+[^\\n]*"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 font-mono"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-violet-200 p-6 text-center">
              <FileSpreadsheet className="w-8 h-8 text-violet-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500 mb-3">
                File CSV/TSV có cột: <b>Chương</b> (số thứ tự, tùy chọn), <b>Title</b> (tên
                chương), <b>Nội dung</b>. Tên cột có thể là tiếng Việt hoặc tiếng Anh.
                <br />
                File .txt thuần (chưa tách cột) → dùng tab "Dán &amp; tự tách" và bấm "Tải file
                .txt lên".
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-violet-200 text-violet-600 rounded-xl"
              >
                <Upload className="w-3.5 h-3.5 mr-1" /> Chọn file
              </Button>
              {fileName && <p className="text-xs text-slate-400 mt-2">Đã chọn: {fileName}</p>}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Đưa nội dung vào cột
            </label>
            <select
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              <option value="raw_original">Cột 1: Văn bản gốc</option>
              <option value="qt_raw">Cột 2: QT thô</option>
              <option value="edited">Cột 3: Bản Edit</option>
            </select>
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 max-h-52 overflow-y-auto cute-scrollbar">
            <p className="text-xs font-medium text-violet-700 mb-2">
              {parsed.length > 0
                ? `Xem trước: phát hiện ${parsed.length} chương`
                : "Chưa có gì để xem trước"}
            </p>
            {parsed.map((c, i) => (
              <div key={i} className="text-xs text-slate-600 py-1 border-b border-violet-100 last:border-0">
                <span className="font-semibold">{c.title}</span>{" "}
                <span className="text-slate-400">({(c.content || "").length.toLocaleString("vi")} ký tự)</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsed.length === 0 || importing}
            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
          >
            {importing ? "Đang nhập..." : `Nhập ${parsed.length} chương`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
