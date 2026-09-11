// Bootstraps a draft Ma Trận Xưng Hô (contextual pronoun rules) by reading
// the first N chapters of a story — no pre-existing rules and no AI call
// required. This is the inverse problem of pronounInventory.js: that scanner
// can only find a speaker if the name is already known (from rules); here we
// don't have rules yet, so we mine candidate character names straight out of
// the prose, then reuse the same speaker/role-resolution building blocks the
// rest of the app already relies on (findSpeaker, resolveAddressRole).
import { ADDRESS_WORDS, findSpeaker } from './pronounInventory.js';
import { resolveAddressRole } from './qualityCheck.js';

const SPEECH_VERBS = 'nói|hỏi|đáp|bảo|gọi|thốt|quát|hét|cười|lẩm bẩm|thì thầm|lên tiếng|trả lời';
// 2-4 capitalized words — a plausible Vietnamese proper-name token. A
// single capitalized word is excluded: it's too easily a sentence-initial
// common word, and (worse) a truncated fragment of a longer name already in
// the list (e.g. "Trình" inside "Trình Nặc"), which would falsely satisfy
// findListenerAmong's substring check against the full name.
const NAME_TOKEN = "\\p{Lu}[\\p{L}'’-]*(?:[ \\t]+\\p{Lu}[\\p{L}'’-]*){1,3}";
const MIN_VERB_ADJACENT_HITS = 2;
const MIN_REPEAT_HITS = 3;
const MAX_CANDIDATE_NAMES = 40;
const MIN_RULE_SAMPLE = 2;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (value) => String(value || '').trim().toLocaleLowerCase('vi');
const VOCAB = [...ADDRESS_WORDS].sort((a, b) => b.length - a.length);

// Two independent, AI-free signals for "this capitalized token is a
// character name", unioned together:
//  1. Sits right next to a speech verb ("X nói:" / "…” X đáp") — precise,
//     but many chapters barely tag dialogue this way (prose-heavy novels
//     often introduce a line with a whole descriptive clause instead).
//  2. Repeats across the sample AND shows up at least once mid-sentence
//     (not just capitalized because it opens a paragraph/quote) — a
//     token that keeps recurring as, say, a subject mid-clause is very
//     likely a proper name; one that's only ever sentence-initial is more
//     likely an ordinary word that happened to start a line.
// Either signal alone misses real names the other catches, so both run and
// their results are merged.
function mineCandidateNames(chapters) {
  const beforeVerb = new RegExp(`(${NAME_TOKEN})\\s*(?:,)?\\s*(?:${SPEECH_VERBS})\\b`, 'gu');
  const afterQuote = new RegExp(`[”"]\\s*(${NAME_TOKEN})\\s*(?:${SPEECH_VERBS})\\b`, 'gu');
  const anyToken = new RegExp(NAME_TOKEN, 'gu');
  const excluded = new Set(ADDRESS_WORDS.map(normalize));
  const verbAdjacent = new Map();
  const repeated = new Map();

  const recordInto = (map, raw, extra) => {
    const name = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!name.includes(' ')) return;
    const key = normalize(name);
    if (excluded.has(key)) return;
    const entry = map.get(key) || { display: name, count: 0, mid: 0 };
    entry.count += 1;
    if (extra?.mid) entry.mid += 1;
    map.set(key, entry);
  };

  for (const chapter of chapters || []) {
    const text = String(chapter.edited || '');
    for (const match of text.matchAll(beforeVerb)) recordInto(verbAdjacent, match[1]);
    for (const match of text.matchAll(afterQuote)) recordInto(verbAdjacent, match[1]);
    for (const match of text.matchAll(anyToken)) {
      const before = text.slice(Math.max(0, match.index - 2), match.index);
      const mid = /[\p{Ll},][ \t]?$/u.test(before);
      recordInto(repeated, match[0], { mid });
    }
  }

  const combined = new Map();
  [...verbAdjacent.values()]
    .filter((entry) => entry.count >= MIN_VERB_ADJACENT_HITS)
    .forEach((entry) => combined.set(normalize(entry.display), entry));
  [...repeated.values()]
    .filter((entry) => entry.mid >= 1 && entry.count >= MIN_REPEAT_HITS)
    .forEach((entry) => {
      const key = normalize(entry.display);
      const existing = combined.get(key);
      if (!existing || entry.count > existing.count) combined.set(key, entry);
    });

  return [...combined.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CANDIDATE_NAMES)
    .map((entry) => entry.display);
}

// Among all known/candidate names (minus the speaker), is exactly one of
// them mentioned near this quote? If so, that's the listener — same
// "only trust an unambiguous match" rule pronounInventory.js's findListener
// already uses, just generalized to a flat name list instead of rules.
function findListenerAmong(text, quoteStart, quoteEnd, speaker, allNames) {
  const others = allNames.filter((name) => normalize(name) !== normalize(speaker));
  const nearby = text.slice(Math.max(0, quoteStart - 160), Math.min(text.length, quoteEnd + 160));
  const mentioned = others.filter((name) => nearby.includes(name));
  return mentioned.length === 1 ? mentioned[0] : '';
}

