const SPEECH_VERBS = 'nói|hỏi|đáp|bảo|gọi|thốt|quát|hét|cười|lẩm bẩm|thì thầm|lên tiếng|trả lời';
export const ADDRESS_WORDS = [
  'bổn tọa','bản tọa','bổn vương','bản vương','ái khanh','các ngươi','nô tỳ','nô gia','hạ quan','công tử','cô nương','tiểu thư','thiếu gia',
  'ta','tôi','mình','chúng ta','chúng tôi','ngươi','ngài','nàng','chàng','hắn','y','huynh','muội','tỷ','đệ','ca','khanh','thiếp',
  'anh','em','chị','cậu','tớ','bạn','ông','bà','con','cháu','cha','mẹ','sư phụ','đồ nhi'
];

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = value => String(value || '').trim().toLocaleLowerCase('vi');

export function findSpeaker(text, quoteStart, quoteEnd, names) {
  const from = Math.max(0, quoteStart - 140), to = Math.min(text.length, quoteEnd + 140);
  const nearby = text.slice(from, to);
  let best = null;
  for (const name of names) {
    const escaped = escapeRegex(name);
    const patterns = [
      new RegExp(`${escaped}[^“”"]{0,70}(?:${SPEECH_VERBS})[^“”"]{0,25}[“"]`, 'giu'),
      new RegExp(`[”"][^“”"]{0,35}${escaped}[^“”"]{0,35}(?:${SPEECH_VERBS})`, 'giu'),
    ];
    for (const pattern of patterns) for (const match of nearby.matchAll(pattern)) {
      const absolute = from + match.index;
      const distance = Math.min(Math.abs(quoteStart - (absolute + match[0].length)), Math.abs(absolute - quoteEnd));
      if (!best || distance < best.distance) best = { name, distance };
    }
  }
  return best?.name || '';
}

function findListener(text, quoteStart, quoteEnd, speaker, rules) {
  if (!speaker) return '';
  const candidates = [...new Set(rules.filter(rule => normalize(rule.speaker) === normalize(speaker)).map(rule => rule.listener?.trim()).filter(name => name && name !== '*'))];
  const nearby = text.slice(Math.max(0, quoteStart - 160), Math.min(text.length, quoteEnd + 160));
  const mentioned = candidates.filter(name => nearby.includes(name));
  if (mentioned.length === 1) return mentioned[0];
  return candidates.length === 1 ? candidates[0] : '';
}

export function scanPronounInventory(chapters, rules = []) {
  const validRules = rules.filter(rule => rule?.speaker?.trim() && rule?.self_word?.trim() && rule?.target_word?.trim());
  const names = [...new Set(validRules.flatMap(rule => [rule.speaker?.trim(), rule.listener?.trim()]).filter(name => name && name !== '*'))];
  const vocabularyMap = new Map();
  [...ADDRESS_WORDS, ...validRules.flatMap(rule => [rule.self_word, rule.target_word])].filter(Boolean).forEach(value => {
    const cleaned = value.trim(), key = normalize(cleaned);
    if (!vocabularyMap.has(key)) vocabularyMap.set(key, cleaned);
  });
  const vocabulary = [...vocabularyMap.values()].sort((a, b) => b.length - a.length);
  const groups = new Map();
  let quoteCount = 0, unresolvedQuotes = 0;
  for (const chapter of chapters || []) {
    const text = String(chapter.edited || '');
    const quoteRegex = /[“"]([^”"]+)[”"]/gu;
    for (const quoteMatch of text.matchAll(quoteRegex)) {
      quoteCount++;
      const quoteText = quoteMatch[1], quoteStart = quoteMatch.index + 1, quoteEnd = quoteStart + quoteText.length;
      const speaker = findSpeaker(text, quoteStart, quoteEnd, names);
      const listener = findListener(text, quoteStart, quoteEnd, speaker, validRules);
      if (!speaker) unresolvedQuotes++;
      const key = `${speaker || '?'}\u0001${listener || '?'}`;
      const group = groups.get(key) || { key, speaker: speaker || '', listener: listener || '', terms: {}, occurrences: [], quoteCount: 0 };
      group.quoteCount++;
      for (const term of vocabulary) {
        const regex = new RegExp(`(?:^|[^\\p{L}])(${escapeRegex(term)})(?=$|[^\\p{L}])`, 'giu');
        for (const match of quoteText.matchAll(regex)) {
          const found = match[1], relativeStart = match.index + match[0].indexOf(found), start = quoteStart + relativeStart;
          const canonical = vocabulary.find(value => normalize(value) === normalize(found)) || found;
          group.terms[canonical] = (group.terms[canonical] || 0) + 1;
          if (group.occurrences.length < 100) group.occurrences.push({ chapterId: chapter.id, chapterTitle: chapter.title, chapterOrder: chapter.chapter_order, line: text.slice(0, start).split('\n').length, start, end: start + found.length, value: found, context: quoteText.slice(Math.max(0, relativeStart - 45), relativeStart + found.length + 45) });
        }
      }
      groups.set(key, group);
    }
  }
  const output = [...groups.values()].map(group => {
    const rule = validRules.find(item => normalize(item.speaker) === normalize(group.speaker) && normalize(item.listener) === normalize(group.listener));
    const allowed = new Set(rule ? [normalize(rule.self_word), normalize(rule.target_word)] : []);
    const unexpected = Object.entries(group.terms).filter(([term]) => rule && !allowed.has(normalize(term))).reduce((sum, [, count]) => sum + count, 0);
    return { ...group, rule: rule || null, unexpected };
  }).filter(group => Object.keys(group.terms).length).sort((a, b) => b.unexpected - a.unexpected || Object.values(b.terms).reduce((x,y)=>x+y,0) - Object.values(a.terms).reduce((x,y)=>x+y,0));
  return { groups: output, quoteCount, unresolvedQuotes, chapterCount: chapters.length };
}
