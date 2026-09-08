// Task 1 (pronoun-qa-plan.md): pulls self/second-person pronoun evidence out
// of the untranslated QT (raw machine-translated) text. `edited` has already
// lost the distinction — ta/tôi/ngươi/em are all context-dependent
// Vietnamese pronouns the human/AI editor picks per relationship — but
// `qt_raw` still carries the original Chinese self-reference and address
// terms, either as literal Chinese (this app's own "Tự dịch" Hán-Việt pass
// leaves a meaningful share of paragraphs untranslated in real chapters) or
// as that same pass's Vietnamese gloss (src/data/vietphrase-*.json — the
// exact dictionary "Tự dịch" itself calls). Checked against real qt_raw
// data from a live project: qt_raw is NOT literal Chinese the way the
// original plan assumed — it's a MIX of both, so both forms are checked.
//
// Two Vietnamese-gloss entries the dictionary technically has were left
// OUT on purpose: "người" (陛您's fallback) and "cô" (孤's fallback) are
// each ALSO the dictionary's fallback gloss for a common, unrelated
// character (人 "person", and several unrelated single characters
// respectively) — verified directly against vietphrase-chars.json. Since
// qt_raw is machine output with sentence structure flattened, either word
// would fire constantly for reasons that have nothing to do with a
// second-person address or a royal self-reference — pure noise, not
// evidence. Every other Vietnamese-gloss entry here was checked against the
// dictionary source and maps ONLY from self/second-person Chinese terms.
//
// This module is pure and standalone (no import from qualityCheck.js, no
// network, no AI) so it can be wired into the dialogue resolver later as
// one more signal, without risking a circular import or non-determinism in
// the QA path.

// Self-reference (ngôi 1) markers as literal Chinese — present when a
// paragraph's qt_raw segment was left untranslated.
export const QT_SELF_MARKERS_HAN = [
  "朕", "本宫", "本座", "本王", "本官", "妾身", "臣妾", "属下", "奴婢", "奴才",
  "在下", "老夫", "老身", "微臣", "末将", "孤", "寡人", "我", "吾",
];
// Same markers as this app's own Hán-Việt dictionary pass actually
// substitutes them with (verified against src/data/vietphrase-*.json and
// real qt_raw rows). 我 and 吾 both gloss to "ta"; 孤 is deliberately absent
// (see file header).
export const QT_SELF_MARKERS_VI = [
  "trẫm", "bổn cung", "bổn tọa", "bổn vương", "bổn quan", "thiếp thân",
  "nô tì", "thuộc hạ", "nô tài", "tại hạ", "lão phu", "lão thân", "vi thần",
  "mạt tướng", "quả nhân", "ta",
];
export const QT_SELF_MARKERS = [...QT_SELF_MARKERS_HAN, ...QT_SELF_MARKERS_VI];

// Second-person (ngôi 2) markers, literal Chinese.
export const QT_SECOND_PERSON_MARKERS_HAN = [
  "你", "您", "汝", "尔", "阁下", "大人", "陛下", "娘娘", "公子", "姑娘",
];
// Vietnamese-gloss equivalents. 你 and 尔 both gloss to "ngươi"; 您 is
// deliberately absent (see file header).
export const QT_SECOND_PERSON_MARKERS_VI = [
  "ngươi", "mày", "các hạ", "đại nhân", "bệ hạ", "nương nương", "công tử", "cô nương",
];
export const QT_SECOND_PERSON_MARKERS = [...QT_SECOND_PERSON_MARKERS_HAN, ...QT_SECOND_PERSON_MARKERS_VI];

// Self-markers that imply an imperial/royal register.
const QT_IMPERIAL_MARKERS_HAN = ["朕", "本宫", "臣妾", "微臣"];
const QT_IMPERIAL_MARKERS_VI = ["trẫm", "bổn cung", "nô tì", "vi thần"];
export const QT_IMPERIAL_MARKERS = [...QT_IMPERIAL_MARKERS_HAN, ...QT_IMPERIAL_MARKERS_VI];
// Self-markers that imply a humble/subordinate register.
const QT_HUMBLE_MARKERS_HAN = ["属下", "奴婢", "在下"];
const QT_HUMBLE_MARKERS_VI = ["thuộc hạ", "nô tài", "tại hạ"];
export const QT_HUMBLE_MARKERS = [...QT_HUMBLE_MARKERS_HAN, ...QT_HUMBLE_MARKERS_VI];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Chinese-character markers are checked as plain substrings — real qt_raw
// data is either fully-untranslated Chinese prose (where per-character
// containment is the same tradeoff the original plan already accepted) or
// fully Vietnamese-glossed for that segment, never a mix within one word.
function countHanMarkers(text, markers) {
  return markers.filter((marker) => text.includes(marker));
}

