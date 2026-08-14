const SAVE_PREFIX = "etq-roleplay-save:";
const ENDINGS_PREFIX = "etq-roleplay-endings:";

function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

export function saveProgress(packId, { sceneId, state }) {
  localStorage.setItem(`${SAVE_PREFIX}${packId}`, JSON.stringify({ sceneId, state, updatedAt: new Date().toISOString() }));
}

export function loadProgress(packId) {
  return readJson(`${SAVE_PREFIX}${packId}`, null);
}

export function clearProgress(packId) {
  localStorage.removeItem(`${SAVE_PREFIX}${packId}`);
}

export function recordEnding(packId, ending) {
  if (!ending?.id) return;
  const key = `${ENDINGS_PREFIX}${packId}`;
  const existing = readJson(key, []);
  if (existing.some((row) => row.endingId === ending.id)) return;
  existing.push({ endingId: ending.id, endingType: ending.type, reachedAt: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(existing));
}

export function listEndings(packId) {
  return readJson(`${ENDINGS_PREFIX}${packId}`, []);
}
