import { escapeCsvField } from "./csvUtils.js";

const CHUONG_KEYWORD = String.fromCharCode(0x43, 0x68, 0x01b0, 0x01a1, 0x6e, 0x67); // "Chương"

function chapterHeading(c, i) {
  const order = c.chapter_order ?? i;
  return c.title?.trim() ? `${CHUONG_KEYWORD} ${order}: ${c.title.trim()}` : `${CHUONG_KEYWORD} ${order}`;
}

function chapterBody(c) {
  return c.edited || c.qt_raw || c.raw_original || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsTxt(text, filename) {
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${filename}.txt`);
}

export function exportAsDoc(text, filename) {
  const escaped = (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:'Times New Roman',serif;font-size:14pt;line-height:1.8;}</style></head><body>${escaped}</body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  downloadBlob(blob, `${filename}.doc`);
}

// Round-trips with importChapters.js's parseChaptersFile: same 3 columns
// (order/title/content), so a project can be exported, edited elsewhere,
// and re-imported.
export function exportChaptersCsv(chapters, filename) {
  const rows = [["Chương", "Title", "Nội dung"]];
  chapters.forEach((c, i) => {
    rows.push([
      c.chapter_order ?? i,
      c.title || "",
      c.edited || c.qt_raw || c.raw_original || "",
    ]);
  });
  const csv = rows.map((r) => r.map((v) => escapeCsvField(v)).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${filename}.csv`);
}

// Training dataset export. One record intentionally represents one chapter:
// paragraph/sentence alignment cannot be inferred safely after a human edit
// has merged, split, added or removed passages.
export function buildChapterDataset(chapters, source = "raw") {
  const sourceField = source === "qt" ? "qt_raw" : "raw_original";
  const seenChapterIds = new Set();
  return chapters
    .map((chapter, index) => {
      const input = String(chapter[sourceField] || "");
      const output = String(chapter.edited || "");
      return {
        project_id: chapter.project_id || "",
        chapter_id: chapter.id || "",
        pair_id: `${chapter.id || `order-${chapter.chapter_order ?? index}`}:${source === "qt" ? "qt" : "zh_raw"}`,
        chapter_order: chapter.chapter_order ?? index,
        title: chapter.title || "",
        source_type: source === "qt" ? "qt" : "zh_raw",
        // Preserve the stored text byte-for-byte at the JavaScript string
        // level. trim() is used only below to detect empty fields.
        input,
        output,
      };
    })
    .filter((row) => {
      if (!row.input.trim() || !row.output.trim() || seenChapterIds.has(row.chapter_id)) return false;
      seenChapterIds.add(row.chapter_id);
      return true;
    });
}

export function exportChapterDataset(chapters, source, format, filename) {
  const rows = buildChapterDataset(chapters, source);
  if (format === "jsonl") {
    const jsonl = rows.map((row) => JSON.stringify(row)).join("\n");
    downloadBlob(new Blob([jsonl], { type: "application/x-ndjson;charset=utf-8" }), `${filename}.jsonl`);
  } else {
    const headers = ["project_id", "chapter_id", "pair_id", "chapter_order", "title", "source_type", "input", "output"];
    const csv = [headers, ...rows.map((row) => headers.map((key) => row[key]))]
      .map((row) => row.map((value) => escapeCsvField(value)).join(","))
      .join("\n");
    downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
  }
  return rows.length;
}

// Plain-text bulk export — chapters joined with a "Chương N: Title" heading
// line ahead of each one, same format ImportChaptersDialog's built-in "vi"
// preset regex already recognizes, so the file round-trips back into this
// app's own bulk import if needed.
export function exportChaptersTxt(chapters, filename) {
  const text = chapters
    .map((c, i) => `${chapterHeading(c, i)}\n\n${chapterBody(c)}`)
    .join("\n\n\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${filename}.txt`);
}

// .docx bulk export — each chapter becomes a Heading-1 title followed by
// one Word paragraph per source line (so re-importing this file with
// documentImport.js's extractTextFromDocx reconstructs the same line
// breaks). docx.js writes real OOXML/plain-Unicode text, so unlike PDF
// there's no font-embedding step needed for Vietnamese to render correctly
// — verified via a real generate-then-read-back-with-mammoth round trip.
export async function exportChaptersDocx(chapters, filename) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const children = chapters.flatMap((c, i) => [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(chapterHeading(c, i))] }),
    ...chapterBody(c)
      .split("\n")
      .map((line) => new Paragraph({ children: [new TextRun(line)] })),
  ]);
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${filename}.docx`);
}

// .pdf bulk export via jsPDF. jsPDF's built-in fonts only cover WinAnsi
// (Latin-1-ish) glyphs, which silently mangles Vietnamese diacritics — a
// Unicode-capable font has to be embedded. Noto Sans is fetched from a CDN
// at export time rather than bundled (same "load heavy assets from a CDN,
// don't bloat the app bundle" pattern this app already uses for ffmpeg.wasm
// and the subtitle-preview Google Font), and cached in memory for the rest
// of the session so exporting more than once doesn't re-download it.
// Verified end-to-end: generated a PDF with full Vietnamese diacritics,
// re-extracted the text with pdf.js, and confirmed it comes back identical.
const NOTO_SANS_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
let notoSansBase64Cache = null;

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadNotoSansBase64() {
  if (notoSansBase64Cache) return notoSansBase64Cache;
  const res = await fetch(NOTO_SANS_URL);
  if (!res.ok) throw new Error("Không tải được font Unicode để xuất PDF (kiểm tra mạng)");
  notoSansBase64Cache = arrayBufferToBase64(await res.arrayBuffer());
  return notoSansBase64Cache;
}

export async function exportChaptersPdf(chapters, filename) {
  const { jsPDF } = await import("jspdf");
  const fontBase64 = await loadNotoSansBase64();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", fontBase64);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans");

  const marginX = 40;
  const marginTop = 50;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - marginX * 2;
  const lineHeight = 15;
  let y = marginTop;

  chapters.forEach((c, i) => {
    if (i > 0) {
      doc.addPage();
      y = marginTop;
    }
    doc.setFontSize(14);
    const titleLines = doc.splitTextToSize(chapterHeading(c, i), maxWidth);
    doc.text(titleLines, marginX, y);
    y += titleLines.length * (lineHeight + 3) + 10;

    doc.setFontSize(11);
    const contentLines = doc.splitTextToSize(chapterBody(c), maxWidth);
    contentLines.forEach((line) => {
      if (y > pageHeight - marginTop) {
        doc.addPage();
        y = marginTop;
      }
      doc.text(line, marginX, y);
      y += lineHeight;
    });
  });

  doc.save(`${filename}.pdf`);
}

export function exportGlossaryJson(terms, project, filename) {
  const data = {
    project: project?.title || "Glossary",
    exported_at: new Date().toISOString(),
    custom_fields: project?.custom_field_definitions || [],
    term_count: terms.length,
    terms: terms.map((t) => ({
      source_term: t.source_term,
      translation: t.translation,
      category: t.category,
      notes: t.notes || "",
      custom_fields: t.custom_fields || {},
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${filename}.json`);
}
