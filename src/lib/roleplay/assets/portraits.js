import { pickBySeed } from "./hash";

// Hand-authored "sticker" portrait variants: thick outline in a darker shade
// of the fill color, big sparkle/round eyes, zero network requests, zero AI
// image calls. Same spirit as LilyHub's own hand-drawn SVG avatar system.
export const PORTRAIT_VARIANTS = [
  { id: "violet", fill: "#a78bfa", outline: "#5b21b6", accent: "#fbcfe8", eyeStyle: "sparkle", mouthStyle: "smile" },
  { id: "rose", fill: "#fb7185", outline: "#9f1239", accent: "#fef3c7", eyeStyle: "round", mouthStyle: "smirk" },
  { id: "amber", fill: "#fbbf24", outline: "#92400e", accent: "#fff7ed", eyeStyle: "sharp", mouthStyle: "neutral" },
  { id: "emerald", fill: "#34d399", outline: "#065f46", accent: "#ecfdf5", eyeStyle: "round", mouthStyle: "smile" },
  { id: "sky", fill: "#38bdf8", outline: "#0c4a6e", accent: "#e0f2fe", eyeStyle: "sparkle", mouthStyle: "neutral" },
  { id: "fuchsia", fill: "#e879f9", outline: "#86198f", accent: "#fdf4ff", eyeStyle: "sparkle", mouthStyle: "smirk" },
  { id: "slate", fill: "#94a3b8", outline: "#1e293b", accent: "#f1f5f9", eyeStyle: "sharp", mouthStyle: "neutral" },
  { id: "orange", fill: "#fb923c", outline: "#7c2d12", accent: "#fff7ed", eyeStyle: "round", mouthStyle: "smile" },
  { id: "teal", fill: "#2dd4bf", outline: "#134e4a", accent: "#f0fdfa", eyeStyle: "sparkle", mouthStyle: "smile" },
  { id: "crimson", fill: "#f87171", outline: "#7f1d1d", accent: "#fef2f2", eyeStyle: "sharp", mouthStyle: "smirk" },
  { id: "indigo", fill: "#818cf8", outline: "#312e81", accent: "#eef2ff", eyeStyle: "round", mouthStyle: "neutral" },
  { id: "lime", fill: "#a3e635", outline: "#365314", accent: "#f7fee7", eyeStyle: "sparkle", mouthStyle: "smile" },
  { id: "copper", fill: "#d97706", outline: "#451a03", accent: "#fffbeb", eyeStyle: "round", mouthStyle: "smirk" },
  { id: "steel", fill: "#64748b", outline: "#0f172a", accent: "#f8fafc", eyeStyle: "sharp", mouthStyle: "neutral" },
];

export function pickPortraitVariant(seed) {
  return pickBySeed(PORTRAIT_VARIANTS, seed) || PORTRAIT_VARIANTS[0];
}
