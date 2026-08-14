import { Component, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, BookUser, RotateCcw, Shield, Sparkles, Target, X } from "lucide-react";
import { availableChoices, choose, createInitialState, getScene, preparePackForPlay } from "@/lib/roleplay/engine";
import { pickMoodForScene } from "@/lib/roleplay/assets/moods";
import { clearProgress, loadProgress, recordEnding, saveProgress } from "@/lib/roleplay/progress";
import PortraitSvg from "./PortraitSvg";

const ENDING_STYLE = { HE: "from-emerald-500 to-teal-600", NE: "from-slate-500 to-slate-700", BE: "from-rose-600 to-red-800", SPECIAL: "from-fuchsia-500 to-violet-700", HIDDEN: "from-amber-500 to-orange-700" };
const STAT_META = { survival: { label: "Sinh tồn", color: "bg-emerald-400" }, suspicion: { label: "Nghi ngờ", color: "bg-rose-400" }, plotDeviation: { label: "Lệch cốt truyện", color: "bg-fuchsia-400" } };
const TOTAL_BEATS = 10;

function stateChanges(before, after) {
  const rows = [];
  for (const [key, value] of Object.entries(after.stats || {})) {
    const delta = value - (before.stats?.[key] ?? value);
    if (delta) rows.push(`${STAT_META[key]?.label || key} ${delta > 0 ? "+" : ""}${delta}`);
  }
  for (const [key, value] of Object.entries(after.relationships || {})) {
    const delta = value - (before.relationships?.[key] ?? value);
    if (delta) rows.push(`Thiện cảm ${key} ${delta > 0 ? "+" : ""}${delta}`);
  }
  return rows;
}

