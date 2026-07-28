// Built-in ("tự thân") Chinese → Vietnamese draft translator.
// Runs entirely client-side — zero AI cost, zero DB reads/writes. Produces
// a rough "QT thô" draft exactly like classic dictionary-based QT/Convert
// tools: greedy longest-match segmentation, glossary override first, then
// dictionary phrase/particle lookup, then per-character Hán-Việt reading.
//
// Two dictionary layers:
// - Hand-curated overrides in ./hanvietData.js (pronouns, grammar particles,
//   "false friend" compounds) — always wins on key collision.
// - A large community-built Chinese→Vietnamese phrase dataset (VietPhrase,
//   used for years by the Vietnamese fan-translation "QT/convert" scene),
//   filtered down to 1-3 character entries and bundled as separate JSON
//   chunks. Loaded lazily on first use (dynamic import) so it never slows
//   down normal app loading — only paid for by someone who actually clicks
//   "Tự dịch".
import { HANVIET_CHARS, HANVIET_WORDS, PUNCT_MAP } from "./hanvietData";

function isCjk(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\r";
}

function buildGlossaryMap(glossaryTerms) {
  const map = new Map();
  (glossaryTerms || []).forEach((t) => {
    const src = (t.source_term || "").trim();
    const trans = (t.translation || "").trim();
    if (src && trans) map.set(src, trans);
  });
  return map;
}

let dictPromise = null;

// Merge the big imported dataset with the hand-curated overrides (curated
// wins) once, then cache the result for the rest of the session.
function loadDictionary() {
  if (!dictPromise) {
    dictPromise = Promise.all([
      import("../data/vietphrase-chars.json"),
      import("../data/vietphrase-words.json"),
    ]).then(([charsMod, wordsMod]) => {
      const chars = { ...charsMod.default, ...HANVIET_CHARS };
      const words = { ...wordsMod.default, ...HANVIET_WORDS };
      let maxWordLen = 1;
      // eslint-disable-next-line no-restricted-syntax
      for (const k in words) {
        if (k.length > maxWordLen) maxWordLen = k.length;
      }
      return { chars, words, maxWordLen };
    });
  }
  return dictPromise;
}

// --- "Modifier 的 noun" clause reorder (Nhóm 4: đảo cú pháp ngược) ---
// Chinese puts the modifier before 的 and the noun after it (定语的中心语);
// Vietnamese puts the noun first ("Giang Nam mưa bụi như rượu", not "mưa bụi
// như rượu đích Giang Nam"). A full syntactic reorder needs real parsing,
// which this dictionary-substitution engine doesn't do, so this only handles
// the narrow, low-risk case where an ENTIRE clause (the text between two
// punctuation marks, or start/end of text) is exactly "[modifier]的[noun]"
// with nothing else in it — nothing else in the clause can get dragged along
// by mistake. Anything less certain (multiple 的 in one clause, no clean
// clause boundary, or text after 的 that looks like it continues into a verb
// rather than staying a noun) is left in the original Chinese order.
const CLAUSE_BOUNDARY_CHARS = new Set([
  ...Object.keys(PUNCT_MAP),
  "\n", ",", ".", "!", "?", ";", ":",
]);

// If the span right after 的 contains one of these characters, it's very
// likely "noun + verb/predicate..." rather than a pure noun phrase — either
// a common verb (e.g. 桌上的书走了 = "the book on the table left", where
// treating the whole "书走了" as the noun would be wrong) or a function word
// that typically starts a new predicate right after its subject (是/有/让/
// 使/被/把/将...), e.g. 波谲云诡的局势让人不安 = "the ever-shifting situation
// makes people uneasy" — "局势让人不安" is subject+predicate, not a noun
// phrase, even though it has no comma before 让. Bail in either case rather
// than risk a garbled sentence.
const REORDER_VERB_GUARD = new Set([
  // Common verbs (mirrors the "Verbs" section of HANVIET_CHARS).
  "看", "听", "走", "跑", "坐", "站", "躺", "笑", "哭", "打", "杀", "死", "生",
  "活", "来", "去", "进", "出", "开", "关", "拿", "放", "给", "取", "问", "答",
  "想", "知", "道", "记", "忘", "喜", "欢", "爱", "恨", "怕", "惊", "修", "炼",
  "到", "动", "说", "认", "识", "明", "觉", "希", "望", "决", "定", "始",
  "继", "续", "停", "止", "结", "束",
  // Copula / causative / passive / modal markers that typically open a new
  // predicate right after the subject (mirrors HANVIET_WORDS' copula,
  // negation, adverb and modal sections).
  "是", "有", "没", "别", "让", "使", "令", "叫", "被", "把", "将",
  "也", "都", "很", "太", "更", "最", "还", "又", "再", "就", "才", "只",
  "在", "和", "跟", "与", "能", "会", "要", "应", "该", "需", "须", "可",
]);

const MAX_MODIFIER_LEN = 16;
const MAX_NOUN_LEN = 6;

