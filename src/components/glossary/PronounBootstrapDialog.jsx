import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Compass, AlertTriangle, BookOpenText } from "lucide-react";

const FIELDS = ["speaker", "listener", "self_word", "target_word"];

// A rule the discovery scan is confident about — safe to pre-check without
// the user needing to inspect every row before applying.
const looksSolid = (rule) =>
  rule.selfConfidence >= 0.6 && rule.targetConfidence >= 0.6 && rule.sampleCount >= 4;

export default function PronounBootstrapDialog({ open, onOpenChange, report, running, onScan, onApply }) {
  const [chapterCount, setChapterCount] = useState("all");
  const [selected, setSelected] = useState({});
  const [edited, setEdited] = useState({});
  const [deep, setDeep] = useState(false);
  const [selectedNarrative, setSelectedNarrative] = useState({});
  const [editedNarrative, setEditedNarrative] = useState({});

  useEffect(() => {
    if (report) {
      const sel = {};
      (report.rules || []).forEach((rule, i) => { sel[i] = looksSolid(rule); });
      setSelected(sel);
      setEdited({});
      const narrativeSelection = {};
      (report.narrativeRules || []).forEach((rule, i) => { narrativeSelection[i] = rule.confidence >= 0.7 && rule.sampleCount >= 3; });
      setSelectedNarrative(narrativeSelection);
      setEditedNarrative({});
    }
  }, [report]);

  const toggle = (i) => setSelected((prev) => ({ ...prev, [i]: !prev[i] }));
  const updateField = (i, field, value) =>
    setEdited((prev) => ({ ...prev, [i]: { ...prev[i], [field]: value } }));
  const fieldValue = (rule, i, field) => edited[i]?.[field] !== undefined ? edited[i][field] : rule[field];

  const handleApply = () => {
    const rows = (report?.rules || [])
      .map((rule, i) => ({
        speaker: fieldValue(rule, i, "speaker").trim(),
        listener: fieldValue(rule, i, "listener").trim(),
        self_word: fieldValue(rule, i, "self_word").trim(),
        target_word: fieldValue(rule, i, "target_word").trim(),
        note: "",
      }))
      .filter((_, i) => selected[i])
      .filter((rule) => rule.speaker && rule.listener && rule.self_word && rule.target_word);
    const narrativeRows = (report?.narrativeRules || []).map((rule, i) => ({
      character: rule.character.trim(),
      pronoun: String(editedNarrative[i] ?? rule.pronoun ?? '').trim(),
      note: 'Học từ Bản Edit', source: 'machine', confidence: rule.confidence,
    })).filter((_, i) => selectedNarrative[i]).filter((rule) => rule.character && rule.pronoun);
    onApply(rows, narrativeRows);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const selectedNarrativeCount = Object.values(selectedNarrative).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto cute-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <Compass className="h-5 w-5" /> Học xưng hô từ Bản Edit
          </DialogTitle>
          <DialogDescription>
            Quét các chương đã có Bản Edit để đề xuất cách xưng hô giữa các cặp nhân vật — quét bằng luật,
            không dùng AI. Máy dùng tên trong Glossary và theo dõi lượt hội thoại. Đây chỉ là đề xuất: Ma Trận không đổi cho tới khi bạn duyệt và bấm
            "Thêm vào Ma Trận".
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-violet-700 shrink-0">Phạm vi quét</label>
          <select
            value={chapterCount}
            onChange={(e) => setChapterCount(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="min-w-40 px-2 py-1.5 text-sm rounded-lg border border-violet-100 bg-white focus:outline-none focus:border-violet-300"
          >
            <option value="all">Toàn bộ chương đã Edit</option>
            <option value="10">10 chương đầu</option>
            <option value="25">25 chương đầu</option>
            <option value="50">50 chương đầu</option>
          </select>
          <button
            type="button"
            onClick={() => onScan(chapterCount, { deep })}
            disabled={running}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
            {running ? "Đang quét…" : report ? "Quét lại" : "Quét"}
          </button>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          <input type="checkbox" checked={deep} onChange={(event) => setDeep(event.target.checked)} className="mt-0.5 accent-amber-600" />
          <span><b>Quét sâu phần chưa đủ dữ liệu</b><br />Hiện cả cặp/ngôi chỉ có một bằng chứng. Các mục này không được chọn sẵn và bắt buộc xem lại.</span>
        </label>

        {report && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[report.chapterCount, "Chương đã quét"], [report.quoteCount, "Câu thoại"], [report.rules.length, "Cặp đối thoại"], [(report.narrativeRules || []).length, "Ngôi lời dẫn"]].map(
              ([value, label]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
                  <b className="block text-lg text-slate-800">{value}</b>
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
              )
            )}
          </div>
        )}

        {report && !report.rules.length && (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            Chưa đủ dữ liệu để đề xuất — thử tăng số chương quét, hoặc truyện chưa đủ hội
            thoại rõ người nói/người nghe trong khoảng này.
          </div>
        )}

        {report && !!report.rules.length && (
          <div className="space-y-2">
            {report.rules.map((rule, i) => {
              const solid = looksSolid(rule);
              return (
                <div
                  key={`${rule.speaker}:${rule.listener}`}
                  className={`rounded-xl border p-3 transition-colors ${
                    selected[i] ? "border-violet-300 bg-violet-50/50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected[i]}
                      onChange={() => toggle(i)}
                      className="mt-2 accent-violet-600 shrink-0"
                    />
                    <div className="min-w-0 flex-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FIELDS.map((field) => (
                        <div key={field}>
                          <label className="text-[10px] text-slate-400">
                            {field === "speaker" && "Người nói"}
                            {field === "listener" && "Người nghe"}
                            {field === "self_word" && "Xưng là"}
                            {field === "target_word" && "Gọi đối phương"}
                          </label>
                          <input
                            value={fieldValue(rule, i, field)}
                            onChange={(e) => updateField(i, field, e.target.value)}
                            className="mt-0.5 w-full px-2 py-1 text-sm rounded-lg border border-violet-100 focus:outline-none focus:border-violet-400"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 ml-6 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      {rule.sampleCount} lượt mẫu
                    </span>
                    {rule.self_word ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        Xưng: {Math.round(rule.selfConfidence * 100)}% nhất quán
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">
                        Xưng: chưa có dữ liệu
                      </span>
                    )}
                    {rule.target_word ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        Gọi: {Math.round(rule.targetConfidence * 100)}% nhất quán
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-400">
                        Gọi: chưa có dữ liệu
                      </span>
                    )}
                    {!solid && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Mẫu ít/chưa chắc — xem lại trước khi thêm
                      </span>
                    )}
                  </div>
                  {!!rule.occurrences?.length && (
                    <details className="mt-2 ml-6">
                      <summary className="cursor-pointer text-xs font-medium text-slate-600">
                        Xem vị trí xuất hiện
                      </summary>
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                        {rule.occurrences.map((item, idx) => (
                          <div key={`${item.chapterId}:${item.start}:${idx}`} className="rounded-lg bg-slate-50 p-2 text-xs">
                            <b>{item.chapterTitle}</b> · dòng {item.line} · {item.role === "self" ? "tự xưng" : "gọi đối phương"}
                            <span className="block truncate text-slate-500">…{item.context}…</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {report && !!report.narrativeRules?.length && (
          <section className="space-y-2 border-t border-slate-100 pt-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-800"><BookOpenText className="h-4 w-4" />Ngôi lời dẫn đề xuất</h3>
            <p className="text-xs text-slate-500">Máy chỉ học từ câu kể ngoài ngoặc thoại có đúng một nhân vật rõ ràng.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.narrativeRules.map((rule, i) => (
                <label key={rule.character} className={`flex items-start gap-2 rounded-xl border p-3 ${selectedNarrative[i] ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                  <input type="checkbox" checked={!!selectedNarrative[i]} onChange={() => setSelectedNarrative((current) => ({ ...current, [i]: !current[i] }))} className="mt-2 accent-indigo-600" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-slate-800">{rule.character}</b>
                    <input value={editedNarrative[i] ?? rule.pronoun} onChange={(event) => setEditedNarrative((current) => ({ ...current, [i]: event.target.value }))} className="mt-1 w-full rounded-lg border border-indigo-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
                    <span className="mt-1 block text-[11px] text-slate-500">{rule.sampleCount} mẫu · {Math.round(rule.confidence * 100)}% nhất quán</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            onClick={handleApply}
            disabled={running || !report || (selectedCount === 0 && selectedNarrativeCount === 0)}
            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
          >
            Thêm {selectedCount + selectedNarrativeCount} quy tắc đã chọn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
