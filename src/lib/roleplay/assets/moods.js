import { pickBySeed } from "./hash";

// Scene mood → background gradient + particle overlay. Purely CSS/inline-SVG,
// no images, no network. The Scene Writer prompt may hint `scene.mood`; when
// absent (or unrecognized) a deterministic hash of the scene id fills in, so
// every scene still gets a mood without needing the AI to cooperate.
export const MOOD_PRESETS = [
  { id: "tense", label: "Căng thẳng", gradient: "from-rose-600/25 via-slate-900 to-slate-950", particle: "ember", accentColor: "#fb7185" },
  { id: "danger", label: "Nguy hiểm", gradient: "from-red-700/30 via-slate-950 to-black", particle: "ember", accentColor: "#f87171" },
  { id: "romantic", label: "Lãng mạn", gradient: "from-fuchsia-600/25 via-rose-900/20 to-slate-950", particle: "sparkle", accentColor: "#f9a8d4" },
  { id: "triumphant", label: "Chiến thắng", gradient: "from-amber-500/25 via-orange-900/15 to-slate-950", particle: "sparkle", accentColor: "#fbbf24" },
  { id: "melancholic", label: "U buồn", gradient: "from-slate-600/25 via-slate-900 to-slate-950", particle: "rain", accentColor: "#94a3b8" },
  { id: "mysterious", label: "Bí ẩn", gradient: "from-violet-700/25 via-indigo-950/30 to-slate-950", particle: "sparkle", accentColor: "#a78bfa" },
  { id: "neutral", label: "Bình thường", gradient: "from-violet-500/15 to-fuchsia-500/10", particle: "none", accentColor: "#c4b5fd" },
  { id: "hope", label: "Hy vọng", gradient: "from-emerald-500/20 via-teal-900/15 to-slate-950", particle: "sparkle", accentColor: "#34d399" },
  { id: "chaos", label: "Hỗn loạn", gradient: "from-fuchsia-600/25 via-red-800/20 to-slate-950", particle: "ember", accentColor: "#e879f9" },
];

export function pickMoodForScene(scene) {
  const explicit = MOOD_PRESETS.find((mood) => mood.id === String(scene?.mood || "").toLowerCase());
  if (explicit) return explicit;
  return pickBySeed(MOOD_PRESETS, scene?.id || "scene") || MOOD_PRESETS[6];
}
