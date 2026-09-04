export function findTextMatches(text, query, { caseSensitive = false } = {}) {
  const source = String(text || "");
  const needle = String(query || "");
  if (!needle) return [];
  const haystack = caseSensitive ? source : source.toLocaleLowerCase("vi");
  const normalizedNeedle = caseSensitive ? needle : needle.toLocaleLowerCase("vi");
  const matches = [];
  let cursor = 0;
  while (cursor <= haystack.length - normalizedNeedle.length) {
    const index = haystack.indexOf(normalizedNeedle, cursor);
    if (index < 0) break;
    matches.push({ start: index, end: index + needle.length });
    cursor = index + Math.max(1, normalizedNeedle.length);
  }
  return matches;
}