function findExplicitListener(text, quoteStart, speaker, allNames) {
  const lineStart = text.lastIndexOf('\n', quoteStart - 1) + 1;
  const before = text.slice(lineStart, quoteStart - 1);
  const others = allNames.filter((name) => normalize(name) !== normalize(speaker));
  const matches = others.filter((name) => new RegExp(
    `${escapeRegex(speaker)}[^“”"]{0,100}(?:nói|hỏi|đáp|bảo|gọi|thì thầm|trả lời)\\s+với\\s+${escapeRegex(name)}[^“”"]{0,30}:?\\s*$`,
    'iu'
  ).test(before));
  return matches.length === 1 ? matches[0] : '';
}

export function discoverPronounRules(chapters, { knownNames = [] } = {}) {
  const mined = mineCandidateNames(chapters);
  const candidateNames = [...new Set([
    ...knownNames.map((n) => String(n || '').trim()).filter(Boolean),
    ...mined,
  ])];

  const groups = new Map();
  let quoteCount = 0;
  let resolvedQuoteCount = 0;
  let resolvedPairCount = 0;
  const quoteRegex = /[“"]([^”"]+)[”"]/gu;

  for (const chapter of chapters || []) {
    const text = String(chapter.edited || '');
    let previousSpeaker = '';
    for (const quoteMatch of text.matchAll(quoteRegex)) {
      quoteCount++;
      const quoteText = quoteMatch[1];
      if (!quoteText.trim()) continue;
      const quoteStart = quoteMatch.index + 1;
      const quoteEnd = quoteStart + quoteText.length;
      const speaker = findSpeaker(text, quoteStart, quoteEnd, candidateNames);
      if (!speaker) continue;
      const explicitListener = findExplicitListener(text, quoteStart, speaker, candidateNames);
      // A directly observed previous speaker is strong conversational
      // evidence: the newly tagged speaker is normally replying to them.
      // It also survives scenes containing several other named characters,
      // where the old "only one nearby name" heuristic always gave up.
      const turnListener = previousSpeaker && normalize(previousSpeaker) !== normalize(speaker)
        ? previousSpeaker
        : '';
      const listener = explicitListener || turnListener || findListenerAmong(text, quoteStart, quoteEnd, speaker, candidateNames);
      resolvedQuoteCount++;
      if (listener) resolvedPairCount++;
      previousSpeaker = speaker;

      const key = `${speaker}${listener}`;
      const group = groups.get(key) || {
        speaker, listener, selfTerms: {}, targetTerms: {}, occurrences: [],
      };

      for (const term of VOCAB) {
        const regex = new RegExp(`(?:^|[^\\p{L}])(${escapeRegex(term)})(?=$|[^\\p{L}])`, 'giu');
        for (const wordMatch of quoteText.matchAll(regex)) {
          const found = wordMatch[1];
          const relativeStart = wordMatch.index + wordMatch[0].indexOf(found);
          const relativeEnd = relativeStart + found.length;
          const role = resolveAddressRole(quoteText, relativeStart, relativeEnd);
          if (role === 'unknown') continue;
          if (role === 'target' && !listener) continue;
          const bucket = role === 'self' ? group.selfTerms : group.targetTerms;
          bucket[term] = (bucket[term] || 0) + 1;
          if (group.occurrences.length < 20) {
            const start = quoteStart + relativeStart;
            group.occurrences.push({
              chapterId: chapter.id, chapterTitle: chapter.title, chapterOrder: chapter.chapter_order,
              line: text.slice(0, start).split('\n').length,
              start, end: start + found.length, value: found, role,
              context: quoteText.slice(Math.max(0, relativeStart - 45), relativeStart + found.length + 45),
            });
          }
        }
      }
      groups.set(key, group);
    }
  }

  const rules = [...groups.values()]
    .filter((group) => group.listener)
    .map((group) => {
      const selfEntries = Object.entries(group.selfTerms).sort((a, b) => b[1] - a[1]);
      const targetEntries = Object.entries(group.targetTerms).sort((a, b) => b[1] - a[1]);
      const selfTotal = selfEntries.reduce((sum, [, count]) => sum + count, 0);
      const targetTotal = targetEntries.reduce((sum, [, count]) => sum + count, 0);
      return {
        speaker: group.speaker,
        listener: group.listener,
        self_word: selfEntries[0]?.[0] || '',
        target_word: targetEntries[0]?.[0] || '',
        selfConfidence: selfTotal ? selfEntries[0][1] / selfTotal : 0,
        targetConfidence: targetTotal ? targetEntries[0][1] / targetTotal : 0,
        sampleCount: selfTotal + targetTotal,
        occurrences: group.occurrences,
      };
    })
    .filter((rule) => rule.sampleCount >= MIN_RULE_SAMPLE)
    .sort((a, b) => b.sampleCount - a.sampleCount);

  return {
    rules,
    chapterCount: (chapters || []).length,
    quoteCount,
    resolvedQuoteCount,
    resolvedPairCount,
    candidateNames,
  };
}
