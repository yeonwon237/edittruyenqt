// Pre-import chapter numbering, ported from the standalone "danh-so-chuong"
// tool. Some raw dumps mark every chapter with the same repeated line (e.g.
// the book name "师傅饶命GL" at the top of each chapter) instead of a real
// "第X章"/"Chương N" heading — every chapter would then import with an
// identical title. This finds that repeated marker line and rewrites each
// occurrence into a numbered heading from a template, before the text goes
// through ImportChaptersDialog's normal split pipeline.
//
// Works on the textarea text, so it covers every upload format at once
// (.txt/.docx/.pdf, and .epub's "⟦CHUONG⟧ title" marked text — there the
// repeated part is the title after the marker, and the marker is kept).

const EPUB_MARKER_PREFIX = /^(\s*⟦CHUONG⟧ )/;
const MAX_MARKER_LENGTH = 40;
const MIN_MARKER_REPEATS = 3;
const MAX_DONG_LENGTH = 60;

export const NUMBERING_TEMPLATES = [
  "Chương {n}",
  "Chương {n}: {dong}",
  "第{n}章",
  "第{n}章 {dong}",
  "Chapter {n}",
  "{nnn}",
];

const pad = (n, width) => String(n).padStart(width, "0");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function splitPrefix(line) {
  const m = EPUB_MARKER_PREFIX.exec(line);
  return m ? { prefix: m[1], body: line.slice(m[1].length).trim() } : { prefix: /^\s*/.exec(line)[0], body: line.trim() };
}

// Short lines repeated at least MIN_MARKER_REPEATS times, most frequent
// first. The top one is the default guess, but a bare "……" or "“嗯。”" can
// out-count the real marker, so the dialog lets the user pick among these.
export function findRepeatedLines(text, limit = 5) {
  const counts = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const { body } = splitPrefix(line);
    if (!body || body.length > MAX_MARKER_LENGTH) continue;
    counts.set(body, (counts.get(body) || 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= MIN_MARKER_REPEATS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([line, count]) => ({ line, count }));
}

export function formatChapterName(template, n, dong = "") {
  let name = String(template || "Chương {n}")
    .replace(/\{nnn\}/g, pad(n, 3))
    .replace(/\{nn\}/g, pad(n, 2))
    .replace(/\{n\}/g, String(n))
    .replace(/\{dong\}/g, dong);
  if (!dong) name = name.replace(/[\s:：\-–—.、,]+$/u, "");
  return name.trim() || String(n);
}

// Rewrites every line equal to `marker` into a numbered heading. {dong} is
// the next non-empty line (the chapter's real name, when the source has
// one) — left in the body too, same as the original tool.
export function numberChapters(text, { marker, template = "Chương {n}", start = 1 } = {}) {
  const source = String(text || "");
  if (!marker) return { text: source, count: 0 };
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  let n = Number.isFinite(Number(start)) ? Number(start) : 1;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const { prefix, body } = splitPrefix(lines[i]);
    if (body !== marker) continue;
    let dong = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const next = splitPrefix(lines[j]).body;
      if (next) {
        dong = next === marker || next.length > MAX_DONG_LENGTH ? "" : next;
        break;
      }
    }
    lines[i] = prefix + formatChapterName(template, n++, dong);
    count++;
  }
  return { text: lines.join(eol), count };
}

// Split regex matching the headings a template produces, so the dialog can
// switch its split pattern to the freshly numbered lines.
export function headingRegexForTemplate(template) {
  const parts = String(template || "Chương {n}").split(/(\{nnn\}|\{nn\}|\{n\}|\{dong\})/);
  let body = parts
    .map((part) => {
      if (/^\{n+\}$/.test(part)) return "\\d+";
      if (part === "{dong}") return "[^\\n]*";
      return escapeRegex(part);
    })
    .join("");
  // formatChapterName trims the separator when {dong} is empty
  body = body.replace(/((?:\\[.\-]|[\s:：–—、,])+)\[\^\\n\]\*$/u, "(?:$1[^\\n]*)?");
  return `^[ \\t]*${body}[ \\t]*$`;
}

// ---------------------------------------------------------------------------
// Inserting a chapter mid-list. Chapter numbers live in the titles
// ("Chương 10: …", "第10章", "010"), not in chapter_order, so adding one
// after chapter 10 has to shift the number in every later title by one.

