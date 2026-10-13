import { parseTitleNumber } from "./chapterNumbering.js";

const CHAPTER_PREFIX = /^\s*(?:chương|chuong|chapter|chap\.?|ch\.?)\s*\d+\s*(?:[:：.\-–—]\s*)?/iu;

export function parseBatchTitleLines(text) {
  return String(text || "")
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(CHAPTER_PREFIX, "").trim());
}

export function planBatchChapterTitles(chapters, { start, end, text }) {
  const from = Number(start);
  const to = Number(end);
  const lines = parseBatchTitleLines(text);
  const expected = Number.isInteger(from) && Number.isInteger(to) && to >= from
    ? to - from + 1
    : 0;

  if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < from) {
    return { plan: [], lines, expected, error: "Khoảng chương không hợp lệ." };
  }
  if (lines.some((line) => !line)) {
    return { plan: [], lines, expected, error: "Có dòng chỉ chứa số chương nhưng chưa có tiêu đề." };
  }
  if (lines.length !== expected) {
    return {
      plan: [],
      lines,
      expected,
      error: `Cần đúng ${expected} tiêu đề cho chương ${from}–${to}, hiện có ${lines.length}.`,
    };
  }

  const ordered = [...chapters].sort(
    (a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0)
  );
  const byNumber = new Map();
  for (const chapter of ordered) {
    const number = parseTitleNumber(chapter.title)?.number;
    if (number == null) continue;
    const matches = byNumber.get(number) || [];
    matches.push(chapter);
    byNumber.set(number, matches);
  }

  const plan = [];
  for (let number = from; number <= to; number++) {
    const matches = byNumber.get(number) || [];
    if (matches.length === 0) {
      return { plan: [], lines, expected, error: `Không tìm thấy Chương ${number} trong truyện.` };
    }
    if (matches.length > 1) {
      return { plan: [], lines, expected, error: `Có nhiều chương cùng mang số ${number}; hãy sửa số chương bị trùng trước.` };
    }
    const chapter = matches[0];
    const title = lines[number - from];
    plan.push({
      id: chapter.id,
      number,
      oldTitle: chapter.title || `Chương ${number}`,
      title: `Chương ${number}: ${title}`,
    });
  }

  return { plan, lines, expected, error: "" };
}
