import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Languages, Loader2, LocateFixed, RotateCcw, SearchCheck, Sparkles, UserRoundCheck, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QUALITY_LABELS } from "@/lib/qualityCheck";

const TYPE_META = {
  glossary: { icon: SearchCheck, tone: "text-blue-700 bg-blue-50 border-blue-100" },
  cjk: { icon: Languages, tone: "text-red-600 bg-red-50 border-red-100" },
  english: { icon: Languages, tone: "text-amber-700 bg-amber-50 border-amber-100" },
  name: { icon: UserRoundCheck, tone: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100" },
  pronoun: { icon: UserRoundCheck, tone: "text-violet-700 bg-violet-50 border-violet-100" }
};

const isSafeIssue = (issue) =>
  issue.severity !== "review" &&
  !issue.contextual &&
  String(issue.replacement || "").trim() &&
  issue.replacement !== issue.value;

export default function QualityCheckDialog({ open, onOpenChange, issues, onApply, onLocate, onTranslate, onUndo, canUndo, onApplyAllSafe }) {
  const [filter, setFilter] = useState("all");
  const [replacements, setReplacements] = useState({});
  const [ignored, setIgnored] = useState(new Set());
  const [translating, setTranslating] = useState(null);
  const [selections, setSelections] = useState({});
  const [batchTranslating, setBatchTranslating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilter("all");
    setIgnored(new Set());
    setReplacements(Object.fromEntries((issues || []).map((issue) => [issue.id, issue.replacement || ""])));
    setSelections({});
  }, [open]);

  useEffect(() => {
    setReplacements((current) => {
      const next = { ...current };
      (issues || []).forEach((issue) => { if (!(issue.id in next)) next[issue.id] = issue.replacement || ""; });
      return next;
    });
  }, [issues]);

  const groups = useMemo(() => {
    const grouped = new Map();
    (issues || []).forEach((issue) => {
      const key = issue.contextual || issue.type === "pronoun" ? issue.id : JSON.stringify([issue.type, issue.value, issue.replacement]);
      if (!grouped.has(key)) grouped.set(key, { key, issues: [], ...issue });
      grouped.get(key).issues.push(issue);
    });
    return [...grouped.values()];
  }, [issues]);
  const visible = useMemo(() => groups.filter((group) => !ignored.has(group.key) && (filter === "all" || group.type === filter)), [groups, ignored, filter]);
  const counts = useMemo(() => (issues || []).reduce((acc, issue) => ({ ...acc, [issue.type]: (acc[issue.type] || 0) + 1 }), {}), [issues]);
  const safeCount = useMemo(() => (issues || []).filter(isSafeIssue).length, [issues]);

  const ignore = (key) => setIgnored((current) => new Set([...current, key]));

  const selectedRange = (group) => selections[group.key] || {
    start: group.contextTargetStart,
    end: group.contextTargetEnd,
    text: group.value,
    active: false,
  };

  const translate = async (group) => {
    setTranslating(group.key);
    try {
      const selection = selectedRange(group);
      const translated = await onTranslate(group, selection);
      if (translated) setReplacements((current) => ({ ...current, [group.key]: translated }));
      setSelections((current) => ({ ...current, [group.key]: { ...selection, active: true } }));
    } finally {
      setTranslating(null);
    }
  };

  const applyGroup = (group) => {
    const selection = selectedRange(group);
    if (selection.active) {
      const issue = group.issues[0];
      onApply([{
        ...issue,
        start: issue.contextStart + selection.start,
        end: issue.contextStart + selection.end,
        value: selection.text,
      }], replacements[group.key] ?? group.replacement);
      return;
    }
    onApply(group.issues, replacements[group.key] ?? group.replacement);
  };

  const applyOne = (issue) => {
    onApply([issue], replacements[issue.id] ?? issue.replacement);
  };

  const untranslatedCjkEnglish = groups.filter(
    (group) => (group.type === "cjk" || group.type === "english") && !ignored.has(group.key) && !selections[group.key]?.active
  );

  const batchTranslateAll = async () => {
    if (batchTranslating || !untranslatedCjkEnglish.length) return;
    setBatchTranslating(true);
    try {
      for (let i = 0; i < untranslatedCjkEnglish.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await translate(untranslatedCjkEnglish[i]);
        if (i < untranslatedCjkEnglish.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } finally {
      setBatchTranslating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[86vh] overflow-hidden flex flex-col rounded-2xl border-violet-100 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4 pr-7">
            <div>
              <DialogTitle className="flex items-center gap-2 text-slate-800"><SearchCheck className="h-5 w-5 text-violet-600" /> QA bản Edit</DialogTitle>
              <DialogDescription className="mt-1">Chỉ đưa ra đề xuất. Văn bản không thay đổi cho đến khi bạn bấm Áp dụng.</DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {untranslatedCjkEnglish.length > 0 && (
                <button disabled={batchTranslating} onClick={batchTranslateAll} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                  {batchTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Dịch AI hàng loạt ({untranslatedCjkEnglish.length})
                </button>
              )}
              {safeCount > 0 && <button onClick={onApplyAllSafe} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"><Zap className="h-3.5 w-3.5" /> Sửa {safeCount} lỗi an toàn</button>}
              {canUndo && <button onClick={onUndo} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Hoàn tác QA</button>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-3">
            {["all", "glossary", "cjk", "english", "name", "pronoun", "style"].map((type) => {
              const count = type === "all" ? (issues || []).length : counts[type] || 0;
              return <button key={type} onClick={() => setFilter(type)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${filter === type ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{type === "all" ? "Tất cả" : QUALITY_LABELS[type]} · {count}</button>;
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto cute-scrollbar p-4 space-y-3 bg-slate-50/60">
          {visible.length === 0 ? (
            <div className="h-full min-h-48 grid place-items-center text-center"><div><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm font-semibold text-slate-700">Không còn mục nào trong nhóm này</p><p className="mt-1 text-xs text-slate-400">QA chỉ cảnh báo theo quy tắc, không thể thay thế việc đọc duyệt cuối.</p></div></div>
          ) : visible.map((group) => {
            const meta = TYPE_META[group.type] || TYPE_META.english;
            const Icon = meta.icon;
            const selection = selectedRange(group);
            const aiSelectable = group.type === "cjk" || group.type === "english";
            const perOccurrence = group.issues.some((issue) => issue.contextual);
            const preview = selection.active && String(replacements[group.key] || "").trim()
              ? `${group.context.slice(0, selection.start)}${replacements[group.key]}${group.context.slice(selection.end)}`
              : "";
            return (
              <article key={group.key} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${meta.tone}`}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-800">{group.label}</strong><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{group.issues.length > 1 ? `${group.issues.length} lần` : `Dòng ${group.line}`}</span></div>
                    {!perOccurrence && <div className="mt-1.5 space-y-1.5">{group.issues.slice(0, 3).map((issue) => <p key={issue.id} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600"><span className="mr-1 text-[10px] text-slate-400">Dòng {issue.line}</span><mark className="rounded bg-amber-100 px-0.5 text-amber-900">{issue.value}</mark> · {issue.context}</p>)}{group.issues.length > 3 && <p className="px-1 text-[10px] text-slate-400">…và {group.issues.length - 3} vị trí khác</p>}</div>}
                    {!perOccurrence && group.detail && <p className="mt-1.5 flex gap-1 text-[11px] leading-relaxed text-slate-500"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />{group.detail}</p>}
                    {perOccurrence && (
                      <div className="mt-2.5 space-y-2 max-h-80 overflow-y-auto cute-scrollbar pr-1">
                        {group.issues.map((issue) => (
                          <div key={issue.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-2.5">
                            <p className="text-xs leading-relaxed text-slate-600"><span className="mr-1 text-[10px] text-slate-400">Dòng {issue.line}</span>{issue.context}</p>
                            <p className="mt-1 text-[10px] text-blue-700">{issue.detail}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {(issue.suggestions || []).map((suggestion) => (
                                <button key={suggestion} onClick={() => setReplacements((current) => ({ ...current, [issue.id]: suggestion }))} className={`rounded-lg border px-2 py-1 text-[11px] ${String(replacements[issue.id] ?? issue.replacement) === suggestion ? "border-blue-400 bg-blue-600 text-white" : "border-blue-100 bg-white text-blue-700 hover:bg-blue-50"}`}>{suggestion}</button>
                              ))}
                              <input value={replacements[issue.id] ?? issue.replacement ?? ""} onChange={(event) => setReplacements((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Cách thay…" className="min-w-28 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <button onClick={() => onLocate(issue)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500">Đi tới</button>
                              <button disabled={!String(replacements[issue.id] ?? issue.replacement ?? "").trim()} onClick={() => applyOne(issue)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">Áp dụng chỗ này</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiSelectable && (
                      <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
                        <p className="mb-1.5 text-[11px] font-medium text-violet-700">Bôi chọn cụm cần AI dịch lại trong câu dưới đây</p>
                        <textarea
                          readOnly
                          value={group.context}
                          onSelect={(event) => {
                            const start = event.currentTarget.selectionStart;
                            const end = event.currentTarget.selectionEnd;
                            if (end <= start) return;
                            setSelections((current) => ({
                              ...current,
                              [group.key]: {
                                start,
                                end,
                                text: group.context.slice(start, end),
                                active: true,
                              },
                            }));
                          }}
                          className="h-20 w-full resize-none rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-700 outline-none selection:bg-violet-200"
                        />
                        <p className="mt-1.5 text-[11px] text-slate-500">Đang chọn: <strong className="text-violet-700">{selection.text}</strong></p>
                        {preview && <p className="mt-1.5 rounded-lg bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-600"><span className="font-medium text-emerald-700">Xem trước:</span> {preview}</p>}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => onLocate(group.issues[0])} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><LocateFixed className="h-3.5 w-3.5" /> Đi tới</button>
                      {aiSelectable && <button disabled={translating === group.key} onClick={() => translate(group)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50">{translating === group.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gợi ý đoạn đã chọn</button>}
                      {!perOccurrence && <input value={replacements[group.key] ?? group.replacement ?? ""} onChange={(event) => setReplacements((current) => ({ ...current, [group.key]: event.target.value }))} placeholder="Nhập nội dung thay thế…" className="min-w-40 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-violet-400" />}
                      {!perOccurrence && <button disabled={!String(replacements[group.key] ?? group.replacement ?? "").trim()} onClick={() => applyGroup(group)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">{selection.active ? "Áp dụng đoạn này" : group.issues.length > 1 ? `Áp dụng cả ${group.issues.length}` : "Áp dụng"}</button>}
                      <button onClick={() => ignore(group.key)} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">Bỏ qua</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
