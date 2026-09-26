import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Download, Gamepad2, Loader2, Play, Shuffle, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { Project, Chapter } from "@/api/entities";
import { RoleplayScenario } from "@/api/roleplayEntities";
import { fetchAllPages } from "@/lib/paginate";
import { hasCustomAI } from "@/lib/llm";
import { generateRoleplay } from "@/lib/roleplay/generator";
import { SAMPLE_ROLEPLAY_PACK } from "@/lib/roleplay/fixture";
import { listEndings } from "@/lib/roleplay/progress";
import RoleplayPreview from "@/components/roleplay/RoleplayPreview";
import { useToast } from "@/components/ui/use-toast";

const STEPS = [
  ["context", "Đọc bối cảnh và nhân vật"], ["blueprint", "Thiết kế Hệ Thống và nhiệm vụ"],
  ["scenes_1_4", "Viết phân cảnh 1–4"], ["scenes_5_6", "Viết phân cảnh rẽ nhánh giữa truyện"],
  ["scenes_7_8", "Viết phân cảnh cao trào"], ["scenes_9_10", "Viết phân cảnh kết và ending"],
  ["validation", "Kiểm tra logic và mô phỏng"], ["completed", "Hoàn tất Roleplay"],
];

function pickRandomChapterRange(chapters) {
  const eligible = chapters.filter((chapter) => String(chapter.edited || "").trim());
  if (!eligible.length) return [];
  const rangeLen = Math.min(eligible.length, 3 + Math.floor(Math.random() * 4));
  const maxStart = Math.max(0, eligible.length - rangeLen);
  let start;
  if (maxStart > 0 && Math.random() < 0.7) {
    const biasedMin = Math.floor(maxStart * 0.33);
    start = biasedMin + Math.floor(Math.random() * (maxStart - biasedMin + 1));
  } else {
    start = Math.floor(Math.random() * (maxStart + 1));
  }
  return eligible.slice(start, start + rangeLen).map((chapter) => chapter.id);
}

// One-time safety net for the 2026-08-14→08-15 switch from localStorage
// back to Supabase: any scenario drafts a user made while the feature was
// local-only would otherwise just vanish from view once this page starts
// reading from Supabase instead. Runs on every load, but only actually does
// anything if it finds leftover rows for this project — after a successful
// migrate it deletes them from localStorage, so it's a no-op on every
// subsequent load. If Supabase's roleplay tables don't exist yet (migration
// SQL not run), RoleplayScenario.create throws and this just leaves the
// local rows untouched to retry next time, rather than losing them.
const LOCAL_SCENARIOS_KEY = "etq-roleplay-v1:roleplay_scenarios";

function readLocalScenarios() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SCENARIOS_KEY) || "[]"); }
  catch { return []; }
}

async function migrateLocalScenarios(projectId) {
  const all = readLocalScenarios();
  const mine = all.filter((row) => row.project_id === projectId);
  if (!mine.length) return [];
  const migrated = [];
  for (const row of mine) {
    // eslint-disable-next-line no-await-in-loop
    const created = await RoleplayScenario.create({
      project_id: row.project_id,
      analysis_id: null, // the old row's analysis_id pointed at a localStorage-only id, never a real Supabase row
      title: row.title || "",
      status: row.status || "draft",
      source_chapter_ids: row.source_chapter_ids || [],
      source_hash: row.source_hash || "",
      pack: row.pack || {},
      validation_report: row.validation_report || {},
    });
    migrated.push(created);
  }
  const remaining = all.filter((row) => row.project_id !== projectId);
  localStorage.setItem(LOCAL_SCENARIOS_KEY, JSON.stringify(remaining));
  return migrated;
}

function downloadPack(pack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `${pack.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "roleplay"}.json`; link.click();
  URL.revokeObjectURL(url);
}