/** @returns {[string, () => void]} */
function useTypewriter(text, speedMs = 14) {
  const [output, setOutput] = useState("");
  const skipRef = useRef(false);
  useEffect(() => {
    skipRef.current = false;
    setOutput("");
    if (!text) return undefined;
    let index = 0;
    const id = setInterval(() => {
      if (skipRef.current) { setOutput(text); clearInterval(id); return; }
      index += 1;
      setOutput(text.slice(0, index));
      if (index >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text]);
  return [output, () => { skipRef.current = true; }];
}

function seededPositions(seed, count) {
  let hash = 0x811c9dc5 ^ hashCode(seed);
  const rand = () => { hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5; hash >>>= 0; return (hash % 1000) / 1000; };
  return Array.from({ length: count }, () => ({ left: `${8 + rand() * 84}%`, top: `${8 + rand() * 84}%`, delay: rand() * 2 }));
}
function hashCode(text) { let h = 0; for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0; return h; }

function MoodParticles({ mood, seed }) {
  const positions = useMemo(() => seededPositions(seed, 10), [seed]);
  if (!mood || mood.particle === "none") return null;
  const shapeClass = mood.particle === "rain" ? "h-4 w-px" : "h-1.5 w-1.5 rounded-full";
  return <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {positions.map((pos, index) => <motion.span key={index} className={`absolute ${shapeClass}`} style={{ left: pos.left, top: pos.top, background: mood.accentColor }}
      animate={mood.particle === "rain" ? { y: [0, 40], opacity: [0, 0.6, 0] } : { y: [0, -10, 0], opacity: [0.15, 0.7, 0.15] }}
      transition={{ duration: mood.particle === "rain" ? 1.1 : 3, repeat: Infinity, delay: pos.delay, ease: "easeInOut" }} />)}
  </div>;
}

function MissionList({ pack, state, intro = false }) {
  const completed = new Set(state?.missions?.completed || []);
  const failed = new Set(state?.missions?.failed || []);
  const unlocked = new Set(state?.missions?.unlocked || []);
  const visible = [pack.missions.main, ...(pack.missions.side || [])].filter(Boolean);
  return <div className="space-y-2">
    {visible.map((mission) => <div key={mission.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"><div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-wider ${mission.type === "main" ? "text-fuchsia-300" : "text-sky-300"}`}>{mission.type === "main" ? "Chính" : "Phụ"}</span>{completed.has(mission.id) && <span className="text-[10px] text-emerald-300">✓ Hoàn thành</span>}{failed.has(mission.id) && <span className="text-[10px] text-rose-300">✕ Thất bại</span>}</div><p className="mt-1 text-xs leading-5 text-white/70">{String(mission.description || mission.title || "")}</p></div>)}
    {(pack.missions.hidden || []).map((mission) => unlocked.has(mission.id) ? <div key={mission.id} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5"><span className="text-[10px] font-black uppercase tracking-wider text-amber-300">✦ Nhiệm vụ ẩn</span><p className="mt-1 text-xs font-bold text-white/85">{String(mission.title || "Nhiệm vụ ẩn")}</p><p className="mt-1 text-xs leading-5 text-white/60">{String(mission.description || "")}</p></div> : <div key={mission.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-xs text-white/35">🔒 Nhiệm vụ ẩn chưa mở khóa</div>)}
    {intro && !(pack.missions.side || []).length && <p className="text-[11px] text-white/35">Scenario này không có nhiệm vụ phụ.</p>}
  </div>;
}

function RoleplayPreviewContent({ pack, onClose }) {
  const playablePack = useMemo(() => preparePackForPlay(pack), [pack]);
  const fresh = useMemo(() => createInitialState(playablePack), [playablePack]);
  const [savedProgress, setSavedProgress] = useState(() => loadProgress(playablePack.id));
  const [state, setState] = useState(fresh);
  const [sceneId, setSceneId] = useState(playablePack.startSceneId);
  const [ending, setEnding] = useState(null);
  const [started, setStarted] = useState(false);
  const [playError, setPlayError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const scene = getScene(playablePack, sceneId);
  const choices = availableChoices(scene, state);
  const mood = useMemo(() => pickMoodForScene(scene), [scene]);
  const [typedText, skipTyping] = useTypewriter(!started || ending ? "" : scene?.text || "");

  useEffect(() => {
    if (ending && (ending.type === "HE" || ending.type === "SPECIAL")) confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
  }, [ending]);

  const restart = () => { clearProgress(playablePack.id); setSavedProgress(null); setState(createInitialState(playablePack)); setSceneId(playablePack.startSceneId); setEnding(null); setStarted(false); setPlayError(""); setOutcome(null); };
  const resume = () => { setState(savedProgress.state); setSceneId(savedProgress.sceneId); setStarted(true); setSavedProgress(null); };
  const select = (choiceId) => {
    try {
      const result = choose(playablePack, state, sceneId, choiceId);
      const choice = choices.find((item) => item.id === choiceId);
      setState(result.state); setOutcome({ choice, nextSceneId: result.nextSceneId, ending: result.ending, changes: stateChanges(state, result.state) }); setPlayError("");
    } catch (error) {
      setPlayError(error.message || "Lựa chọn này có dữ liệu không hợp lệ.");
    }
  };
  const continueStory = () => {
    const { nextSceneId, ending: reachedEnding } = outcome;
    if (nextSceneId) saveProgress(playablePack.id, { sceneId: nextSceneId, state });
    else { clearProgress(playablePack.id); if (reachedEnding) recordEnding(playablePack.id, reachedEnding); }
    setSceneId(nextSceneId); setEnding(reachedEnding); setOutcome(null);
  };
  const characterSeed = `${playablePack.id}:${scene?.primaryCharacterId || sceneId}`;

  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/95 text-white backdrop-blur-xl">
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-300">Roleplay Preview</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">{pack.title}</h1></div>
        <div className="flex gap-2"><button onClick={restart} className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10" title="Chơi lại"><RotateCcw className="h-4 w-4" /></button><button onClick={onClose} className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10" title="Đóng"><X className="h-4 w-4" /></button></div>
      </div>
      {!started ? <div className="overflow-hidden rounded-[2rem] border border-fuchsia-400/20 bg-white/[.06] shadow-2xl">
        <div className="bg-gradient-to-br from-violet-600/30 via-fuchsia-600/15 to-transparent p-6 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-fuchsia-300"><Sparkles className="h-4 w-4" /> {playablePack.system.activationText}</p>
              <h2 className="mt-6 text-3xl font-bold leading-tight">Bạn đã xuyên thành<br/><span className="text-fuchsia-300">{playablePack.player.role}</span></h2></div>
            <PortraitSvg seed={`${playablePack.id}:system`} size={64} className="shrink-0 drop-shadow-lg" />
          </div>
          <p className="mt-4 text-sm leading-7 text-white/55">{playablePack.player.loreRule}</p><p className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs italic text-white/45">Tính cách Hệ Thống: {playablePack.system.personality} · Độ tin cậy ban đầu: {playablePack.system.reliability}%</p>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300"><Target className="h-4 w-4" /> Nhiệm vụ chính</p><p className="mt-3 text-sm leading-6 text-white/80">{playablePack.system.mainMission}</p></div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300"><Shield className="h-4 w-4" /> Điều kiện thất bại</p><p className="mt-3 text-sm leading-6 text-white/80">{playablePack.system.failureText}</p></div>
          <div className="sm:col-span-2"><MissionList pack={playablePack} state={fresh} intro />
            {savedProgress && <button onClick={resume} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-300/40 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-200 hover:bg-violet-500/20"><RotateCcw className="h-4 w-4" /> Tiếp tục hành trình đã lưu</button>}
            <button onClick={() => setStarted(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-3.5 text-sm font-bold"><BookUser className="h-4 w-4" /> {savedProgress ? "Bắt đầu ván mới" : "Bắt đầu xuyên sách"} <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div> : !ending ? <>
        <div className="mb-4 grid grid-cols-3 gap-2 text-[11px]">
          {Object.entries(state.stats).map(([key, value]) => { const rule = playablePack.stateSchema.stats[key] || { min: 0, max: 100 }; const percent = Math.max(0, Math.min(100, ((value - rule.min) / Math.max(1, rule.max - rule.min)) * 100)); const meta = STAT_META[key] || { label: key, color: "bg-violet-400" }; return <div key={key} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="flex justify-between text-white/45"><span>{meta.label}</span><b className="text-white">{value}</b></span><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className={`h-full ${meta.color}`} animate={{ width: `${percent}%` }} transition={{ duration: 0.4 }} /></div></div>; })}
        </div>
        {state.notifications?.map((notice, index) => <div key={`${notice.type}-${index}`} className={`mb-3 rounded-2xl border px-4 py-3 ${notice.type === "system_warning" ? "border-rose-400/30 bg-rose-500/10" : "border-amber-400/30 bg-amber-500/10"}`}><p className="text-xs font-black uppercase tracking-[.15em] text-amber-300">[TING!] {String(notice.title || "Thông báo Hệ Thống")}</p><p className="mt-1 text-sm text-white/80">{String(notice.message || "")}</p></div>)}
        <p className="mb-2 text-right text-[11px] text-white/30">{Math.min(state.path.length, TOTAL_BEATS)}/{TOTAL_BEATS} · {playablePack.system.mainMission}</p>
        <AnimatePresence mode="wait">
          <motion.div key={sceneId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}
            className={`relative overflow-hidden rounded-[2rem] border border-violet-400/20 bg-gradient-to-br shadow-2xl ${mood.gradient}`}>
            <MoodParticles mood={mood} seed={sceneId} />
            <div className="relative border-b border-white/10 bg-black/10 p-5 sm:p-7">
              <div className="flex items-center gap-3"><PortraitSvg seed={characterSeed} size={40} /><p className="flex items-center gap-2 text-xs font-bold text-violet-200"><Sparkles className="h-4 w-4" /> {scene?.systemMessage}</p></div>
            </div>
            <article onClick={skipTyping} className="relative cursor-pointer p-5 sm:p-8"><h2 className="text-2xl font-bold">{scene?.title}</h2><p className="mt-5 min-h-[3em] whitespace-pre-wrap text-[15px] leading-8 text-white/80">{typedText}</p></article>
          </motion.div>
        </AnimatePresence>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]"><div className="space-y-3">{playError && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{playError}</div>}{outcome ? <div className="rounded-3xl border border-violet-400/25 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 p-5"><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-300">Hậu quả hành động</p><p className="mt-3 text-sm leading-7 text-white/75">{String(outcome.choice?.resultText || "Lựa chọn của bạn đã làm tình thế thay đổi. Những người xung quanh bắt đầu phản ứng theo một hướng mới.")}</p>{outcome.changes.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{outcome.changes.map((change) => <span key={change} className={`rounded-full px-3 py-1 text-xs font-bold ${change.includes("-") ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"}`}>{change}</span>)}</div>}<div className="mt-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm italic text-fuchsia-200"><b>[Hệ Thống]</b> {String(outcome.choice?.systemReaction || (outcome.changes.length ? "Đã cập nhật trạng thái ký chủ. Mọi hậu quả đều sẽ được ghi nhận." : "Không phát hiện lợi thế rõ ràng. Ký chủ nên thận trọng."))}</div><button onClick={continueStory} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold">{outcome.ending ? "Xem kết cục" : "Tiếp tục câu chuyện"}<ArrowRight className="h-4 w-4" /></button></div> : choices.map((choice, index) => <button key={choice.id} onClick={() => select(choice.id)} className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:border-violet-400/50 hover:bg-violet-500/10"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-bold text-violet-200">{String.fromCharCode(65 + index)}</span><span className="flex-1 text-sm leading-6 text-white/80">{choice.text}</span><ArrowRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1 group-hover:text-violet-300" /></button>)}</div><aside><p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-white/35">Nhiệm vụ</p><MissionList pack={playablePack} state={state} /></aside></div>
      </> : <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className={`rounded-[2rem] bg-gradient-to-br ${ENDING_STYLE[ending.type] || ENDING_STYLE.NE} p-8 text-center shadow-2xl sm:p-12`}><Shield className="mx-auto h-12 w-12 text-white/80" /><p className="mt-5 text-xs font-black tracking-[.3em] text-white/65">{String(ending.type || "NE")} ENDING</p><h2 className="mt-3 text-3xl font-bold">{String(ending.title || "Kết thúc")}</h2><p className="mx-auto mt-5 max-w-xl leading-8 text-white/80">{String(ending.text || "")}</p><button onClick={restart} className="mt-8 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900">Chơi lại</button></motion.div>}
      {started && !ending && !scene && <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100"><b>Kịch bản đã đi tới một nhánh chưa có cảnh kết thúc.</b><p className="mt-2 text-white/60">Dữ liệu AI của scenario này chưa hoàn chỉnh. Bạn có thể chơi lại hoặc đóng bản xem trước.</p><button onClick={restart} className="mt-4 rounded-xl bg-white px-4 py-2 font-bold text-slate-900">Chơi lại</button></div>}
    </div>
  </div>;
}

class RoleplayPreviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Roleplay preview error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950 p-6 text-white"><div className="w-full max-w-lg rounded-3xl border border-rose-400/25 bg-white/[.06] p-7"><h2 className="text-xl font-bold">Scenario có dữ liệu chưa hợp lệ</h2><p className="mt-3 text-sm leading-6 text-white/60">Một cảnh do AI tạo bị sai cấu trúc. Giao diện đã chặn lỗi để không còn màn hình trắng.</p><div className="mt-5 flex gap-3"><button onClick={() => this.setState({ error: null })} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900">Thử lại</button><button onClick={this.props.onClose} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Đóng</button></div></div></div>;
  }
}

export default function RoleplayPreview(props) {
  return <RoleplayPreviewBoundary onClose={props.onClose}><RoleplayPreviewContent {...props} /></RoleplayPreviewBoundary>;
}
