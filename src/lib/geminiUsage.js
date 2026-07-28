// Client-side "how many calls today" counter per Gemini model — pure UI
// convenience for gauging your own free-tier quota, NOT an authoritative
// count (Google's real usage may differ, e.g. calls from another device/
// browser aren't seen here). Stored in localStorage, resets when the
// stored date no longer matches today.
const STORAGE_KEY = "gemini_usage_v1";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && raw.date === todayStr()) return raw;
  } catch {
    // fall through to a fresh day below
  }
  return { date: todayStr(), counts: {} };
}

export function recordGeminiCall(modelId) {
  if (!modelId) return;
  const data = load();
  data.counts[modelId] = (data.counts[modelId] || 0) + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable/full — usage tracking is best-effort only
  }
}

export function getGeminiUsageToday(modelId) {
  return load().counts[modelId] || 0;
}
