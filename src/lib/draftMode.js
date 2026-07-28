// "Chế độ nháp": a per-device preference (like the AI provider/key settings)
// to disable autosave entirely — for a workflow where the app is used as a
// scratch pad (paste, translate, copy out) rather than a persistent editor.
const KEY = "draft_mode";

export function isDraftMode() {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function setDraftMode(value) {
  try {
    localStorage.setItem(KEY, value ? "true" : "false");
  } catch {
    // localStorage unavailable (e.g. private mode) — draft mode just won't persist.
  }
}
