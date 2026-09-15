// Tauri always injects window.__TAURI_INTERNALS__ regardless of the
// withGlobalTauri config option, so this is reliable without extra setup —
// unlike window.__TAURI__, which requires opting in.
export function isDesktopApp() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
