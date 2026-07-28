import { splitLine, findColumnIndex } from "./csvUtils";

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
