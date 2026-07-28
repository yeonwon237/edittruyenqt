// Built-in ("tự thân") Chinese → Vietnamese draft translator.
// Runs entirely client-side against bundled dictionaries — zero network
// calls, zero DB reads/writes, zero AI cost. Produces a rough "QT thô" draft
// exactly like classic dictionary-based QT/Convert tools: greedy longest-
// match segmentation, glossary override first, then built-in phrase/particle
// dictionary, then per-character Hán-Việt reading as fallback.
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

const BUILTIN_MAX_LEN = Math.max(1, ...Object.keys(HANVIET_WORDS).map((k) => k.length));

/**
 * Translate Chinese source text into a rough Vietnamese draft.
 * @param {string} sourceText
 * @param {Array<{source_term:string, translation:string}>} glossaryTerms - project glossary, highest priority
 * @returns {{ text: string, coverage: number, unknownChars: Array<{ch:string,count:number}> }}
 */
export function translateHanViet(sourceText, glossaryTerms = []) {
  if (!sourceText) return { text: "", coverage: 1, unknownChars: [] };

  const glossaryMap = buildGlossaryMap(glossaryTerms);
  let maxGlossaryLen = 1;
  glossaryMap.forEach((_v, k) => {
    if (k.length > maxGlossaryLen) maxGlossaryLen = k.length;
  });
  const maxWordLen = Math.max(maxGlossaryLen, BUILTIN_MAX_LEN);

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

    // CJK character: greedy longest-match across glossary, then built-in phrases.
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
      if (Object.prototype.hasOwnProperty.call(HANVIET_WORDS, candidate)) {
        pushWord(HANVIET_WORDS[candidate]);
        cjkTotal += len;
        cjkMatched += len;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      cjkTotal += 1;
      const reading = HANVIET_CHARS[ch];
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