function reorderOneClause(clause) {
  const deIndex = clause.indexOf("的");
  // No 的, or nothing before/after it to work with.
  if (deIndex <= 0 || deIndex >= clause.length - 1) return clause;

  const modifier = clause.slice(0, deIndex);
  const noun = clause.slice(deIndex + 1);

  // Another 的 on either side means an ambiguous/nested construction — skip.
  if (modifier.includes("的") || noun.includes("的")) return clause;
  if (modifier.length > MAX_MODIFIER_LEN || noun.length > MAX_NOUN_LEN) return clause;
  for (const ch of noun) {
    if (REORDER_VERB_GUARD.has(ch)) return clause;
  }

  return noun + modifier;
}

function reorderModifierClauses(sourceText) {
  let out = "";
  let clauseStart = 0;
  const n = sourceText.length;
  for (let i = 0; i < n; i += 1) {
    if (CLAUSE_BOUNDARY_CHARS.has(sourceText[i])) {
      out += reorderOneClause(sourceText.slice(clauseStart, i)) + sourceText[i];
      clauseStart = i + 1;
    }
  }
  out += reorderOneClause(sourceText.slice(clauseStart));
  return out;
}

/**
 * Translate Chinese source text into a rough Vietnamese draft.
 * @param {string} sourceText
 * @param {Array<{source_term:string, translation:string}>} glossaryTerms - project glossary, highest priority
 * @returns {Promise<{ text: string, coverage: number, unknownChars: Array<{ch:string,count:number}> }>}
 */
export async function translateHanViet(sourceText, glossaryTerms = []) {
  if (!sourceText) return { text: "", coverage: 1, unknownChars: [] };

  sourceText = reorderModifierClauses(sourceText);

  const { chars: CHARS, words: WORDS, maxWordLen: builtinMaxLen } = await loadDictionary();

  const glossaryMap = buildGlossaryMap(glossaryTerms);
  let maxGlossaryLen = 1;
  glossaryMap.forEach((_v, k) => {
    if (k.length > maxGlossaryLen) maxGlossaryLen = k.length;
  });
  const maxWordLen = Math.max(maxGlossaryLen, builtinMaxLen);

  const out = [];
  let lastWasWord = false;
  let cjkTotal = 0;
  let cjkMatched = 0;
  const unknown = new Map();

  const pushWord = (w) => {
    if (!w) return;
    out.push((lastWasWord ? " " : "") + w);
    lastWasWord = true;
  };
  const pushRaw = (s) => {
    out.push(s);
    lastWasWord = false;
  };

  const n = sourceText.length;
  let i = 0;
  while (i < n) {
    const ch = sourceText[i];

    if (ch === "\n") {
      out.push("\n");
      lastWasWord = false;
      i += 1;
      continue;
    }
    if (isSpace(ch)) {
      i += 1;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(PUNCT_MAP, ch)) {
      pushRaw(PUNCT_MAP[ch]);
      i += 1;
      continue;
    }
    if (!isCjk(ch)) {
      // Latin letters/digits/other punctuation: pass a contiguous run through untouched.
      let j = i;
      while (
        j < n &&
        !isCjk(sourceText[j]) &&
        !isSpace(sourceText[j]) &&
        sourceText[j] !== "\n" &&
        !Object.prototype.hasOwnProperty.call(PUNCT_MAP, sourceText[j])
      ) {
        j += 1;
      }
      pushWord(sourceText.slice(i, j));
      i = j;
      continue;
    }

    // CJK character: greedy longest-match across glossary, then dictionary phrases.
    // cjkTotal/cjkMatched are incremented by the same amount at every exit
    // point (`len` characters for a phrase match, 1 for a single char) so
    // `coverage` always stays within [0, 1] regardless of match length.
    const maxLen = Math.min(maxWordLen, n - i);
    let matched = false;
    for (let len = maxLen; len >= 1; len -= 1) {
      const candidate = sourceText.slice(i, i + len);
      if (glossaryMap.has(candidate)) {
        pushWord(glossaryMap.get(candidate));
        cjkTotal += len;
        cjkMatched += len;
        i += len;
        matched = true;
        break;
      }
      if (Object.prototype.hasOwnProperty.call(WORDS, candidate)) {
        pushWord(WORDS[candidate]);
        cjkTotal += len;
        cjkMatched += len;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      cjkTotal += 1;
      const reading = CHARS[ch];
      if (reading) {
        pushWord(reading);
        cjkMatched += 1;
      } else {
        // Unknown character: keep the original so it's easy to spot & fix by hand or AI.
        pushWord(ch);
        unknown.set(ch, (unknown.get(ch) || 0) + 1);
      }
      i += 1;
    }
  }

  const coverage = cjkTotal > 0 ? cjkMatched / cjkTotal : 1;
  const unknownChars = [...unknown.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ch, count]) => ({ ch, count }));

  return { text: out.join(""), coverage, unknownChars };
}

// Only Chinese source is well suited to dictionary-based draft translation —
// Sino-Vietnamese vocabulary comes directly from Hán-Việt readings. Other
// source languages fall back to the AI translate step (see llm.js).
export function supportsSelfTranslate(sourceLanguage) {
  return sourceLanguage === "Trung";
}
