// Accent-color theme picker. The actual color values live in src/index.css
// as `[data-theme="..."]` CSS variable overrides, and tailwind.config.js
// points the whole `violet-*` Tailwind palette at those variables — so
// switching a theme here recolors every component in the app without
// touching component code. Pure client-side preference (like draftMode.js),
// not synced to Base44 — there's nothing to keep consistent across devices.
const STORAGE_KEY = "edittruyenqt_theme";

export const THEMES = [
  { id: "violet", label: "Tím (mặc định)", swatch: "#7c3aed" },
  { id: "pink", label: "Hồng", swatch: "#db2777" },
  { id: "blue", label: "Xanh dương", swatch: "#2563eb" },
  { id: "emerald", label: "Ngọc lục bảo", swatch: "#059669" },
];

export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === saved) ? saved : "violet";
}

export function applyTheme(id) {
  if (id === "violet") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
}

export function setTheme(id) {
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}

// Call once as early as possible (before first paint) so the page never
// flashes the default violet theme before switching to a saved choice.
export function initTheme() {
  applyTheme(getTheme());
}
