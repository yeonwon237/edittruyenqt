import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, Loader2, MessageCircle, Plus, SearchCheck, Sparkles, Trash2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";

const isSafeGroup = (group) =>
  group.severity !== "review" &&
  !group.contextual &&
  String(group.replacement || "").trim() &&
  group.replacement !== group.value;

// Pronoun groups are deliberately excluded from isSafeGroup (they're always
// severity "review"), but scanContextualAddress already resolved self/target
// role from sentence position before setting `replacement` — a pronoun group
// with a concrete replacement here has already passed that context check.
// Kept as its own predicate/button (not folded into "safe") since it rests
// on the Ma Trận being correct and deserves an explicit confirm step.
// Confidence "cao" only — "trung bình"/"thấp" groups come from session-based
// speaker inference (no explicit tag, or none at all) and must be checked
// one location at a time instead of trusted into a bulk apply.
const isPronounFixable = (group) =>
  group.type === "pronoun" &&
  group.confidence === "cao" &&
  String(group.replacement || "").trim() &&
  group.replacement !== group.value;

const CONTEXT_SUGGESTIONS = [
  { label:"Cổ đại Trung Hoa", era:"ancient" }, { label:"Cổ đại Việt Nam", era:"ancient" },
  { label:"Cổ trang giả tưởng", era:"ancient" }, { label:"Trung cổ phương Tây", era:"ancient" },
  { label:"Dân quốc", era:"neutral" }, { label:"Cận đại", era:"neutral" },
  { label:"Hiện đại", era:"modern" }, { label:"Đô thị hiện đại", era:"modern" },
  { label:"Tận thế", era:"neutral" }, { label:"Tương lai / khoa học viễn tưởng", era:"neutral" },
  { label:"Thế giới giả tưởng", era:"neutral" }, { label:"Không xác định", era:"neutral" },
];
const GENRE_SUGGESTIONS = [
  "Kiếm hiệp", "Võ hiệp", "Tiên hiệp", "Tu tiên", "Huyền huyễn", "Cung đấu",
  "Trạch đấu", "Quyền mưu", "Ngôn tình", "Bách hợp", "Đam mỹ", "Xuyên không",
  "Trọng sinh", "Hệ thống", "Điền văn", "Đô thị", "Linh dị", "Trinh thám",
  "Khoa huyễn", "Tận thế", "Dị giới", "Hài hước",
];
const emptySettings = { era:"neutral", context:"", genres:[], forbiddenWords:[], hidePronounNarrative:false };