export default function RoleplayStudio() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(routeProjectId || "");
  const [chapters, setChapters] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState("");
  const [preview, setPreview] = useState(null);
  const activeProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAllPages((limit, skip) => Project.list("-updated_date", limit, skip), { pageSize: 200, maxItems: 5000 });
        setProjects(data);
        if (!routeProjectId && data[0]) setProjectId(data[0].id);
      } catch (error) { toast({ title: "Không tải được danh sách truyện", description: error.message, variant: "destructive" }); }
      setLoading(false);
    })();
  }, [routeProjectId, toast]);

  useEffect(() => {
    if (!projectId) { setChapters([]); setScenarios([]); return; }
    (async () => {
      try {
        // Only used here to populate the chapter picker (title + whether it
        // has a Bản Edit) — generateRoleplay() does its own separate,
        // full-column Chapter.getMany() fetch scoped to just the handful of
        // selected chapters once the user actually generates, so this list
        // never needs raw_original/qt_raw.
        const [chapterData, scenarioData] = await Promise.all([
          fetchAllPages((limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip, ["title", "chapter_order", "edited"]), { pageSize: 200, maxItems: 5000 }),
          RoleplayScenario.list(projectId).catch((error) => { if (String(error.message).includes("roleplay_scenarios")) return []; throw error; }),
        ]);
        setChapters(chapterData);
        const ready = chapterData.filter((chapter) => String(chapter.edited || "").trim());
        setSelectedIds(ready.slice(0, 5).map((chapter) => chapter.id));
        setScenarios(scenarioData);
        try {
          const migrated = await migrateLocalScenarios(projectId);
          if (migrated.length) {
            setScenarios((current) => [...migrated, ...current]);
            toast({ title: `Đã chuyển ${migrated.length} bản nháp Roleplay cũ sang lưu trữ mới`, description: "Bản nháp cũ lưu trong trình duyệt đã được đồng bộ, không bị mất." });
          }
        } catch (migrationError) {
          console.error("Roleplay local-draft migration failed", migrationError);
        }
      } catch (error) { toast({ title: "Không tải được dữ liệu Roleplay", description: error.message, variant: "destructive" }); }
    })();
  }, [projectId, toast]);

  const selectedChapters = useMemo(() => chapters.filter((chapter) => selectedIds.includes(chapter.id)), [chapters, selectedIds]);
  const toggleChapter = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 10 ? [...current, id] : current);
  const generate = async () => {
    if (!activeProject || selectedIds.length === 0) return;
    if (!hasCustomAI()) { toast({ title: "Chưa cấu hình AI", description: "Hãy cấu hình Gemini, GPT hoặc OrcaRouter từ trang chủ.", variant: "destructive" }); return; }
    setGenerating(true); setStep("context");
    try {
      const scenario = await generateRoleplay({ project: activeProject, chapterIds: selectedIds, onProgress: setStep });
      setScenarios((current) => [scenario, ...current]);
      setPreview(scenario.pack);
      toast({ title: "Roleplay đã sẵn sàng ✨", description: scenario.validation_report?.valid ? "Kịch bản đã qua kiểm tra logic." : "Kịch bản được lưu nháp vì còn lỗi validation." });
    } catch (error) { toast({ title: "Không generate được Roleplay", description: error.message, variant: "destructive" }); }
    setGenerating(false);
  };
  const remove = async (scenario) => {
    if (!window.confirm(`Xóa Roleplay “${scenario.title}”?`)) return;
    try { await RoleplayScenario.delete(scenario.id); setScenarios((current) => current.filter((item) => item.id !== scenario.id)); }
    catch (error) { toast({ title: "Không xóa được", description: error.message, variant: "destructive" }); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-violet-50"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  return <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/85 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6"><button onClick={() => navigate("/")} className="rounded-xl p-2 text-slate-500 hover:bg-violet-50"><ArrowLeft className="h-4 w-4" /></button><span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-700 text-white shadow-md"><Gamepad2 className="h-5 w-5" /></span><div><h1 className="font-bold">Roleplay Studio</h1><p className="text-[11px] text-slate-400">Biến truyện thành trải nghiệm xuyên sách</p></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-9"><div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl" /><div className="relative grid gap-7 lg:grid-cols-[1fr_22rem] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-fuchsia-300">Công cụ 06</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Xuyên vào chính câu chuyện của bạn.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">Chọn một khoảng chương. AI sẽ tìm xung đột, tạo Hệ Thống, nhiệm vụ, 10 phân cảnh và kiểm tra đường chơi trước khi bạn duyệt.</p></div><button onClick={generate} disabled={generating || !projectId || selectedIds.length === 0} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-4 text-sm font-bold shadow-lg disabled:cursor-not-allowed disabled:opacity-50">{generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />}{generating ? "Đang dựng thế giới…" : "Generate Roleplay"}</button></div></section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"><label className="text-xs font-bold uppercase tracking-wider text-slate-400">Bộ truyện</label><select value={projectId} onChange={(event) => { setProjectId(event.target.value); navigate(event.target.value ? `/roleplay/${event.target.value}` : "/roleplay", { replace: true }); }} className="mt-2 w-full rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400"><option value="">Chọn bộ truyện</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></section>
          <section className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Khoảng chương</h3><p className="mt-1 text-[11px] text-slate-400">Chọn 1–10 chương có Bản Edit</p></div><div className="flex items-center gap-1.5"><button onClick={() => setSelectedIds(pickRandomChapterRange(chapters))} disabled={!chapters.some((chapter) => String(chapter.edited || "").trim())} className="rounded-lg border border-violet-100 p-1.5 text-violet-500 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-35" title="Chọn ngẫu nhiên một khoảng chương"><Shuffle className="h-3.5 w-3.5" /></button><span className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-bold text-violet-600">{selectedIds.length}/10</span></div></div><div className="mt-4 max-h-80 space-y-1.5 overflow-y-auto pr-1">{chapters.map((chapter) => { const hasEdited = Boolean(String(chapter.edited || "").trim()); const selected = selectedIds.includes(chapter.id); return <button key={chapter.id} disabled={!hasEdited} onClick={() => toggleChapter(chapter.id)} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${selected ? "border-violet-300 bg-violet-50 text-violet-800" : "border-transparent bg-slate-50 text-slate-600 hover:border-violet-100"} disabled:cursor-not-allowed disabled:opacity-35`}><span className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-violet-500" : hasEdited ? "bg-emerald-400" : "bg-slate-300"}`} /><span className="truncate">{chapter.title}</span>{selected && <CheckCircle2 className="ml-auto h-3.5 w-3.5" />}</button>; })}{!chapters.length && <p className="py-5 text-center text-xs text-slate-400">Truyện chưa có chương.</p>}</div></section>
        </aside>

        <div className="space-y-6">
          {generating && <section className="rounded-3xl border border-fuchsia-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-fuchsia-50 text-fuchsia-600"><Sparkles className="h-5 w-5 animate-pulse" /></span><div><h3 className="font-bold">AI đang dựng Roleplay</h3><p className="text-xs text-slate-400">Tiến độ được lưu sau mỗi bước hoàn tất.</p></div></div><div className="mt-5 space-y-2">{STEPS.map(([id, label]) => { const currentIndex = STEPS.findIndex(([key]) => key === step); const index = STEPS.findIndex(([key]) => key === id); const done = index < currentIndex || step === "completed"; const active = id === step; return <div key={id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${active ? "bg-fuchsia-50 text-fuchsia-700" : done ? "text-emerald-600" : "text-slate-300"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border" />} {label}</div>; })}</div></section>}
          <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">Scenarios</p><h2 className="mt-1 text-2xl font-bold">Roleplay của truyện</h2></div><span className="text-sm text-slate-400">{scenarios.length} kịch bản</span></div>
            <div className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-3xl border border-dashed border-violet-200 bg-white/60 p-5"><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-600"><Play className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">SAMPLE</span></div><h3 className="mt-5 font-bold">{SAMPLE_ROLEPLAY_PACK.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">Kịch bản mẫu 8 cảnh để kiểm tra game engine mà không gọi AI.</p><button onClick={() => setPreview(SAMPLE_ROLEPLAY_PACK)} className="mt-5 flex items-center gap-1.5 text-sm font-bold text-violet-600">Chơi thử <ChevronRight className="h-4 w-4" /></button></article>
              {scenarios.map((scenario) => <article key={scenario.id} className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-100 to-violet-100 text-violet-700"><Gamepad2 className="h-5 w-5" /></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${scenario.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{scenario.status.toUpperCase()}</span></div><h3 className="mt-5 font-bold">{scenario.title}</h3><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><BookOpen className="h-3.5 w-3.5" /> {scenario.pack?.source?.chapterRangeLabel || "—"}</p>{Boolean(scenario.pack?.endings?.length) && <p className="mt-2 text-[10px] font-bold text-amber-600">🏆 {listEndings(scenario.pack.id).length}/{scenario.pack.endings.length} kết cục đã khám phá</p>}<div className="mt-5 flex items-center gap-2"><button onClick={() => setPreview(scenario.pack)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white"><Play className="h-3.5 w-3.5" /> Preview</button><button onClick={() => downloadPack(scenario.pack)} className="rounded-xl border border-violet-100 p-2 text-slate-500 hover:text-violet-600" title="Export JSON"><Download className="h-4 w-4" /></button><button onClick={() => remove(scenario)} className="rounded-xl border border-rose-100 p-2 text-slate-400 hover:text-rose-600" title="Xóa"><Trash2 className="h-4 w-4" /></button></div>{scenario.validation_report?.simulation && <p className="mt-3 text-[10px] text-slate-400">Mô phỏng {scenario.validation_report.simulation.runs} lượt · trung bình {scenario.validation_report.simulation.averageSteps} cảnh</p>}</article>)}
            </div>
          </section>
          {!projects.length && <div className="rounded-3xl border border-dashed border-violet-200 bg-white p-10 text-center"><BookOpen className="mx-auto h-10 w-10 text-violet-300" /><h3 className="mt-4 font-bold">Chưa có bộ truyện</h3><p className="mt-2 text-sm text-slate-400">Hãy nhập hoặc tạo truyện trong Edit Truyện trước.</p><button onClick={() => navigate("/stories")} className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">Mở Edit Truyện</button></div>}
        </div>
      </div>
    </main>
    {preview && <RoleplayPreview key={preview.id} pack={preview} onClose={() => setPreview(null)} />}
  </div>;
}
