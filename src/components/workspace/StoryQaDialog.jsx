import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, Loader2, Plus, SearchCheck, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
const emptySettings = { era:"neutral", context:"", genres:[], forbiddenWords:[] };

export default function StoryQaDialog({ open, onOpenChange, settings, report, running, onSaveSettings, onScan, onBulkReplace, onUndoBulkReplace, canUndoBulkReplace, onOpenChapter }) {
  const [form, setForm] = useState(emptySettings);
  const [genre, setGenre] = useState("");
  const [replacements, setReplacements] = useState({});
  useEffect(() => { if (open) setForm({ ...emptySettings, ...settings }); }, [open, settings]);
  const addGenre = () => { const value=genre.trim(); if(value&&!form.genres.includes(value))setForm({...form,genres:[...form.genres,value]}); setGenre(""); };
  const addForbidden = () => setForm({...form,forbiddenWords:[...form.forbiddenWords,{find:"",replace:""}]});
  const updateForbidden = (index,field,value) => setForm({...form,forbiddenWords:form.forbiddenWords.map((item,i)=>i===index?{...(typeof item==="string"?{find:item}:item),[field]:value}:item)});
  const save = async () => onSaveSettings(form);
  useEffect(() => { if(report?.groups)setReplacements(Object.fromEntries(report.groups.map(group=>[group.key,group.replacement||""]))); }, [report]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle className="flex items-center gap-2 text-violet-700"><SearchCheck className="h-5 w-5"/> Trung tâm QA toàn truyện</DialogTitle></DialogHeader>
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3">
        <div><label className="text-xs font-semibold text-slate-600">Nguyên tắc thời đại</label><select value={form.era} onChange={e=>setForm({...form,era:e.target.value})} className="mt-1 w-full rounded-lg border border-violet-100 bg-white px-3 py-2"><option value="ancient">Cổ đại / cổ trang — cảnh báo từ hiện đại</option><option value="modern">Hiện đại</option><option value="neutral">Trung tính — không áp luật thời đại</option></select></div>
        <div><label className="text-xs font-semibold text-slate-600">Bối cảnh chi tiết</label><input value={form.context||""} onChange={e=>setForm({...form,context:e.target.value})} placeholder="Có thể chọn gợi ý hoặc tự nhập/sửa" className="mt-1 w-full rounded-lg border border-violet-100 bg-white px-3 py-2"/><div className="mt-2 flex flex-wrap gap-1.5">{CONTEXT_SUGGESTIONS.map(item=><button key={item.label} onClick={()=>setForm({...form,context:item.label,era:item.era})} className={`rounded-full border px-2.5 py-1 text-[11px] ${form.context===item.label?"border-violet-500 bg-violet-100 text-violet-700":"border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>{item.label}</button>)}</div><p className="mt-1.5 text-[10px] text-slate-400">Chọn gợi ý sẽ đặt nguyên tắc thời đại phù hợp; bạn vẫn có thể sửa lại.</p></div>
        <div><label className="text-xs font-semibold text-slate-600">Thể loại</label><div className="mt-1 flex gap-2"><input value={genre} onChange={e=>setGenre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),addGenre())} placeholder="Nhập thể loại còn thiếu..." className="flex-1 rounded-lg border border-violet-100 px-3 py-2"/><Button variant="outline" onClick={addGenre}><Plus className="h-4 w-4"/></Button></div><div className="mt-2 flex flex-wrap gap-1.5">{GENRE_SUGGESTIONS.map(item=><button key={item} onClick={()=>setForm({...form,genres:form.genres.includes(item)?form.genres.filter(x=>x!==item):[...form.genres,item]})} className={`rounded-full border px-2.5 py-1 text-[11px] ${form.genres.includes(item)?"border-violet-500 bg-violet-100 text-violet-700":"border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>{form.genres.includes(item)?"✓ ":""}{item}</button>)}</div>{form.genres.some(item=>!GENRE_SUGGESTIONS.includes(item))&&<div className="mt-2 flex flex-wrap gap-1.5">{form.genres.filter(item=>!GENRE_SUGGESTIONS.includes(item)).map(item=><button key={item} onClick={()=>setForm({...form,genres:form.genres.filter(x=>x!==item)})} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{item} ×</button>)}</div>}<p className="mt-1.5 text-[10px] text-slate-400">Bấm để chọn/bỏ chọn. Thể loại tự nhập có thể xóa bằng dấu ×.</p></div>
        <div><div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-600">Từ/cụm từ cấm cần quét</label><button onClick={addForbidden} className="text-xs text-violet-600">+ Thêm từ cấm</button></div><div className="mt-2 space-y-2">{form.forbiddenWords.map((item,index)=>{const rule=typeof item==="string"?{find:item,replace:""}:item;return <div key={index} className="flex gap-2"><input value={rule.find||""} onChange={e=>updateForbidden(index,"find",e.target.value)} placeholder="Từ cần cảnh báo" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5"/><input value={rule.replace||""} onChange={e=>updateForbidden(index,"replace",e.target.value)} placeholder="Gợi ý thay (không bắt buộc)" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5"/><button onClick={()=>setForm({...form,forbiddenWords:form.forbiddenWords.filter((_,i)=>i!==index)})}><Trash2 className="h-4 w-4 text-red-400"/></button></div>})}</div></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={save}>Lưu cấu hình</Button><Button disabled={running} onClick={async()=>{await save();await onScan(form);}} className="bg-violet-600 hover:bg-violet-700">{running?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<SearchCheck className="mr-2 h-4 w-4"/>}Quét QA toàn truyện</Button></div>
      </div>
      {report&&<div className="space-y-3"><div className="flex items-center justify-between gap-2"><b>Kết quả: {report.issueCount} lỗi/nghi vấn · {report.chapters.length} chương</b>{canUndoBulkReplace&&<Button size="sm" variant="outline" disabled={running} onClick={async()=>{await onUndoBulkReplace();await onScan(form);}}>Hoàn tác thay hàng loạt</Button>}</div>
        {report.groupsStale&&<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Bạn vừa sửa nội dung một chương. Số lỗi của chương đã cập nhật, nhưng các nhóm tổng hợp cần bấm <b>Quét QA toàn truyện</b> để làm mới hoàn toàn.</div>}
        <div className="space-y-3">{(report.groups||[]).map(group=><div key={group.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${group.replacement&&!group.contextual?"text-emerald-500":"text-amber-500"}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b>{group.label}</b><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{group.count} lần · {group.chapterCount} chương</span>{group.replacement&&!group.contextual?<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">Có thể sửa hàng loạt</span>:<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">Cần xem ngữ cảnh</span>}</div><div className="mt-1 flex items-center gap-2 text-sm"><code className="rounded bg-red-50 px-2 py-1 text-red-700">{group.value}</code><ArrowRight className="h-3.5 w-3.5 text-slate-300"/><input value={replacements[group.key]??""} onChange={e=>setReplacements({...replacements,[group.key]:e.target.value})} placeholder="Nhập cách thay nếu muốn sửa hàng loạt" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5"/></div></div></div>
          <div className="mt-2 space-y-1.5">{group.samples.map((sample,index)=><button key={`${sample.chapterId}-${index}`} onClick={()=>onOpenChapter(sample.chapterId)} className="block w-full rounded-lg bg-slate-50 px-2.5 py-2 text-left hover:bg-violet-50"><span className="text-[10px] font-semibold text-violet-600">{sample.chapter_order}. {sample.chapterTitle} · dòng {sample.line}</span><span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">…{sample.context}…</span></button>)}</div>
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>onOpenChapter(group.samples[0]?.chapterId)}><ExternalLink className="mr-1.5 h-3.5 w-3.5"/>Tới chương để xem kỹ</Button><Button size="sm" disabled={running||!String(replacements[group.key]||"").trim()} onClick={()=>onBulkReplace(group,replacements[group.key],form)} className="bg-emerald-600 hover:bg-emerald-700">Thay tất cả {group.count} vị trí</Button></div>
        </div>)}</div>
        {!(report.groups||[]).length&&<div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-700">Không phát hiện lỗi/nghi vấn nào.</div>}
      </div>}
    </div>
  </DialogContent></Dialog>;
}