export default function StoryQaDialog({ open, onOpenChange, settings, report, running, onSaveSettings, onScan, onBulkReplace, onIgnoreGroup, onUndoBulkReplace, canUndoBulkReplace, qaWorkflow, onOpenChapter, onApplyAllSafe, onApplyAllPronoun, onTranslate }) {
  const [form, setForm] = useState(emptySettings);
  const [genre, setGenre] = useState("");
  const [replacements, setReplacements] = useState({});
  const [selectedLocations, setSelectedLocations] = useState({});
  const [remember, setRemember] = useState({});
  const [resultView, setResultView] = useState("issues");
  const [translating, setTranslating] = useState(null);
  const [batchTranslating, setBatchTranslating] = useState(false);
  const [confirmApplyPronoun, setConfirmApplyPronoun] = useState(false);
  useEffect(() => { if (open) setForm({ ...emptySettings, ...settings }); }, [open, settings]);
  const addGenre = () => { const value=genre.trim(); if(value&&!form.genres.includes(value))setForm({...form,genres:[...form.genres,value]}); setGenre(""); };
  const addForbidden = () => setForm({...form,forbiddenWords:[...form.forbiddenWords,{find:"",replace:""}]});
  const updateForbidden = (index,field,value) => setForm({...form,forbiddenWords:form.forbiddenWords.map((item,i)=>i===index?{...(typeof item==="string"?{find:item}:item),[field]:value}:item)});
  const save = async () => onSaveSettings(form);
  useEffect(() => { if(report?.groups){setReplacements(Object.fromEntries(report.groups.map(group=>[group.key,group.replacement||""])));setSelectedLocations(Object.fromEntries(report.groups.map(group=>[group.key,new Set((group.locations||[]).map(item=>item.id))])));} }, [report]);
  const toggleLocation=(groupKey,id)=>setSelectedLocations(current=>{const next=new Set(current[groupKey]||[]);if(next.has(id))next.delete(id);else next.add(id);return{...current,[groupKey]:next};});
  const translateGroup = async (group) => {
    setTranslating(group.key);
    try {
      const translated = await onTranslate(group);
      if (translated) setReplacements((current) => ({ ...current, [group.key]: translated }));
    } finally {
      setTranslating(null);
    }
  };
  const untranslatedCjkEnglish = (report?.groups || []).filter(
    (group) => (group.type === "cjk" || group.type === "english") && !String(replacements[group.key] || "").trim()
  );
  const translateAll = async () => {
    if (batchTranslating || !untranslatedCjkEnglish.length) return;
    setBatchTranslating(true);
    try {
      for (let i = 0; i < untranslatedCjkEnglish.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await translateGroup(untranslatedCjkEnglish[i]);
        if (i < untranslatedCjkEnglish.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } finally {
      setBatchTranslating(false);
    }
  };
  const safeOccurrences = (report?.groups || []).filter(isSafeGroup).reduce((sum, group) => sum + (group.locations?.length || 0), 0);
  const pronounGroups = (report?.groups || []).filter(isPronounFixable);
  const pronounOccurrences = pronounGroups.reduce((sum, group) => sum + (group.locations?.length || 0), 0);
  const pronounChapterCount = new Set(pronounGroups.flatMap((group) => (group.locations || []).map((item) => item.chapterId))).size;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle className="flex items-center gap-2 text-violet-700"><SearchCheck className="h-5 w-5"/> Trung tâm QA toàn truyện</DialogTitle></DialogHeader>
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3">
        <div><label className="text-xs font-semibold text-slate-600">Nguyên tắc thời đại</label><select value={form.era} onChange={e=>setForm({...form,era:e.target.value})} className="mt-1 w-full rounded-lg border border-violet-100 bg-white px-3 py-2"><option value="ancient">Cổ đại / cổ trang — cảnh báo từ hiện đại</option><option value="modern">Hiện đại</option><option value="neutral">Trung tính — không áp luật thời đại</option></select></div>
        <div><label className="text-xs font-semibold text-slate-600">Bối cảnh chi tiết</label><input value={form.context||""} onChange={e=>setForm({...form,context:e.target.value})} placeholder="Có thể chọn gợi ý hoặc tự nhập/sửa" className="mt-1 w-full rounded-lg border border-violet-100 bg-white px-3 py-2"/><div className="mt-2 flex flex-wrap gap-1.5">{CONTEXT_SUGGESTIONS.map(item=><button key={item.label} onClick={()=>setForm({...form,context:item.label,era:item.era})} className={`rounded-full border px-2.5 py-1 text-[11px] ${form.context===item.label?"border-violet-500 bg-violet-100 text-violet-700":"border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>{item.label}</button>)}</div><p className="mt-1.5 text-[10px] text-slate-400">Chọn gợi ý sẽ đặt nguyên tắc thời đại phù hợp; bạn vẫn có thể sửa lại.</p></div>
        <div><label className="text-xs font-semibold text-slate-600">Thể loại</label><div className="mt-1 flex gap-2"><input value={genre} onChange={e=>setGenre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addGenre())} placeholder="Nhập thể loại còn thiếu..." className="flex-1 rounded-lg border border-violet-100 px-3 py-2"/><Button variant="outline" onClick={addGenre}><Plus className="h-4 w-4"/></Button></div><div className="mt-2 flex flex-wrap gap-1.5">{GENRE_SUGGESTIONS.map(item=><button key={item} onClick={()=>setForm({...form,genres:form.genres.includes(item)?form.genres.filter(x=>x!==item):[...form.genres,item]})} className={`rounded-full border px-2.5 py-1 text-[11px] ${form.genres.includes(item)?"border-violet-500 bg-violet-100 text-violet-700":"border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>{form.genres.includes(item)?"✓ ":""}{item}</button>)}</div>{form.genres.some(item=>!GENRE_SUGGESTIONS.includes(item))&&<div className="mt-2 flex flex-wrap gap-1.5">{form.genres.filter(item=>!GENRE_SUGGESTIONS.includes(item)).map(item=><button key={item} onClick={()=>setForm({...form,genres:form.genres.filter(x=>x!==item)})} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{item} ×</button>)}</div>}<p className="mt-1.5 text-[10px] text-slate-400">Bấm để chọn/bỏ chọn. Thể loại tự nhập có thể xóa bằng dấu ×.</p></div>
        <label className="flex items-start gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs text-slate-600"><input type="checkbox" checked={Boolean(form.hidePronounNarrative)} onChange={e=>setForm({...form,hidePronounNarrative:e.target.checked})} className="mt-0.5 accent-violet-600"/><span><b className="text-slate-700">Bỏ qua Xưng hô &amp; Ngôi lời dẫn khi quét</b><br/>Ẩn tạm 2 loại lỗi ngữ cảnh (xưng hô hội thoại, ngôi lời dẫn) để tập trung sửa nhanh các lỗi khác trước, đỡ lẫn vào nhau.</span></label>
        <div><div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-600">Từ/cụm từ cấm cần quét</label><button onClick={addForbidden} className="text-xs text-violet-600">+ Thêm từ cấm</button></div><div className="mt-2 space-y-2">{form.forbiddenWords.map((item,index)=>{const rule=typeof item==="string"?{find:item,replace:""}:item;return <div key={index} className="flex gap-2"><input value={rule.find||""} onChange={e=>updateForbidden(index,"find",e.target.value)} placeholder="Từ cần cảnh báo" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5"/><input value={rule.replace||""} onChange={e=>updateForbidden(index,"replace",e.target.value)} placeholder="Gợi ý thay (không bắt buộc)" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5"/><button onClick={()=>setForm({...form,forbiddenWords:form.forbiddenWords.filter((_,i)=>i!==index)})}><Trash2 className="h-4 w-4 text-red-400"/></button></div>})}</div></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={save}>Lưu cấu hình</Button><Button disabled={running} onClick={async()=>{await save();await onScan(form);}} className="bg-violet-600 hover:bg-violet-700">{running?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<SearchCheck className="mr-2 h-4 w-4"/>}Quét QA toàn truyện</Button></div>
      </div>
      {report&&<div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><b>Kết quả: {report.issueCount} lỗi/nghi vấn · {report.chapters.length} chương</b><div className="flex flex-wrap items-center gap-2">{untranslatedCjkEnglish.length>0&&<Button size="sm" variant="outline" disabled={batchTranslating} onClick={translateAll} className="border-violet-200 text-violet-700 hover:bg-violet-50">{batchTranslating?<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Sparkles className="mr-1.5 h-3.5 w-3.5"/>}Dịch AI hàng loạt ({untranslatedCjkEnglish.length})</Button>}{safeOccurrences>0&&<Button size="sm" disabled={running} onClick={()=>onApplyAllSafe(form)} className="bg-emerald-600 hover:bg-emerald-700"><Zap className="mr-1.5 h-3.5 w-3.5"/>Sửa {safeOccurrences} vị trí an toàn</Button>}{pronounOccurrences>0&&onApplyAllPronoun&&<Button size="sm" disabled={running} onClick={()=>setConfirmApplyPronoun(true)} className="bg-violet-600 hover:bg-violet-700"><MessageCircle className="mr-1.5 h-3.5 w-3.5"/>Sửa {pronounOccurrences} vị trí xưng hô có gợi ý</Button>}{canUndoBulkReplace&&<Button size="sm" variant="outline" disabled={running} onClick={async()=>{await onUndoBulkReplace();await onScan(form);}}>Hoàn tác thay hàng loạt</Button>}</div></div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1"><button onClick={()=>setResultView("issues")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${resultView==="issues"?"bg-white text-violet-700 shadow-sm":"text-slate-500"}`}>Lỗi toàn truyện</button><button onClick={()=>setResultView("next")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${resultView==="next"?"bg-white text-violet-700 shadow-sm":"text-slate-500"}`}>Chương cần xử lý tiếp · {qaWorkflow?.pending?.length||0}</button></div>
        {report.groupsStale&&<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Bạn vừa sửa nội dung một chương. Số lỗi của chương đã cập nhật, nhưng các nhóm tổng hợp cần bấm <b>Quét QA toàn truyện</b> để làm mới hoàn toàn.</div>}
        {resultView==="issues"?<div className="space-y-3">{(report.groups||[]).map(group=>{const selected=selectedLocations[group.key]||new Set();return <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${group.replacement&&!group.contextual?"text-emerald-500":"text-amber-500"}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="min-w-0">{group.label}</b><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{group.count} lần · {group.chapterCount} chương</span>{group.confidence&&<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${group.confidence==="cao"?"bg-emerald-100 text-emerald-700":group.confidence==="trung bình"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700"}`}>Độ tin cậy: {group.confidence}</span>}{isSafeGroup(group)||isPronounFixable(group)?<span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">Có thể sửa hàng loạt</span>:<span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">Cần xem ngữ cảnh</span>}<Button size="sm" disabled={running||!selected.size||!String(replacements[group.key]||"").trim()} onClick={()=>onBulkReplace(group,replacements[group.key],form,[...selected],Boolean(remember[group.key]))} className="ml-auto shrink-0 bg-emerald-600 hover:bg-emerald-700">Thay {selected.size}/{group.count} vị trí</Button></div><div className="mt-1 flex min-w-0 items-center gap-2 text-sm"><code className="max-w-[35%] truncate rounded bg-red-50 px-2 py-1 text-red-700">{group.value}</code><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300"/><input value={replacements[group.key]??""} onChange={e=>setReplacements({...replacements,[group.key]:e.target.value})} placeholder="Nhập cách thay nếu muốn sửa hàng loạt" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5"/>{(group.type==="cjk"||group.type==="english")&&<button disabled={translating===group.key} onClick={()=>translateGroup(group)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50">{translating===group.key?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Sparkles className="h-3.5 w-3.5"/>}Dịch AI</button>}</div></div></div>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-x-hidden overflow-y-auto">{(group.locations||[]).map(location=><div key={location.id} className={`flex min-w-0 gap-2 rounded-lg border px-2.5 py-2 ${selected.has(location.id)?"border-violet-200 bg-violet-50/50":"border-slate-100 bg-slate-50 opacity-65"}`}><input type="checkbox" checked={selected.has(location.id)} onChange={()=>toggleLocation(group.key,location.id)} className="mt-0.5 shrink-0 accent-violet-600"/><button onClick={()=>onOpenChapter(location.chapterId)} className="min-w-0 flex-1 text-left"><span className="text-[10px] font-semibold text-violet-600">{location.chapter_order}. {location.chapterTitle} · dòng {location.line}</span><span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">…{location.context}…</span></button></div>)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><label className="mr-auto flex items-center gap-1.5 text-[11px] text-slate-500"><input type="checkbox" checked={Boolean(remember[group.key])} onChange={e=>setRemember({...remember,[group.key]:e.target.checked})} className="accent-violet-600"/>Ghi nhớ quyết định này</label><button onClick={()=>onIgnoreGroup(group,form,Boolean(remember[group.key]))} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600">Bỏ qua{remember[group.key]?" và ghi nhớ":""}</button><Button size="sm" variant="outline" onClick={()=>onOpenChapter(group.locations[0]?.chapterId)}><ExternalLink className="mr-1.5 h-3.5 w-3.5"/>Xem kỹ</Button></div>
        </div>})}</div>:<div className="space-y-2">{(qaWorkflow?.pending||[]).map(chapter=>{const reportChapter=report.chapters.find(item=>item.id===chapter.id);return <button key={chapter.id} onClick={()=>onOpenChapter(chapter.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-200"><span className={`h-2.5 w-2.5 rounded-full ${reportChapter?"bg-red-500":"bg-amber-400"}`}/><span className="min-w-0 flex-1 truncate"><b>{chapter.chapter_order}. {chapter.title}</b><small className="block text-slate-400">{reportChapter?`${reportChapter.count} lỗi/nghi vấn còn lại`:"Chưa xác nhận QA hoặc nội dung đã thay đổi"}</small></span><ExternalLink className="h-4 w-4 text-slate-300"/></button>})}{!(qaWorkflow?.pending||[]).length&&<div className="rounded-xl bg-emerald-50 p-5 text-center text-emerald-700">Không còn chương đã Edit nào chờ QA.</div>}</div>}
        {!(report.groups||[]).length&&<div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700">Không phát hiện lỗi/nghi vấn nào.</div>}
      </div>}
    </div>
    <ConfirmDialog
      open={confirmApplyPronoun}
      onOpenChange={setConfirmApplyPronoun}
      title={`Sửa ${pronounOccurrences} vị trí xưng hô trong ${pronounChapterCount} chương?`}
      description={`Sẽ ghi đè Bản Edit theo Ma Trận Xưng Hô hiện tại. Có thể hoàn tác ngay sau đó bằng nút "Hoàn tác thay hàng loạt".`}
      confirmLabel="Sửa hàng loạt"
      destructive={false}
      onConfirm={() => { setConfirmApplyPronoun(false); onApplyAllPronoun(form); }}
    />
  </DialogContent></Dialog>;
}
