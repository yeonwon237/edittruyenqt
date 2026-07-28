// Word-boundary-aware find/replace. JS's built-in \b only recognizes ASCII
// [A-Za-z0-9_] as "word" characters, so it misfires on Vietnamese diacritics
// (ư, ơ, ệ, đ, ...). This defines a Unicode-aware boundary instead, so
// replacing "Ta" doesn't corrupt an unrelated word that merely contains "ta".
const WORD_CHAR = "A-Za-z0-9_\\u00C0-\\u1EFF";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordRegex(term) {
  const escaped = escapeRegex(term);
  return new RegExp(`(?<![${WORD_CHAR}])(?:${escaped})(?![${WORD_CHAR}])`, "g");
}

/**
 * Apply a list of {find, replace} rules to text.
 * @param {string} text
 * @param {Array<{find:string, replace:string}>} rules
 * @param {{wholeWord?: boolean}} options
 * @returns {{ text: string, count: number }}
 */
export function applyReplacements(text, rules, { wholeWord = false } = {}) {
  let result = text || "";
  let count = 0;
  (rules || []).forEach(({ find, replace }) => {
    if (!find) return;
    if (wholeWord) {
      const re = wholeWordRegex(find);
      const matches = result.match(re);
      count += matches ? matches.length : 0;
      result = result.replace(re, replace || "");
    } else {
      const parts = result.split(find);
      count += parts.length - 1;
      result = parts.join(replace || "");
    }
  });
  return { text: result, count };
}

// Strips the modern-Vietnamese polite sentence-final particle "ạ" — jarring
// in period-piece / wuxia dialogue where "huynh/muội/tiểu nhân" register is
// expected instead. Removes it right before end-of-sentence punctuation or
// a closing quote, and at the end of a line.
//
// Must only match "ạ" as its own standalone particle, not the same letter
// glued onto the end of an unrelated word (hạ, lạ, vạ, quạ...) — a version
// without the word-boundary lookbehind below turned "Ngụy niên hạ," into
// "Ngụy niên h," in a real AI-edited chapter (confirmed by the user).
export function stripPoliteA(text) {
  if (!text) return text;
  const notGluedToWord = `(?<![${WORD_CHAR}])`;
  return text
    .replace(new RegExp(`[ \\t]*${notGluedToWord}ạ(?=[.!?,;:…"'”])`, "g"), "")
    .replace(new RegExp(`[ \\t]*${notGluedToWord}ạ$`, "gm"), "");
}
