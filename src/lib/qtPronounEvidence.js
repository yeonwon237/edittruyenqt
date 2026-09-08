// Task 1 (pronoun-qa-plan.md): pulls self/second-person pronoun evidence out
// of the untranslated QT (raw machine-translated Chinese-reading) text.
// `edited` has already lost the distinction — ta/tôi/ngươi/em are all
// context-dependent Vietnamese pronouns — but `qt_raw` still carries the
// original Chinese self-reference and address terms, which are far less
// ambiguous. This module is pure and standalone (no import from
// qualityCheck.js, no network, no AI) so it can be wired into the dialogue
// resolver later as one more signal, without risking a circular import or
// non-determinism in the QA path.

// Self-reference (ngôi 1) markers, roughly ordered by how status-marked they
// are. Longest-first within a call site matters for matching, not for this
// list's own order — extractQtEvidence checks membership, not position.
export const QT_SELF_MARKERS = [
  "朕", "本宫", "本座", "本王", "本官", "妾身", "臣妾", "属下", "奴婢", "奴才",
  "在下", "老夫", "老身", "微臣", "末将", "孤", "寡人", "我", "吾",
];

// Second-person (ngôi 2) markers.
export const QT_SECOND_PERSON_MARKERS = [
  "你", "您", "汝", "尔", "阁下", "大人", "陛下", "娘娘", "公子", "姑娘",
];

// Self-markers that imply an imperial/royal register.
export const QT_IMPERIAL_MARKERS = ["朕", "本宫", "臣妾", "微臣"];
// Self-markers that imply a humble/subordinate register.
export const QT_HUMBLE_MARKERS = ["属下", "奴婢", "在下"];

// Speech-tag verbs ("X道", "X说", "X问", "X答", "X笑道", "X冷声道") used to
// pull the speaker's name out of a QT paragraph. Longest-first so a compound
// verb like "笑道" is preferred over its bare tail "道" landing on the same
// position — see extractSpeaker for why the capture itself must also be
// non-greedy (a greedy name capture backtracks one character at a time and
// finds the SHORTER verb "道" before ever trying the longer "笑道", silently
// swallowing "笑" into the name).
const SPEECH_TAG_VERBS = ["笑道", "冷声道", "道", "说", "问", "答"];
const SPEECH_TAG_REGEX = new RegExp(`([\\u4e00-\\u9fff]{1,6}?)(?:${SPEECH_TAG_VERBS.join("|")})`);

function extractSpeaker(paragraph) {
  const match = SPEECH_TAG_REGEX.exec(paragraph);
  return match ? match[1] : null;
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
  const selfMarkers = QT_SELF_MARKERS.filter((marker) => text.includes(marker));
  const secondPerson = QT_SECOND_PERSON_MARKERS.filter((marker) => text.includes(marker));
  const register = QT_IMPERIAL_MARKERS.some((marker) => text.includes(marker))
    ? "imperial"
    : QT_HUMBLE_MARKERS.some((marker) => text.includes(marker))
      ? "humble"
      : "neutral";
  return { speaker: extractSpeaker(text), selfMarkers, secondPerson, register };
}
