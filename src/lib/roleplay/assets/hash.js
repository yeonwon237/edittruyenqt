// Deterministic string hash (FNV-1a) so the same seed always maps to the
// same asset variant, but different seeds spread out across the pool.
export function hashSeed(seed) {
  let hash = 0x811c9dc5;
  const text = String(seed || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function pickBySeed(list, seed) {
  if (!list.length) return null;
  return list[hashSeed(seed) % list.length];
}
