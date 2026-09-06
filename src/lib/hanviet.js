// Built-in ("tự thân") Chinese → Vietnamese draft translator.
// Runs entirely client-side — zero AI cost, zero DB reads/writes. Produces
// a rough "QT thô" draft exactly like classic dictionary-based QT/Convert
// tools: greedy longest-match segmentation, glossary override first, then
// dictionary phrase/particle lookup, then per-character Hán-Việt reading.
//
// Four dictionary layers, in priority order (first match wins):
// 1. Hand-curated overrides in ./hanvietData.js (pronouns, grammar particles,
//    "false friend" compounds) — always wins on key collision.
// 2. A large community-built Chinese→Vietnamese phrase dataset (VietPhrase,
//    used for years by the Vietnamese fan-translation "QT/convert" scene),
//    filtered down to 1-3 character entries and bundled as separate JSON
//    chunks.
// 3. `../data/cvdict-extra.json` — words/phrases (2-4 char) found in CVDICT
//    (https://github.com/ph0ngp/CVDICT, CC BY-SA 4.0, a Vietnamese-translated
//    port of CC-CEDICT) that VietPhrase has no entry for at all. Only ever
//    fills gaps — never overrides an existing VietPhrase/curated entry — so
//    it can't make an already-working translation worse, only turn some
//    "unknown character" fallbacks into a real word.
// 4. `../data/hanviet-chars-extra.json` — ~1190 extra single-character
//    Hán-Việt readings for characters missing from layers 1-2, sourced from
//    hanviet-pinyin-words/hanviet-pinyin-wordlist
//    (https://github.com/ph0ngp/hanviet-pinyin-words, MIT) — see the
//    "traditional vs simplified" note below layers 4/5 share. Only
//    characters with exactly one distinct reading across every pinyin that
//    dictionary lists for them are included — a polyphonic character with
//    genuinely different readings per pronunciation is skipped rather than
//    guessed, since this app has no pinyin input to disambiguate with
//    (falls back to "unknown char", same as before, rather than risk a
//    wrong reading in ordinary prose).
// All four layers are bundled as separate JSON/JS modules, loaded lazily on
// first use (dynamic import) so none of this slows down normal app loading —
// only paid for by someone who actually clicks "Tự dịch".
//
// On top of the four dictionary layers, a personal-name heuristic (see
// tryReadNameSpan below) catches Chinese personal names that have no
// Glossary entry yet: a known surname character followed by 1-2 more
// characters gets rendered as a capitalized Hán-Việt name ("Lục Vị Hi")
// instead of being read as ordinary dictionary words — it only fires where
// the dictionary genuinely has no better answer, so it never overrides a
// Glossary entry or an already-correct dictionary match. It reads each
// syllable from a 5th layer, `../data/hanviet-formal-readings.json` (~10k
// entries, same hanviet-pinyin-words/-wordlist source as layer 4, falling
// back to the regular `chars` table for anything missing from it) rather
// than the general single-char fallback table above, because the two want
// different things from the same character: layers 1-4 deliberately favor
// whichever reading is most useful in *ordinary prose* (e.g. 未 → "không",
// its practical/grammatical sense — "not yet"), while a name wants the
// *formal Sino-Vietnamese sound reading* regardless of meaning (未 → "vị"),
// since that's the actual convention for rendering a Chinese name in
// Vietnamese. Reusing the prose-tuned table here was tried first and got
// real names wrong (e.g. 陆未晞 → "Lục Không Hi" instead of "Lục Vị Hi") —
// this dedicated table is why it's now "Lục Vị Hi".
//
// Traditional vs simplified, for layers 4 and 5: hanviet-pinyin-words/
// -wordlist's own data only covers traditional-character forms (its README
// says so explicitly), but this app's source text is simplified Chinese.
// Both JSON files here are pre-converted to simplified keys at build time
// (see the generating script's use of a simplified→traditional map derived
// from CVDICT's own trad/simp column pair) — anyone regenerating either
// file must redo that conversion, not import the upstream data as-is, or
// every surname/character that differs between the two scripts (张/張,
// 陆/陸, 谢/謝, 苏/蘇...) will silently fail to match.
import { HANVIET_CHARS, HANVIET_WORDS, PUNCT_MAP } from "./hanvietData";
import { glossarySpans } from "./qtGlossary.js";

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
      import("../data/cvdict-extra.json"),
      import("../data/hanviet-chars-extra.json"),
      import("../data/hanviet-formal-readings.json"),
    ]).then(([charsMod, wordsMod, cvdictExtraMod, charsExtraMod, formalMod]) => {
      const chars = { ...charsExtraMod.default, ...charsMod.default, ...HANVIET_CHARS };
      const words = { ...cvdictExtraMod.default, ...wordsMod.default, ...HANVIET_WORDS };
      let maxWordLen = 1;
      // eslint-disable-next-line no-restricted-syntax
      for (const k in words) {
        if (k.length > maxWordLen) maxWordLen = k.length;
      }
      return { chars, words, maxWordLen, formalChars: formalMod.default };
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

// Kept short and symmetric with MAX_NOUN_LEN on purpose: a real "modifier的
// noun" clause tends to have a short modifier (an adjective, a short
// descriptive phrase, a name/pronoun). A long modifier candidate is a signal
// that what's actually before 的 is "[verb phrase][true short modifier]",
// e.g. "还伸手回抱住丁其羽的腰" ("[still reached out and hugged] [Ding Qiyu]的
// [waist]") — the real modifier is just "丁其羽", not the whole "还伸手回抱住
// 丁其羽". A wide cap here previously reordered whole verb phrases like that
// by mistake (confirmed against a real chapter), so keep this tight.
const MAX_MODIFIER_LEN = 6;
const MAX_NOUN_LEN = 6;

// --- Sentence capitalization ---
// The dictionary/reading tables are all lowercase (that's the normal way to
// write a Vietnamese entry), so raw output never capitalizes anything except
// glossary terms that already come pre-capitalized (character names...).
// This pass capitalizes the first letter after start-of-text, a newline, a
// run of sentence-ending punctuation (.!?…), or a colon introducing a quote
// — covers normal sentences and "X nói:"Lời thoại..."" dialogue openings.
const VN_LOWER = "a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const SENTENCE_START_RE = new RegExp(`(^|\\n|[.!?…]+|:)([\\s"'“”‘’»]*)([${VN_LOWER}])`, "gu");

function capitalizeSentences(text) {
  return text.replace(SENTENCE_START_RE, (_m, sep, spacing, letter) => sep + spacing + letter.toUpperCase());
}

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

// --- Personal-name heuristic (surname + 1-2 following characters) ---
// Chinese personal names are conventionally rendered in Vietnamese as the
// capitalized Hán-Việt reading of each character ("Lục Vị Hi", not "lục
// không hi") — see the "Common Chinese surnames" note in hanvietData.js.
// The normal greedy dictionary match has no concept of "this might be a
// name", though: it happily lets an ordinary WORDS-level entry (a grammar/
// function word) swallow a character that's actually sitting inside an
// unrecognized name. Real example that motivated this (a chapter with no
// Glossary entries yet): 陆未晞 used to come out "lục không hi", because 未
// independently matches WORDS as a negation word ("không") even though
// here it's the 2nd syllable of a 3-syllable name, not doing negation duty.
//
// This only ever fires as a *last resort*, gated so it can't touch anything
// the dictionary already handles correctly:
// - SURNAME_CHARS is checked only once the normal WORDS/glossary scan has
//   already failed to match anything of length >= 2 starting at that exact
//   position — so a real recognized word/phrase that happens to start with
//   a surname character (e.g. "陆地" = "lục địa", a real WORDS entry) is
//   matched by the normal greedy path first and this heuristic is never
//   even consulted for it.
// - Once triggered, it claims the next 1-2 characters *only* as long as
//   they likewise have no length>=2 WORDS/glossary match starting there, AND
//   no length==1 WORDS entry of their own either (unlike the surname
//   character itself, checked below) — a given-name character is almost
//   always a content/poetic word with no standalone dictionary entry, so a
//   character that DOES have one (是, 的, 了, 在...) is almost certainly a
//   real function/content word starting a new clause, not a continuation of
//   the name, and is left for the next loop iteration instead. This was
//   found live: without it, "龙是中国文化" (dragon is Chinese culture) — 龙
//   being a rare-but-real surname with no length>=2 match right after it —
//   grouped "是" into a fake 2-syllable name "Long Là" instead of leaving
//   the copula alone.
// - A single surname character with nothing plausible after it (already
//   has, or leads into, real dictionary coverage) is left completely alone
//   — this never overrides the Glossary, and never touches a name that
//   already has a Glossary entry (a Glossary hit is itself a length>=2
//   match, so the gate above blocks this heuristic from ever running on it).
// Best-effort by nature: this is a heuristic over a fixed surname list, not
// real named-entity recognition — it will still miss names that don't start
// with a listed surname character, and (rarely) may mis-group ordinary text
// that happens to look like [surname char][1-2 more untranslated chars]
// with nothing else nearby. Adding the name to the project's Glossary is
// still the reliable fix — this only helps *before* that's been done.
const SURNAME_CHARS = new Set([
  "丁", "羽", "莲", "陈", "李", "张", "刘", "杨", "赵", "周", "吴", "徐", "马",
  "朱", "胡", "郑", "谢", "何", "苏", "韩", "陆", "郭", "孙", "黄", "林", "梁",
  "宋", "唐", "冯", "邓", "许", "傅", "沈", "曾", "彭", "吕", "卢", "蒋", "蔡",
  "贾", "魏", "薛", "叶", "阎", "余", "潘", "杜", "戴", "邹", "郝", "孔", "崔",
  "康", "邱", "秦", "顾", "侯", "邵", "孟", "段", "尹", "黎", "乔", "贺", "赖",
  "龚", "萧", "梅", "牛", "董", "任", "姜", "范", "方", "姚", "谭", "廖", "熊",
  "汪", "田", "史", "龙", "江", "石", "万", "文", "高", "武", "常", "东", "钱",
  "汤", "白", "金",
]);
const MAX_NAME_SPAN = 3; // surname + up to 2 given-name characters

function hasWordMatchAt(sourceText, pos, glossaryMap, WORDS, maxWordLen) {
  const maxLen = Math.min(maxWordLen, sourceText.length - pos);
  for (let len = maxLen; len >= 2; len -= 1) {
    const candidate = sourceText.slice(pos, pos + len);
    if (glossaryMap.has(candidate)) return true;
    if (Object.prototype.hasOwnProperty.call(WORDS, candidate)) return true;
  }
  return false;
}

function tryReadNameSpan(sourceText, pos, CHARS, FORMAL_CHARS, glossaryMap, WORDS, maxWordLen) {
  const ch = sourceText[pos];
  if (!SURNAME_CHARS.has(ch)) return null;
  const surnameReading = FORMAL_CHARS[ch] || CHARS[ch];
  if (!surnameReading) return null;
  if (hasWordMatchAt(sourceText, pos, glossaryMap, WORDS, maxWordLen)) return null;

  const syllables = [surnameReading];
  const n = sourceText.length;
  let i = pos + 1;
  while (syllables.length < MAX_NAME_SPAN && i < n && isCjk(sourceText[i])) {
    const nextCh = sourceText[i];
    if (hasWordMatchAt(sourceText, i, glossaryMap, WORDS, maxWordLen)) break;
    if (glossaryMap.has(nextCh) || Object.prototype.hasOwnProperty.call(WORDS, nextCh)) break;
    const reading = FORMAL_CHARS[nextCh] || CHARS[nextCh];
    if (!reading) break;
    syllables.push(reading);
    i += 1;
  }
  if (syllables.length < 2) return null; // a lone surname char isn't worth a special case

  const text = syllables.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  return { text, consumed: i - pos };
}

/**
 * Translate Chinese source text into a rough Vietnamese draft.
 * @param {string} sourceText
 * @param {Array<{source_term:string, translation:string}>} glossaryTerms - project glossary, highest priority
 * @returns {Promise<{ text: string, coverage: number, unknownChars: Array<{ch:string,count:number}>, diagnostics: {glossaryChars:number,phraseChars:number,fallbackChars:number,guessedNameChars:number,fallbackSpans:Array<{source:string,start:number,end:number,kind:string}>} }>}
 */
export async function translateHanViet(sourceText, glossaryTerms = []) {
  if (!sourceText) return { text: "", coverage: 1, unknownChars: [] };

  // Never reorder characters inside approved names/phrases. Reorder only the
  // gaps between them, so grammar heuristics cannot destroy glossary matches.
  // Single-character address defaults must not split plural words (我/我们)
  // or compounds. They still override equal dictionary keys in glossaryMap.
  const strictTerms = glossaryTerms.filter(t => !(t.category === "Xưng hô" && t.source_term?.trim().length === 1));
  const originalLocks = glossarySpans(sourceText, strictTerms);
  let reordered = "";
  let cursor = 0;
  for (const [at, term] of originalLocks) {
    reordered += reorderModifierClauses(sourceText.slice(cursor, at)) + term.source;
    cursor = at + term.source.length;
  }
  sourceText = reordered + reorderModifierClauses(sourceText.slice(cursor));

  const { chars: CHARS, words: WORDS, maxWordLen: builtinMaxLen, formalChars: FORMAL_CHARS } = await loadDictionary();

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
  const locks = glossarySpans(sourceText, strictTerms);
  const lockStarts = [...locks.keys()];
  let lockIndex = 0;
  const diagnostics = { glossaryChars: 0, phraseChars: 0, fallbackChars: 0, guessedNameChars: 0, fallbackSpans: [] };
  const recordFallback = (start, length, kind = "fallback") => {
    const previous = diagnostics.fallbackSpans.at(-1);
    if (previous && previous.kind === kind && previous.end === start && previous.source.length + length <= 8) {
      previous.source += sourceText.slice(start, start + length);
      previous.end += length;
    } else diagnostics.fallbackSpans.push({ source: sourceText.slice(start, start + length), start, end: start + length, kind });
  };

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
    while (lockIndex < lockStarts.length && lockStarts[lockIndex] < i) lockIndex += 1;
    const locked = locks.get(i);
    if (locked) {
      pushWord(locked.translation);
      const hanCount = [...locked.source].filter(isCjk).length;
      cjkTotal += hanCount;
      cjkMatched += hanCount;
      diagnostics.glossaryChars += hanCount;
      i += locked.source.length;
      continue;
    }
    const nextLock = lockStarts[lockIndex] ?? n;

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
        j < nextLock &&
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

    // Personal-name heuristic: only ever a last resort (see comment on
    // tryReadNameSpan) — tried before the greedy match below because it
    // needs to claim multiple characters as one atomic unit, which the
    // greedy loop's per-position matching can't express.
    const nameSpan = tryReadNameSpan(sourceText, i, CHARS, FORMAL_CHARS, glossaryMap, WORDS, maxWordLen);
    if (nameSpan && i + nameSpan.consumed <= nextLock) {
      pushWord(nameSpan.text);
      cjkTotal += nameSpan.consumed;
      cjkMatched += nameSpan.consumed;
      diagnostics.guessedNameChars += nameSpan.consumed;
      recordFallback(i, nameSpan.consumed, "guessed-name");
      i += nameSpan.consumed;
      continue;
    }

    // CJK character: greedy longest-match across glossary, then dictionary phrases.
    // cjkTotal/cjkMatched are incremented by the same amount at every exit
    // point (`len` characters for a phrase match, 1 for a single char) so
    // `coverage` always stays within [0, 1] regardless of match length.
    const maxLen = Math.min(maxWordLen, n - i, nextLock - i);
    let matched = false;
    for (let len = maxLen; len >= 1; len -= 1) {
      const candidate = sourceText.slice(i, i + len);
      if (glossaryMap.has(candidate)) {
        pushWord(glossaryMap.get(candidate));
        cjkTotal += len;
        cjkMatched += len;
        diagnostics.glossaryChars += len;
        i += len;
        matched = true;
        break;
      }
      if (Object.prototype.hasOwnProperty.call(WORDS, candidate)) {
        pushWord(WORDS[candidate]);
        cjkTotal += len;
        cjkMatched += len;
        diagnostics.phraseChars += len;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      cjkTotal += 1;
      recordFallback(i, 1);
      const reading = CHARS[ch];
      if (reading) {
        pushWord(reading);
        cjkMatched += 1;
        diagnostics.fallbackChars += 1;
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

  return { text: capitalizeSentences(out.join("")), coverage, unknownChars, diagnostics };
}

// Only Chinese source is well suited to dictionary-based draft translation —
// Sino-Vietnamese vocabulary comes directly from Hán-Việt readings. Other
// source languages fall back to the AI translate step (see llm.js).
export function supportsSelfTranslate(sourceLanguage) {
  return sourceLanguage === "Trung";
}
