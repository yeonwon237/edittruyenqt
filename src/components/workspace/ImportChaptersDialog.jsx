import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

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
  const [text, setText] = useState("");
  const [presetKey, setPresetKey] = useState("vi");
  const [customPattern, setCustomPattern] = useState("");
  const [targetColumn, setTargetColumn] = useState("raw_original");
  const [importing, setImporting] = useState(false);

  const pattern = presetKey === "custom" ? customPattern : PRESETS[presetKey].source;

  const parsed = useMemo(() => {
    if (!text.trim() || !pattern) return [];
    const result = splitByHeadingRegex(text, pattern);
    return result || [];
  }, [text, pattern]);

  const handleClose = (v) => {
    if (!v) {
      setText("");
      setPresetKey("vi");
      setCustomPattern("");
      setTargetColumn("raw_original");
    }
    onOpenChange(v);
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
            <Upload className="w-4 h-4" /> Nhập hàng loạt & tự tách chương
          </DialogTitle>
          <DialogDescription>
            Dán toàn bộ nội dung (nhiều chương) vào đây. App sẽ tự động tách theo tiêu đề
            chương và tạo mỗi chương riêng — không cần tạo tay từng chương.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dán toàn bộ văn bản gồm nhiều chương vào đây..."
            rows={8}
            className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 resize-none font-mono"
          />

          <div className="grid grid-cols-2 gap-3">
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

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 max-h-52 overflow-y-auto cute-scrollbar">
            <p className="text-xs font-medium text-violet-700 mb-2">
              {parsed.length > 0
                ? `Xem trước: phát hiện ${parsed.length} chương`
                : "Chưa có gì để xem trước — dán văn bản ở trên"}
            </p>
            {parsed.map((c, i) => (
              <div key={i} className="text-xs text-slate-600 py-1 border-b border-violet-100 last:border-0">
                <span className="font-semibold">{c.title}</span>{" "}
                <span className="text-slate-400">({c.content.length.toLocaleString("vi")} ký tự)</span>
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
