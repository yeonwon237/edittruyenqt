// Picks the Cloud (Supabase, src/api/entities.js) or Local (SQLite,
// src/api/localEntities.js) implementation for the 4 core-editing entities,
// so the rest of the app can import Project/Chapter/GlossaryTerm/PromptPreset
// from here instead of entities.js directly and not care which backend is
// active. Local mode is desktop-only and opt-in (see getDataMode below) —
// web and a freshly-installed desktop app both default to Cloud, so nothing
// about existing behavior changes unless the user explicitly switches.
//
// No sync between the two yet (later phase, not built) — switching modes
// does NOT move data across; it's two independent stores for now, exactly
// as scoped for this phase of the desktop build.
import { isDesktopApp } from "@/lib/platform";
import { Project as CloudProject, Chapter as CloudChapter, GlossaryTerm as CloudGlossaryTerm, PromptPreset as CloudPromptPreset } from "@/api/entities";
import { LocalProject, LocalChapter, LocalGlossaryTerm, LocalPromptPreset } from "@/api/localEntities";

const DATA_MODE_KEY = "etq_data_mode";

export function getDataMode() {
  if (!isDesktopApp()) return "cloud";
  try {
    const saved = localStorage.getItem(DATA_MODE_KEY);
    return saved === "local" ? "local" : "cloud";
  } catch {
    return "cloud";
  }
}

export function setDataMode(mode) {
  try {
    localStorage.setItem(DATA_MODE_KEY, mode === "local" ? "local" : "cloud");
  } catch {
    // localStorage unavailable — mode just won't persist across reloads
  }
}

// A proxy that re-reads getDataMode() on every call (not just once at import
// time), so a mode switch takes effect immediately without a reload.
function pickEntity(cloudEntity, localEntity) {
  return new Proxy(
    {},
    {
      get(_target, method) {
        return (...args) => (getDataMode() === "local" ? localEntity : cloudEntity)[method](...args);
      },
    }
  );
}

export const Project = pickEntity(CloudProject, LocalProject);
export const Chapter = pickEntity(CloudChapter, LocalChapter);
export const GlossaryTerm = pickEntity(CloudGlossaryTerm, LocalGlossaryTerm);
export const PromptPreset = pickEntity(CloudPromptPreset, LocalPromptPreset);
