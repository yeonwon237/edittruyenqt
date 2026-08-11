import { splitLine, findColumnIndex } from "./csvUtils.js";

const CHUONG_KEYWORD = String.fromCharCode(0x43, 0x68, 0x01b0, 0x01a1, 0x6e, 0x67); // "Chương"

export const CHAPTER_HEADING_PRESETS = {
  vi: {
    label: "Chương 1… hoặc 551. Chương 548…",
    source: `^\\s*(?:\\d+\\s*[.)、:–—-]\\s*)?${CHUONG_KEYWORD}\\s+\\d+[^\\n]*`,
  },
  en: {
    label: "Chapter 1… hoặc 551. Chapter 548…",
    source: "^\\s*(?:\\d+\\s*[.)、:–—-]\\s*)?Chapter\\s+\\d+[^\\n]*",
  },
  custom: { label: "Tùy chỉnh (regex)", source: "" },
};

const EXPORT_INDEX_PREFIX = new RegExp(
  `^\\s*\\d+\\s*[.)、:–—-]\\s*(?=(?:${CHUONG_KEYWORD}|Chapter)\\s+\\d+)`,
  "iu"
);
const DECORATIVE_DIVIDER = /^\s*={5,}\s*$/;

function cleanChapterContent(content) {
  const lines = String(content || "").split(/\r?\n/);
  while (lines.length && (!lines[0].trim() || DECORATIVE_DIVIDER.test(lines[0]))) lines.shift();
  while (lines.length && (!lines.at(-1).trim() || DECORATIVE_DIVIDER.test(lines.at(-1)))) lines.pop();
  return lines.join("\n").trim();
}

function cleanChapterTitle(heading) {
  return String(heading || "").trim().replace(EXPORT_INDEX_PREFIX, "").trim();
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
