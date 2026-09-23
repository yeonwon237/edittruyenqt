import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpToLine, RotateCcw, Upload, FileSpreadsheet, Loader2, ListOrdered } from "lucide-react";
import {
  CHAPTER_HEADING_PRESETS,
  detectHeadingPreset,
  parseChaptersFile,
  splitByBlankLineTitles,
  splitByHeadingRegex,
} from "@/lib/importChapters";
import {
  extractTextFromDocx,
  extractTextFromPdf,
  extractChaptersFromEpub,
  epubChaptersToMarkedText,
  EPUB_CHAPTER_REGEX_SOURCE,
} from "@/lib/documentImport";
import {
  NUMBERING_TEMPLATES,
  findRepeatedLines,
  headingRegexForTemplate,
  numberChapters,
} from "@/lib/chapterNumbering";
import { useToast } from "@/components/ui/use-toast";

export default function ImportChaptersDialog({ open, onOpenChange, onImport, existingChapterCount = 0 }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("paste"); // "paste" | "file"
  const [text, setText] = useState("");
  const [presetKey, setPresetKey] = useState("vi");
  const [customPattern, setCustomPattern] = useState("");
  const [targetColumn, setTargetColumn] = useState("raw_original");
  const [importAction, setImportAction] = useState("create");
  const [importing, setImporting] = useState(false);
  const [fileParsed, setFileParsed] = useState([]);
  const [fileName, setFileName] = useState("");
  const [txtFileName, setTxtFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);
  const txtFileInputRef = useRef(null);
  const [numberingOpen, setNumberingOpen] = useState(false);
  const [numberingMarker, setNumberingMarker] = useState("");
  const [numberingTemplate, setNumberingTemplate] = useState(NUMBERING_TEMPLATES[0]);
  const [numberingStart, setNumberingStart] = useState(1);
  const [textBeforeNumbering, setTextBeforeNumbering] = useState(null);

  const pattern = presetKey === "custom" ? customPattern : CHAPTER_HEADING_PRESETS[presetKey].source;

  // Repeated short lines (e.g. the book name at the top of every chapter)
  // are the candidates for "this line marks a chapter start".
  const repeatedLines = useMemo(
    () => (numberingOpen ? findRepeatedLines(text) : []),
    [numberingOpen, text]
  );
  useEffect(() => {
    if (!numberingOpen) return;
    if (!repeatedLines.some((r) => r.line === numberingMarker)) {
      setNumberingMarker(repeatedLines[0]?.line || "");
    }
  }, [numberingOpen, repeatedLines, numberingMarker]);

  const applyNumbering = () => {
    const result = numberChapters(text, {
      marker: numberingMarker,
      template: numberingTemplate,
      start: numberingStart,
    });
    if (result.count === 0) {
      toast({ title: "Không có dòng nào để đánh số", variant: "destructive" });
      return;
    }
    setTextBeforeNumbering({ text, presetKey, customPattern });
    setText(result.text);
    // EPUB text keeps its own marker-line split pattern; anything else is
    // re-split on the headings just written.
    if (!(presetKey === "custom" && customPattern === EPUB_CHAPTER_REGEX_SOURCE)) {
      setPresetKey("custom");
      setCustomPattern(headingRegexForTemplate(numberingTemplate));
    }
    toast({ title: `Đã đánh số ${result.count} chương` });
  };

  const undoNumbering = () => {
    if (!textBeforeNumbering) return;
    setText(textBeforeNumbering.text);
    setPresetKey(textBeforeNumbering.presetKey);
    setCustomPattern(textBeforeNumbering.customPattern);
    setTextBeforeNumbering(null);
  };

  const pasteParsed = useMemo(() => {
    if (!text.trim()) return [];
    if (presetKey === "blankTitle") return splitByBlankLineTitles(text);
    if (!pattern) return [];
    const result = splitByHeadingRegex(text, pattern);
    return result || [];
  }, [text, pattern, presetKey]);

  const autoParsed = mode === "file" ? fileParsed : pasteParsed;

  // No auto-split pattern gets every raw crawl 100% right — some site
  // scripts an in-story chat/system panel or a stray line slips through
  // and gets over-split into its own bogus "chapter". Rather than needing
  // a code fix for every new site's quirk, the preview below lets the user
  // fold a spurious row into the chapter above it themselves. Any manual
  // fix-up is dropped the moment the underlying auto-parse would change
  // (new text/pattern/file), since it wouldn't line up anymore.
  const [manualEdits, setManualEdits] = useState(null);
  useEffect(() => setManualEdits(null), [autoParsed]);
  const parsed = manualEdits ?? autoParsed;

  const mergeIntoPrevious = (index) => {
    if (index <= 0) return;
    const next = parsed
      .map((chapter, i) => (i === index - 1
        ? { title: chapter.title, content: [chapter.content, parsed[index].content].filter(Boolean).join("\n\n") }
        : chapter))
      .filter((_, i) => i !== index);
    setManualEdits(next);
  };

  const handleClose = (v) => {
    if (!v) {
      setMode("paste");
      setText("");
      setPresetKey("vi");
      setCustomPattern("");
      setTargetColumn("raw_original");
      setImportAction("create");
      setFileParsed([]);
      setFileName("");
      setTxtFileName("");
      setManualEdits(null);
      setNumberingOpen(false);
      setNumberingMarker("");
      setNumberingStart(1);
      setTextBeforeNumbering(null);
    }
    onOpenChange(v);
  };

  // Handles .txt/.docx/.pdf/.epub uniformly: whatever comes out is either
  // dropped straight into the same textarea+regex auto-split flow used for
  // pasted text (txt/docx/pdf — none of these have machine-readable chapter
  // structure, so a heading pattern is still needed), or for .epub — which
  // DOES have a real author-defined chapter list — reconstructed as marked
  // text with the split pattern auto-selected, so the same preview/import
  // pipeline still applies without a second, parallel code path.
  const handleBookFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    setExtracting(true);
    // Reset back to the default split pattern first — otherwise a leftover
    // EPUB marker pattern from a previous upload in this same dialog
    // session would silently mis-split a plain .txt/.docx/.pdf loaded next.
    setPresetKey("vi");
    setCustomPattern("");
    setTextBeforeNumbering(null);
    try {
      if (ext === "txt") {
        const raw = await file.text();
        setText(raw);
        setPresetKey(detectHeadingPreset(raw));
      } else if (ext === "docx") {
        const raw = await extractTextFromDocx(file);
        setText(raw);
        setPresetKey(detectHeadingPreset(raw));
      } else if (ext === "pdf") {
        const raw = await extractTextFromPdf(file);
        setText(raw);
        setPresetKey(detectHeadingPreset(raw));
      } else if (ext === "epub") {
        const epubChapters = await extractChaptersFromEpub(file);
        if (epubChapters.length === 0) {
          toast({
            title: "Không tách được chương nào từ EPUB",
            description: "File có thể dùng cấu trúc khác thường — thử xuất sang .txt rồi tải lên.",
            variant: "destructive",
          });
          return;
        }
        setText(epubChaptersToMarkedText(epubChapters));
        setPresetKey("custom");
        setCustomPattern(EPUB_CHAPTER_REGEX_SOURCE);
      } else {
        toast({
          title: "Định dạng chưa hỗ trợ",
          description: "Chỉ hỗ trợ .txt, .docx, .pdf, .epub",
          variant: "destructive",
        });
        return;
      }
      setTxtFileName(file.name);
    } catch (err) {
      toast({ title: "Lỗi đọc file", description: err.message, variant: "destructive" });
    }
    setExtracting(false);
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
      const succeeded = await onImport(parsed, targetColumn, importAction);
      if (succeeded !== false) handleClose(false);
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
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={txtFileInputRef}
                  type="file"
                  accept=".txt,.docx,.pdf,.epub"
                  onChange={handleBookFileChange}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => txtFileInputRef.current?.click()}
                  disabled={extracting}
                  className="border-violet-200 text-violet-600 rounded-xl"
                >
                  {extracting ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 mr-1" />
                  )}
                  {extracting ? "Đang đọc file..." : "Tải file lên (.txt/.docx/.pdf/.epub)"}
                </Button>
                {txtFileName && !extracting && (
                  <span className="text-xs text-slate-400">Đã tải: {txtFileName}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNumberingOpen((v) => !v)}
                  disabled={!text.trim()}
                  className={`ml-auto rounded-xl ${numberingOpen ? "border-violet-400 bg-violet-50 text-violet-700" : "border-violet-200 text-violet-600"}`}
                >
                  <ListOrdered className="w-3.5 h-3.5 mr-1" /> Đánh số chương
                </Button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Dán toàn bộ văn bản gồm nhiều chương vào đây, hoặc tải file lên ở trên..."
                rows={8}
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 resize-none font-mono"
              />
              {numberingOpen && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
                  <p className="text-[11px] text-slate-500">
                    Dùng khi mọi chương mở đầu bằng cùng một dòng (VD: tên truyện lặp lại ở đầu
                    mỗi chương). Mỗi lần dòng đó xuất hiện sẽ được đổi thành tên chương có số.
                  </p>
                  {repeatedLines.length === 0 ? (
                    <p className="text-xs text-red-600">
                      Không thấy dòng ngắn nào lặp lại từ 3 lần trở lên.
                    </p>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">
                          Dòng đánh dấu đầu chương
                        </label>
                        <select
                          value={numberingMarker}
                          onChange={(e) => setNumberingMarker(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                        >
                          {repeatedLines.map((r) => (
                            <option key={r.line} value={r.line}>
                              {r.line} — lặp {r.count} lần
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-[1fr_90px] gap-2">
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">
                            Mẫu tên chương
                          </label>
                          <input
                            value={numberingTemplate}
                            onChange={(e) => setNumberingTemplate(e.target.value)}
                            list="chapter-numbering-templates"
                            className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400 font-mono"
                          />
                          <datalist id="chapter-numbering-templates">
                            {NUMBERING_TEMPLATES.map((t) => <option key={t} value={t} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 mb-1 block">
                            Bắt đầu từ
                          </label>
                          <input
                            type="number"
                            value={numberingStart}
                            onChange={(e) => setNumberingStart(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        <code>{"{n}"}</code> số chương, <code>{"{nn}"}</code>/<code>{"{nnn}"}</code> số
                        có 2/3 chữ số (01, 001), <code>{"{dong}"}</code> dòng chữ ngay sau dòng đánh dấu.
                      </p>
                    </>
                  )}
                  <div className="flex gap-2 justify-end">
                    {textBeforeNumbering && (
                      <Button size="sm" variant="ghost" onClick={undoNumbering} className="rounded-xl text-slate-500">
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Hoàn tác
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={applyNumbering}
                      disabled={!numberingMarker || !numberingTemplate.trim()}
                      className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
                    >
                      Áp dụng
                    </Button>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Kiểu tiêu đề chương
                </label>
                <select
                  value={presetKey}
                  onChange={(e) => setPresetKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
                >
                  {Object.entries(CHAPTER_HEADING_PRESETS).map(([k, p]) => (
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
                File sách thuần (.txt/.docx/.pdf/.epub, chưa tách cột) → dùng tab "Dán &amp; tự
                tách" và bấm nút tải file ở đó.
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
              Cách nhập
            </label>
            <select
              value={importAction}
              onChange={(e) => setImportAction(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white/70 focus:outline-none focus:border-violet-400"
            >
              <option value="create">Tạo chương mới</option>
              <option value="update" disabled={existingChapterCount === 0}>
                Điền vào chương hiện có — ghép theo thứ tự ({existingChapterCount} chương)
              </option>
            </select>
            {importAction === "update" && (
              <p className={`mt-1.5 text-xs ${parsed.length === existingChapterCount ? "text-emerald-700" : "text-red-600"}`}>
                {parsed.length === existingChapterCount
                  ? `Khớp ${existingChapterCount} chương. Chỉ điền ô đang trống, không ghi đè dữ liệu cũ.`
                  : `Không thể ghép: file có ${parsed.length} chương nhưng dự án có ${existingChapterCount} chương.`}
              </p>
            )}
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

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 max-h-64 overflow-y-auto cute-scrollbar">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-violet-700">
                {parsed.length > 0
                  ? `Xem trước: phát hiện ${parsed.length} chương`
                  : "Chưa có gì để xem trước"}
              </p>
              {manualEdits && (
                <button
                  onClick={() => setManualEdits(null)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-600"
                >
                  <RotateCcw className="w-3 h-3" /> Đặt lại tự động
                </button>
              )}
            </div>
            {parsed.length > 1 && (
              <p className="text-[11px] text-slate-400 mb-2">
                Nếu app tách lố (VD: 1 chương thật bị chẻ làm nhiều mục), bấm ↑ ở mục thừa để gộp
                nó vào chương ngay phía trên.
              </p>
            )}
            {parsed.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 py-1 border-b border-violet-100 last:border-0">
                {i > 0 && (
                  <button
                    onClick={() => mergeIntoPrevious(i)}
                    title="Gộp mục này vào chương phía trên"
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-violet-100 hover:text-violet-600"
                  >
                    <ArrowUpToLine className="w-3 h-3" />
                  </button>
                )}
                <span className={i === 0 ? "ml-[22px]" : ""}>
                  <span className="font-semibold">{c.title}</span>{" "}
                  <span className="text-slate-400">({(c.content || "").length.toLocaleString("vi")} ký tự)</span>
                </span>
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
            disabled={parsed.length === 0 || importing || (importAction === "update" && parsed.length !== existingChapterCount)}
            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
          >
            {importing ? "Đang nhập..." : importAction === "update" ? `Điền vào ${parsed.length} chương` : `Nhập ${parsed.length} chương`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
