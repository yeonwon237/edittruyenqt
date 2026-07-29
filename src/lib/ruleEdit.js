// Rule-based "QT thô -> Bản Edit" smoothing — a from-scratch, zero-AI
// alternative to the buildEditPrompt() AI Auto-Edit step in Workspace.jsx.
// Unlike hanviet.js (which translates Chinese -> Vietnamese), this module
// takes text that is ALREADY Vietnamese but awkward/literal — QT thô sourced
// from any convert tool, not just this app's own translator — and smooths
// it toward the user's own editing style using rules, not AI.
//
// Every rule here was derived by diffing the user's own real QT-thô/Bản-Edit
// chapter pairs (200 chapters) rather than guessed, and checked against the
// full corpus before being added. See per-rule comments for the numbers.
// JS's built-in \b only recognizes ASCII [A-Za-z0-9_] as "word" characters,
// so it misfires on Vietnamese diacritics — same fix as textReplace.js's
// WORD_CHAR (kept local here rather than imported to avoid coupling two
// otherwise-independent post-processing modules).
const WORD_CHAR = "A-Za-z0-9_\\u00C0-\\u1EFF";

// --- Strip meaningless sentence-final filler particles ---
// Some raw QT/Convert sources transliterate Chinese mood particles (啦, 呐 —
// pure tone-softeners with no dictionary meaning of their own, roughly like
// English "you know") literally into their bare Hán-Việt reading ("lạp",
// "nột") instead of dropping them, leaving nonsense like "có thể động tác
// lạp!". Checked against the user's own 200-chapter corpus: "lạp" appears
// 134 times in QT thô vs. only 4 times in their own Bản Edit (all 4 remaining
// are real words/ambiguous, not the filler — see guards below); "nột"
// appears 21 times raw vs. 2 in edit (both are one real reduplicated word).
//
// Two guards keep this conservative:
// - Reduplication ("nột nột" = "lắp bắp/stammering", a real word) is left
//   untouched.
// - Only stripped when sitting right at a clause boundary (followed by
//   punctuation, a closing quote, "~", or end of line/text) — mid-clause
//   occurrences ("lạp xưởng" = sausage, a real word) are left alone since
//   there is no reliable way to tell filler from content there.
const FILLER_WORDS = new Set(["lạp", "nột"]);
const FILLER_WORD_RE = new RegExp(`(?<![${WORD_CHAR}])(lạp|nột)(?![${WORD_CHAR}])`, "giu");
const CLAUSE_BOUNDARY_AFTER_RE = /^(?:[!?.,;:…~"'“”‘’»]|$)/;

function isReduplicatedNot(before, after) {
  return /nột\s*$/i.test(before) || /^\s*nột(?![A-Za-z0-9_À-ỿ])/i.test(after);
}

export function stripFillerParticles(text) {
  if (!text) return text;
  const result = text.replace(FILLER_WORD_RE, (match, word, offset, full) => {
    const lower = word.toLowerCase();
    if (!FILLER_WORDS.has(lower)) return match;

    const before = full.slice(Math.max(0, offset - 8), offset);
    const afterRaw = full.slice(offset + match.length, offset + match.length + 8);
    if (lower === "nột" && isReduplicatedNot(before, afterRaw)) return match;

    const restOfLine = full.slice(offset + match.length, indexOfLineEnd(full, offset + match.length));
    const trimmedRest = restOfLine.replace(/^[ \t]+/, "");
    if (!CLAUSE_BOUNDARY_AFTER_RE.test(trimmedRest)) return match;

    return "";
  });
  // Collapse the leftover space left behind where a filler word used to sit:
  // no space before standard punctuation ("động tác !" -> "động tác!"),
  // exactly one space before a trailing "~", none at end of line/text.
  return result
    .replace(/[ \t]+(?=[!?.,;:…])/g, "")
    .replace(/[ \t]+(?=~)/g, " ")
    .replace(/[ \t]+(?=\n|$)/g, "");
}

function indexOfLineEnd(text, from) {
  const idx = text.indexOf("\n", from);
  return idx === -1 ? text.length : idx;
}

/**
 * Rule-based smoothing pipeline: QT thô (rough, already-Vietnamese) -> a
 * cleaner draft, no AI involved. Currently just the filler-particle pass;
 * more passes get added here as more patterns are confirmed against real
 * chapter data.
 * @param {string} qtRawText
 * @returns {string}
 */
export function applyRuleEdit(qtRawText) {
  if (!qtRawText) return qtRawText;
  return stripFillerParticles(qtRawText);
}
