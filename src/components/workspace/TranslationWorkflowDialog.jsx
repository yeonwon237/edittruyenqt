import { useEffect, useMemo, useState } from "react";
import { Bot, BookOpenCheck, CheckCircle2, Loader2, OctagonX, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const confidenceLabel = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

export default function TranslationWorkflowDialog({
  open, onOpenChange, totalChapters, analysisRunning, analysisResult, onAnalyze,
  savingRules, onSaveRules, qtRunning, qtFinished, qtProgress, qtErrors,
  onStartQt, onStopQt, onOpenBatchEdit, onDiscoverGlossary,
}) {
  const [sampleSize, setSampleSize] = useState(5);
  const [analyzeMode, setAnalyzeMode] = useState("spread");
  const [analyzeFrom, setAnalyzeFrom] = useState(1);
  const [analyzeTo, setAnalyzeTo] = useState(Math.min(5, totalChapters || 1));
  const [draft, setDraft] = useState(null);
  const [selectedTerms, setSelectedTerms] = useState(new Set());
  const [selectedRules, setSelectedRules] = useState(new Set());
  const [selectedCharacters, setSelectedCharacters] = useState(new Set());
  const [overwriteQt, setOverwriteQt] = useState(false);
  const [fromChapter, setFromChapter] = useState(1);
  const [toChapter, setToChapter] = useState(totalChapters || 1);

  useEffect(() => {
    if (open) {
      setFromChapter(1);
      setToChapter(totalChapters || 1);
      setAnalyzeFrom(1);
      setAnalyzeTo(Math.min(5, totalChapters || 1));
    }
  }, [open, totalChapters]);

  useEffect(() => {
    if (!analysisResult) return;
    setDraft({
      glossaryTerms: analysisResult.glossaryTerms.map((item) => ({ ...item })),
      characters: analysisResult.characters.map((item) => ({ ...item })),
      pronounRules: analysisResult.pronounRules.map((item) => ({ ...item })),
    });
    setSelectedTerms(new Set(analysisResult.glossaryTerms.map((_, index) => index)));
    setSelectedRules(new Set(analysisResult.pronounRules.map((_, index) => index)));
    setSelectedCharacters(new Set(analysisResult.characters.map((_, index) => index)));
  }, [analysisResult]);

  const selectedCount = selectedTerms.size + selectedRules.size + selectedCharacters.size;
  const pct = qtProgress.total ? Math.round((qtProgress.done / qtProgress.total) * 100) : 0;
  const busy = analysisRunning || savingRules || qtRunning;
  const toggle = (setter, index) => setter((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const approved = useMemo(() => draft ? ({
    glossaryTerms: draft.glossaryTerms.filter((item, index) => selectedTerms.has(index) && item.source_term.trim() && item.translation.trim()),
    pronounRules: draft.pronounRules.filter((_, index) => selectedRules.has(index)),
    characters: draft.characters.filter((_, index) => selectedCharacters.has(index)),
  }) : null, [draft, selectedTerms, selectedRules, selectedCharacters]);
  const editTerm = (index, field, value) => setDraft((current) => ({
    ...current,
    glossaryTerms: current.glossaryTerms.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy || value) onOpenChange(value); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-700"><BookOpenCheck className="h-5 w-5" /> Chuẩn bị & dịch toàn truyện</DialogTitle>
          <DialogDescription>Duyệt glossary và quy ước → máy tạo QT → AI Edit. Phân tích mẫu giúp lập hồ sơ; quét kỹ từng chương giúp bổ sung thuật ngữ còn thiếu.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-sm font-bold text-white">1</span>
            <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-800">AI lập bộ quy ước</h3><p className="text-xs text-slate-500">{analyzeMode === "spread" ? "Lấy mẫu rải đều toàn truyện" : "Lấy mẫu trong khoảng chương đã chọn"}; AI chỉ đề xuất và chưa tự lưu.</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-cyan-200 bg-white p-0.5 text-xs">
              <button type="button" disabled={busy} onClick={() => setAnalyzeMode("spread")} className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${analyzeMode === "spread" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-cyan-50"}`}>Rải đều</button>
              <button type="button" disabled={busy} onClick={() => setAnalyzeMode("range")} className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${analyzeMode === "range" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-cyan-50"}`}>Khoảng chương</button>
            </div>
            {analyzeMode === "spread" ? (
              <select value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))} disabled={busy} className="rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-sm">
                {[5, 10, 20].filter((n) => n <= Math.max(5, totalChapters)).map((n) => <option key={n} value={n}>{n} chương mẫu</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>Từ chương</span>
                <input type="number" min={1} max={totalChapters || 1} value={analyzeFrom} onChange={(e) => setAnalyzeFrom(Math.max(1, Math.min(Number(e.target.value) || 1, totalChapters || 1)))} disabled={busy || !totalChapters} className="w-16 rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-center disabled:bg-slate-50" />
                <span>đến chương</span>
                <input type="number" min={1} max={totalChapters || 1} value={analyzeTo} onChange={(e) => setAnalyzeTo(Math.max(1, Math.min(Number(e.target.value) || 1, totalChapters || 1)))} disabled={busy || !totalChapters} className="w-16 rounded-lg border border-cyan-200 bg-white px-2 py-1.5 text-center disabled:bg-slate-50" />
              </div>
            )}
            <Button
              onClick={() => onAnalyze(analyzeMode === "range" ? { from: analyzeFrom, to: analyzeTo } : Math.min(sampleSize, totalChapters))}
              disabled={busy || !totalChapters || (analyzeMode === "range" && analyzeFrom > analyzeTo)}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {analysisRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Bot className="mr-1.5 h-4 w-4" />} Phân tích
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Button variant="outline" disabled={busy} onClick={onDiscoverGlossary}>Máy + AI quét kỹ chương đang chọn</Button>
            <span>Duyệt từ bổ sung trước khi tạo hoặc tạo lại QT. Khoảng 6.000 chữ gọi AI một lần.</span>
          </div>
          {draft && <div className="grid gap-3 lg:grid-cols-3">
            <SuggestionGroup title={`Bảng từ máy (${draft.glossaryTerms.length})`} items={draft.glossaryTerms} selected={selectedTerms} onToggle={(i) => toggle(setSelectedTerms, i)} render={(item, index) => <div className="space-y-1"><div className="flex items-center gap-1"><input value={item.source_term} onClick={(e) => e.stopPropagation()} onChange={(e) => editTerm(index, "source_term", e.target.value)} className="w-20 min-w-0 rounded border px-1.5 py-1 font-semibold" /><span>→</span><input value={item.translation} onClick={(e) => e.stopPropagation()} onChange={(e) => editTerm(index, "translation", e.target.value)} className="min-w-0 flex-1 rounded border border-cyan-300 px-1.5 py-1" /></div><small>{item.existing_id ? "Đã có · " : "AI mới · "}{item.category} · {confidenceLabel(item.confidence)}{item.evidence ? ` · ${item.evidence}` : ""}</small></div>} />
            <SuggestionGroup title={`Hồ sơ nhân vật (${draft.characters.length})`} items={draft.characters} selected={selectedCharacters} onToggle={(i) => toggle(setSelectedCharacters, i)} render={(item) => <><b>{item.name}</b> · {item.gender}<small>{item.identity || "Chưa rõ thân phận"} · lời kể: {item.narrative_pronoun} · {confidenceLabel(item.confidence)}</small></>} />
            <SuggestionGroup title={`Ma trận xưng hô (${draft.pronounRules.length})`} items={draft.pronounRules} selected={selectedRules} onToggle={(i) => toggle(setSelectedRules, i)} render={(item) => <><b>{item.speaker}</b> → {item.listener}<small>xưng “{item.self_word}” · gọi “{item.target_word}” · {confidenceLabel(item.confidence)}</small></>} />
          </div>}
          {draft && <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Sửa trực tiếp, ví dụ 我 → ta, 你 → ngươi, 他 → hắn, 她 → nàng. Bỏ chọn mục không muốn áp dụng.</p><Button variant="outline" disabled={busy || !selectedCount} onClick={() => onSaveRules(approved)}>{savingRules && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Lưu {selectedCount} mục đã duyệt</Button></div>}
        </section>

        <section className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">2</span><div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-800">Dịch QT hàng loạt bằng AI</h3><p className="text-xs text-slate-500">Dịch bằng model AI (khoá tên riêng theo Glossary đã lưu), lưu ngay từng chương.</p></div>
            {!qtRunning ? <Button onClick={() => onStartQt({ overwriteExisting: overwriteQt, from: fromChapter, to: toChapter })} disabled={busy || !totalChapters || fromChapter > toChapter} className="bg-amber-500 hover:bg-amber-600">Dịch AI cho {Math.max(0, Math.min(toChapter, totalChapters) - fromChapter + 1)} chương</Button> : <Button variant="outline" onClick={onStopQt} className="border-red-200 text-red-600"><OctagonX className="mr-1 h-4 w-4" />Dừng sau chương này</Button>}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Từ chương</span>
            <input
              type="number"
              min={1}
              max={totalChapters || 1}
              value={fromChapter}
              onChange={(e) => setFromChapter(Math.max(1, Math.min(Number(e.target.value) || 1, totalChapters || 1)))}
              disabled={busy || !totalChapters}
              className="w-16 rounded-lg border border-amber-200 bg-white px-2 py-1 text-center disabled:bg-slate-50"
            />
            <span>đến chương</span>
            <input
              type="number"
              min={1}
              max={totalChapters || 1}
              value={toChapter}
              onChange={(e) => setToChapter(Math.max(1, Math.min(Number(e.target.value) || 1, totalChapters || 1)))}
              disabled={busy || !totalChapters}
              className="w-16 rounded-lg border border-amber-200 bg-white px-2 py-1 text-center disabled:bg-slate-50"
            />
            <span className="text-slate-400">(tổng {totalChapters} chương)</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={overwriteQt} onChange={(e) => setOverwriteQt(e.target.checked)} disabled={busy} className="accent-amber-500" /> Ghi đè chương đã có QT. Mặc định tắt để bảo vệ dữ liệu hiện tại.</label>
          {(qtRunning || qtFinished) && <div className="space-y-1.5"><div className="h-2 overflow-hidden rounded-full bg-amber-100"><div className="h-full bg-amber-500" style={{ width: `${pct}%` }} /></div><p className="text-xs text-slate-500">{qtProgress.done}/{qtProgress.total} · đã dịch {qtProgress.translated} · bỏ qua {qtProgress.skipped} · lỗi {qtProgress.failed}{qtProgress.currentTitle ? ` · ${qtProgress.currentTitle}` : ""}</p></div>}
          {!!qtErrors.length && <div className="max-h-24 overflow-y-auto rounded-lg bg-red-50 p-2 text-xs text-red-600">{qtErrors.map((error, index) => <p key={`${error.id}-${index}`}>{error.title}: {error.message}</p>)}</div>}
        </section>

        <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">3</span><div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-800">AI Edit hàng loạt</h3><p className="text-xs text-slate-500">Mở xưởng hiện có; AI nhận QT, Glossary, hồ sơ nhân vật và Ma trận xưng hô.</p></div><Button onClick={onOpenBatchEdit} disabled={busy} className="bg-violet-600 hover:bg-violet-700"><Sparkles className="mr-1.5 h-4 w-4" />Mở Edit AI hàng loạt</Button></div>
        </section>

        <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{qtFinished && !qtErrors.length ? <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" /> : null}Đóng</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionGroup({ title, items, selected, onToggle, render }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white"><h4 className="border-b px-3 py-2 text-xs font-semibold text-slate-700">{title}</h4><div className="max-h-56 overflow-y-auto">{items.length ? items.map((item, index) => <div key={index} onClick={() => onToggle(index)} className="flex w-full cursor-pointer gap-2 border-b px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.has(index) ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300"}`}>{selected.has(index) && <CheckCircle2 className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1 text-slate-700">{render(item, index)}</span></div>) : <p className="p-4 text-center text-xs text-slate-400">Không có đề xuất mới.</p>}</div></div>;
}