const KEYWORD = "(?:Chương|Chuong|Chapter|Chap\\.?|Ch\\.)";
const TITLE_NUMBER_RULES = [
  // "551. Chương 548" — export index prefix plus the real number, both shift
  new RegExp(`^(\\s*)(\\d+)(\\s*[.)、:–—-]\\s*${KEYWORD}\\s*)(\\d+)`, "iu"),
  new RegExp(`^(\\s*${KEYWORD}\\s*)(\\d+)`, "iu"),
  /^(\s*第\s*)(\d+)(?=\s*[章回节])/u,
  /^(\s*)(\d+)(?=\s*(?:[.)、:：–—-]|$))/u,
];

// Keeps zero-padding only for titles that were padded ("009" → "010"); a
// plain "10" moving down must become "9", not "09".
const bump = (digits, delta) => {
  const next = String(Number(digits) + delta);
  return /^0\d/.test(digits) ? next.padStart(digits.length, "0") : next;
};

// {number, heading, shift(delta)} for a title that starts with a chapter
// number, else null. `heading` is just the numbered part ("Chương 10"),
// used as the template for a freshly inserted chapter's title.
export function parseTitleNumber(title) {
  const text = String(title || "");
  for (const rule of TITLE_NUMBER_RULES) {
    const m = rule.exec(text);
    if (!m) continue;
    const twoNumbers = m.length === 5;
    const numberGroup = twoNumbers ? 4 : 2;
    const rest = text.slice(m[0].length);
    const build = (delta) => twoNumbers
      ? m[1] + bump(m[2], delta) + m[3] + bump(m[4], delta)
      : m[1] + bump(m[2], delta);
    const suffix = rule.source.includes("第") ? (/^\s*[章回节]/u.exec(rest)?.[0] || "") : "";
    return {
      number: Number(m[numberGroup]),
      heading: (delta) => (build(delta) + suffix).trim(),
      shift: (delta) => build(delta) + rest,
    };
  }
  return null;
}

// Plans inserting one chapter right after orderedChapters[afterIndex]:
// its title/chapter_order, plus the later chapters whose titles need their
// number bumped. The shift stops at the first number that goes backwards,
// so a later volume that restarts at "Chương 1" is left alone; titles with
// no number ("Phiên ngoại", "Lời tác giả") are skipped, not renumbered.
export function planChapterInsert(orderedChapters, afterIndex) {
  const above = orderedChapters[afterIndex];
  const below = orderedChapters[afterIndex + 1];
  const aboveOrder = above?.chapter_order ?? afterIndex;
  const chapterOrder = below ? (aboveOrder + (below.chapter_order ?? aboveOrder + 1)) / 2 : aboveOrder + 1;

  const aboveNumber = parseTitleNumber(above?.title);
  const belowNumber = below ? parseTitleNumber(below.title) : null;
  let title;
  let newNumber;
  if (aboveNumber) {
    title = aboveNumber.heading(1);
    newNumber = aboveNumber.number + 1;
  } else if (belowNumber) {
    title = belowNumber.heading(0);
    newNumber = belowNumber.number;
  } else {
    title = `Chương ${afterIndex + 2}`;
    newNumber = null;
  }

  const renames = newNumber == null ? [] : shiftFollowingTitles(orderedChapters.slice(afterIndex + 1), newNumber, 1);
  return { title, chapterOrder, renames };
}

// Bumps the number of each numbered title by `delta`, starting from
// `fromNumber` and stopping at the first number that goes backwards.
function shiftFollowingTitles(chapters, fromNumber, delta) {
  const renames = [];
  let last = fromNumber;
  for (const chapter of chapters) {
    const parsed = parseTitleNumber(chapter.title);
    if (!parsed) continue;
    if (parsed.number < last) break;
    last = parsed.number;
    renames.push({ id: chapter.id, title: parsed.shift(delta) });
  }
  return renames;
}

// Mirror of planChapterInsert for deleting orderedChapters[index]: every
// later numbered title moves down by one. A deleted chapter with no number
// in its title shifts nothing.
export function planChapterDelete(orderedChapters, index) {
  const deleted = parseTitleNumber(orderedChapters[index]?.title);
  if (!deleted) return { renames: [] };
  return { renames: shiftFollowingTitles(orderedChapters.slice(index + 1), deleted.number, -1) };
}

// Repair pass: renumbers every numbered title consecutively in list order,
// starting from the first numbered chapter's own number (so a "Văn án"
// before "Chương 1" stays unnumbered). Returns only titles that change.
export function planRenumberAll(orderedChapters) {
  const renames = [];
  let next = null;
  for (const chapter of orderedChapters) {
    const parsed = parseTitleNumber(chapter.title);
    if (!parsed) continue;
    if (next == null) next = parsed.number;
    const delta = next - parsed.number;
    if (delta !== 0) renames.push({ id: chapter.id, title: parsed.shift(delta) });
    next++;
  }
  return renames;
}