// Vietnamese-gloss markers need real word-boundary matching — unlike the
// Han side, these sit in ordinary Vietnamese-alphabet text where a naive
// substring check could match inside an unrelated longer word.
function countViMarkers(text, markers) {
  return markers.filter((marker) => new RegExp(`(?<!\\p{L})${escapeRegex(marker)}(?!\\p{L})`, "iu").test(text));
}

// Speech-tag speaker extraction. Three forms, tried in order — matching
// what real qt_raw data actually contains:
// 1. A Chinese verb directly attached to the name ("X道/说/问/答/笑道/冷声道")
//    — the paragraph was left untranslated.
// 2. The same verbs' Vietnamese gloss, space-separated ("X nói", "X hỏi"...)
//    — the paragraph was translated by this app's own dictionary pass.
// 3. A bare "Name:" immediately before an opening quote, no verb at all —
//    the single most common real pattern found in this app's own qt_raw
//    data (this book's dialogue rarely tags a verb at all, matching the
//    same style already known from `edited`).
const HAN_SPEECH_TAG_VERBS = ["笑道", "冷声道", "道", "说", "问", "答"];
const HAN_SPEECH_TAG_REGEX = new RegExp(`([\\u4e00-\\u9fff]{1,6}?)(?:${HAN_SPEECH_TAG_VERBS.join("|")})`);
const VI_SPEECH_TAG_VERBS = ["cười nói", "lạnh giọng nói", "âm thanh lạnh lùng nói", "nói", "hỏi", "đáp"];
const VI_SPEECH_TAG_REGEX = new RegExp(`^([\\p{L} ]{1,25}?)\\s+(?:${VI_SPEECH_TAG_VERBS.map(escapeRegex).join("|")})\\s*[:：]`, "u");
const BARE_NAME_TAG_REGEX = /^([\p{L} ]{1,25})[:：]\s*["“]/u;

function extractSpeaker(paragraph) {
  const hanMatch = HAN_SPEECH_TAG_REGEX.exec(paragraph);
  if (hanMatch) return hanMatch[1];
  const viVerbMatch = VI_SPEECH_TAG_REGEX.exec(paragraph.trim());
  if (viVerbMatch) return viVerbMatch[1].trim();
  const bareMatch = BARE_NAME_TAG_REGEX.exec(paragraph.trim());
  if (bareMatch) return bareMatch[1].trim();
  return null;
}

// Splits `text` into non-empty lines. For `edited` we also need to know
// where each line's actual (trimmed) content starts in the ORIGINAL string,
// so evidence pulled from the aligned QT paragraph can be mapped back to a
// real offset in the edited chapter by a future caller.
function splitNonEmptyLines(text, withOffsets) {
  const lines = [];
  let offset = 0;
  for (const raw of String(text || "").split("\n")) {
    const trimmed = raw.trim();
    if (trimmed) {
      const entry = { text: trimmed };
      if (withOffsets) entry.offset = offset + (raw.length - raw.trimStart().length);
      lines.push(entry);
    }
    offset += raw.length + 1; // +1 for the '\n' the split consumed
  }
  return lines;
}

// Pairs up QT and edited paragraphs strictly by matching non-empty-line
// count. A chapter where the two don't line up 1:1 (a merged/split
// paragraph, a stray blank line, missing QT) makes per-paragraph evidence
// unreliable to attach to a position — abstain completely (return []) rather
// than guess a fuzzy alignment.
export function alignParagraphs(qtRaw, edited) {
  const qtLines = splitNonEmptyLines(qtRaw, false);
  const editedLines = splitNonEmptyLines(edited, true);
  if (!qtLines.length || qtLines.length !== editedLines.length) return [];
  return qtLines.map((qt, i) => ({
    qtText: qt.text,
    editedText: editedLines[i].text,
    editedOffset: editedLines[i].offset,
  }));
}

// Pulls whatever self/second-person pronoun evidence a single QT paragraph
// carries. A paragraph with none of the known markers returns empty arrays
// and a null speaker/neutral register — genuinely "no evidence found", not
// a guess dressed up as one.
export function extractQtEvidence(qtParagraph) {
  const text = String(qtParagraph || "");
  const selfMarkers = [...countHanMarkers(text, QT_SELF_MARKERS_HAN), ...countViMarkers(text, QT_SELF_MARKERS_VI)];
  const secondPerson = [...countHanMarkers(text, QT_SECOND_PERSON_MARKERS_HAN), ...countViMarkers(text, QT_SECOND_PERSON_MARKERS_VI)];
  const isImperial = countHanMarkers(text, QT_IMPERIAL_MARKERS_HAN).length || countViMarkers(text, QT_IMPERIAL_MARKERS_VI).length;
  const isHumble = countHanMarkers(text, QT_HUMBLE_MARKERS_HAN).length || countViMarkers(text, QT_HUMBLE_MARKERS_VI).length;
  const register = isImperial ? "imperial" : isHumble ? "humble" : "neutral";
  return { speaker: extractSpeaker(text), selfMarkers, secondPerson, register };
}
