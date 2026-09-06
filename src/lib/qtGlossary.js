// Reserve approved phrases before dictionary segmentation can consume their prefix.
export function glossarySpans(text, terms) {
  const byFirst = new Map();
  for (const term of terms || []) {
    const source = String(term.source_term || '').trim();
    const translation = String(term.translation || '').trim();
    if (!source || !translation) continue;
    const list = byFirst.get(source[0]) || [];
    list.push({ source, translation });
    byFirst.set(source[0], list);
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.source.length - a.source.length);
  const spans = new Map();
  for (let at = 0; at < text.length;) {
    const match = byFirst.get(text[at])?.find(t => text.startsWith(t.source, at));
    if (match) { spans.set(at, match); at += match.source.length; }
    else at += 1;
  }
  return spans;
}
