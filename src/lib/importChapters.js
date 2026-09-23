import { splitLine, findColumnIndex } from "./csvUtils.js";

const CHUONG_KEYWORD = String.fromCharCode(0x43, 0x68, 0x01b0, 0x01a1, 0x6e, 0x67); // "Chương"

// Chinese numerals (十百千万 combine into larger numbers like 一百二十三) plus
// 〇/零 for zero — covers both "第1章" (Arabic) and "第一章" (Hán tự) raw dumps.
const CN_CHAPTER_NUM = "[0-9〇零一二三四五六七八九十百千万]+";

export const CHAPTER_HEADING_PRESETS = {
  vi: {
    label: "Chương 1… hoặc 551. Chương 548…",
    source: `^\\s*(?:\\d+\\s*[.)、:–—-]\\s*)?${CHUONG_KEYWORD}\\s+\\d+[^\\n]*`,
  },
  en: {
    label: "Chapter 1… hoặc 551. Chapter 548…",
    source: "^\\s*(?:\\d+\\s*[.)、:–—-]\\s*)?Chapter\\s+\\d+[^\\n]*",
  },
  zh: {
    label: "第1章… hoặc 第一章… (bản gốc tiếng Trung)",
    source: `^\\s*(?:第\\s*${CN_CHAPTER_NUM}\\s*卷\\s*)?第\\s*${CN_CHAPTER_NUM}\\s*[章回][^\\n]*|^\\s*(?:序章|楔子|引子|尾声|终章|番外(?:篇)?\\s*\\d*)[^\\n]*`,
  },
  blankTitle: {
    label: "Tên chương đứng riêng, cách nhau bằng dòng trống (raw crawl không đánh số)",
    source: null,
  },
  custom: { label: "Tùy chỉnh (regex)", source: "" },
};

// Real chapter/section titles seen in practice (crawled raw dumps, docx
// exports of Chinese web novels) are short — a few characters, occasionally
// a short phrase with a "[番外]"/"上"/"下" suffix — never a full sentence.
// Keeping this tight is what excludes ordinary paragraph lines that happen
// to lack ending punctuation.
const TITLE_LINE_MAX_LENGTH = 20;
// A real standalone chapter title essentially never ends with punctuation
// that signals the line continues into more text — sentence-enders
// (。！？), a dangling colon/dash leading into a quote ("她说：" / "——"),
// or a trailing comma — a narration/dialogue line almost always ends with
// one of these. This is the main guard against a short mid-paragraph line
// being mistaken for a title.
const SENTENCE_END_PUNCTUATION = /[。！？.!?…”"」，,、—－\-：:；;]$/;
// Some novels script in-story "trending topic" hashtags (e.g. "#盛云舒隐婚#")
// as their own short standalone line for dramatic effect — these read as a
// title to the checks above (short, no trailing sentence punctuation) but
// are plot content, not a chapter boundary.
const NOT_A_TITLE_START = /^[#＃]/;
// Same idea for in-story "system"/group-chat panel lines, e.g.
// "［还有，你把视角调高一点。］" or "对面的纪溪：［别说废话。］" — a whole
// line ending in a closing bracket/paren/quote is almost always this kind
// of inline UI/dialogue snippet, not a title. The one legitimate exception
// is a "番外"(-style) bonus-chapter suffix tag, e.g. "苏应篇一[番外]", which
// is explicitly allowed back through below.
const CLOSING_BRACKET_END = /[\]］)）》’'：:]$/;
const KNOWN_BONUS_SUFFIX_END = /[[［]\s*(番外|外传|后续|加更|彩蛋|SP|花絮)\s*[\]］]$/i;

// Some raw crawled dumps mark a chapter with nothing but its bare title
// sitting alone on its own line — no "第X章"/"Chương N" prefix at all —
// set off from the surrounding paragraphs only by an extra blank line. A
// short standalone line preceded by a blank line and not ending in typical
// sentence punctuation is treated as a title. Content before the first
// detected title is dropped, matching splitByHeadingRegex's behavior for
// content before its first match (usually just a book-title/cover line).
export function splitByBlankLineTitles(text) {
  const lines = String(text || "").split(/\r?\n/);
  const boundaries = [];
  let blankRun = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { blankRun++; continue; }
    const isChatOrSystemLine = CLOSING_BRACKET_END.test(trimmed) && !KNOWN_BONUS_SUFFIX_END.test(trimmed);
    if (
      blankRun >= 1 &&
      trimmed.length <= TITLE_LINE_MAX_LENGTH &&
      !SENTENCE_END_PUNCTUATION.test(trimmed) &&
      !NOT_A_TITLE_START.test(trimmed) &&
      !isChatOrSystemLine
    ) {
      boundaries.push({ lineIndex: i, title: trimmed });
    }
    blankRun = 0;
  }
  if (boundaries.length === 0) return [];
  return boundaries.map((boundary, i) => {
    const start = boundary.lineIndex + 1;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].lineIndex : lines.length;
    return { title: boundary.title || `Chương ${i + 1}`, content: lines.slice(start, end).join("\n").trim() };
  });
}

