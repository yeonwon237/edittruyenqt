// Light/Dark mode for the whole app (web AND desktop) — a separate axis
// from the 7 accent colors in theme.js (accent only recolors buttons/
// highlights; this switches the whole page's background/card/text tokens
// via the shared `.dark` CSS variable block in index.css). Toggling this
// sets/removes a "dark" class on <html>, which every `dark:` utility
// throughout the app (including the desktop-only components under
// src/components/desktop/) reads off as its ancestor.
import { isDesktopApp } from "@/lib/platform";

const STORAGE_KEY = "edittruyenqt_color_mode";

export function getColorMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  // No saved preference yet: desktop's original design was permanently
  // dark ("VSCode-style"), so a fresh install still opens dark by default —
  // it's just freely switchable now instead of being locked. Web still
  // defaults light as before.
  return isDesktopApp() ? "dark" : "light";
}

export function applyColorMode(mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function setColorMode(mode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyColorMode(mode);
}

// Call once as early as possible (before first paint) so the page never
// flashes light before switching to a saved dark preference.
export function initColorMode() {
  applyColorMode(getColorMode());
}