// Picks whichever built-in preset matches the most headings in the given
// text, so uploading a raw file that isn't in the default "Chương N"
// convention (e.g. a Chinese "第1章" raw dump, or a bare-title raw crawl)
// doesn't silently fall back to zero matches and dump the whole file into
// a single chapter.
export function detectHeadingPreset(text) {
  let bestKey = "vi";
  let bestCount = 0;
  for (const [key, preset] of Object.entries(CHAPTER_HEADING_PRESETS)) {
    if (key === "custom" || !preset.source) continue;
    try {
      const count = (String(text || "").match(new RegExp(preset.source, "gim")) || []).length;
      if (count > bestCount) { bestCount = count; bestKey = key; }
    } catch { /* ignore invalid pattern */ }
  }
  // Only fall back to the blank-line-title heuristic if no keyword-based
  // preset found a plausible number of chapters — it's a weaker signal
  // (no explicit keyword), so a real "Chương N"/"第X章" match always wins.
  if (bestCount < 2) {
    const blankTitleCount = splitByBlankLineTitles(text).length;
    if (blankTitleCount > bestCount) return "blankTitle";
  }
  return bestCount > 0 ? bestKey : "vi";
}

const EXPORT_INDEX_PREFIX = new RegExp(
  `^\\s*\\d+\\s*[.)、:–—-]\\s*(?=(?:${CHUONG_KEYWORD}|Chapter)\\s+\\d+)`,
  "iu"
);
const DECORATIVE_DIVIDER = /^\s*={5,}\s*$/;
// documentImport's EPUB chapter marker line — structural, not part of the title
const EPUB_MARKER_PREFIX = /^⟦CHUONG⟧\s*/;

function cleanChapterContent(content) {
  const lines = String(content || "").split(/\r?\n/);
  while (lines.length && (!lines[0].trim() || DECORATIVE_DIVIDER.test(lines[0]))) lines.shift();
  while (lines.length && (!lines.at(-1).trim() || DECORATIVE_DIVIDER.test(lines.at(-1)))) lines.pop();
  return lines.join("\n").trim();
}

function cleanChapterTitle(heading) {
  return String(heading || "").trim().replace(EPUB_MARKER_PREFIX, "").replace(EXPORT_INDEX_PREFIX, "").trim();
}

export function splitByHeadingRegex(text, source) {
  let regex;
  try {
    regex = new RegExp(source, "gim");
  } catch {
    return null;
  }
  const matches = [...String(text || "").matchAll(regex)];
  if (matches.length === 0) {
    return [{ title: "Chương 1", content: String(text || "").trim() }].filter((chapter) => chapter.content);
  }
  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = cleanChapterTitle(matches[i][0]);
    const contentStart = matches[i].index + matches[i][0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : String(text || "").length;
    const content = cleanChapterContent(String(text || "").slice(contentStart, contentEnd));
    chapters.push({ title: heading || `Chương ${i + 1}`, content });
  }
  return chapters;
}

// Parses a structured CSV/TSV file with explicit columns — order, title,
// content — as opposed to ImportChaptersDialog's "paste one big blob and
// auto-split by a title pattern" mode. Column headers are matched loosely
// (Vietnamese or English, with/without diacritics).
export function parseChaptersFile(content, filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const isTSV = ext === "tsv";
  const delimiter = isTSV ? "\t" : ",";
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const orderIdx = findColumnIndex(headers, [
    "order", "chapter_order", "chương", "chuong", "stt", "số", "so", "thứ tự", "thu tu",
  ]);
  const titleIdx = findColumnIndex(headers, [
    "title", "tên chương", "ten chuong", "tên", "ten", "tiêu đề", "tieu de",
  ]);
  const contentIdx = findColumnIndex(headers, [
    "content", "nội dung", "noi dung", "văn bản", "van ban", "edited", "text",
  ]);

  const chapters = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    const title = (titleIdx >= 0 ? cols[titleIdx] : "")?.trim() || "";
    const content = (contentIdx >= 0 ? cols[contentIdx] : "")?.trim() || "";
    const orderRaw = (orderIdx >= 0 ? cols[orderIdx] : "")?.trim() || "";
    if (!title && !content) continue;
    const order = orderRaw !== "" && !Number.isNaN(Number(orderRaw)) ? Number(orderRaw) : null;
    chapters.push({ title: title || `Chương ${chapters.length + 1}`, content, order });
  }
  return chapters;
}
