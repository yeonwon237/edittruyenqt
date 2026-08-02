// Extracts plain text / chapters from book-shaped files (.docx/.pdf/.epub)
// entirely client-side — this app has no backend to offload parsing to.
// Each library is dynamically imported so a normal session (99% of the
// time: pasting or uploading a .txt) never pays for mammoth/pdfjs-dist/
// jszip in the main bundle.

const CHAPTER_MARKER = "⟦CHUONG⟧"; // ⟦CHUONG⟧ — deliberately obscure,
// won't collide with real novel text. Used to reconstruct EPUB's already-
// known chapter boundaries as plain text with a marker line ahead of each
// chapter, so the result can flow through the exact same textarea + regex
// auto-split pipeline every other import path already uses, instead of a
// separate structured-import code path.
export const EPUB_CHAPTER_REGEX_SOURCE = `^${CHAPTER_MARKER} .*`;

// .docx — paragraph text only (mammoth drops images/styling, which is fine,
// we only want the prose). Confirmed via a real fixture file: mammoth joins
// paragraphs with a blank line ("\n\n") between them, which lines up with
// this app's "preserve blank-line paragraph spacing" convention elsewhere
// (buildEditPrompt rule #8) — a paragraph-per-paragraph .docx should come
// through with the same blank-line spacing a .txt export would have had.
export async function extractTextFromDocx(file) {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

// .pdf — text extraction via pdf.js, page by page. This is the roughest of
// the three formats: PDF has no real paragraph/line concept, so text comes
// out as whatever left-to-right reading order pdf.js infers per page —
// expect line-wrap artifacts and page headers/footers mixed into the flow.
// Worker is loaded from a CDN matching the installed package version
// (same reasoning as this app's ffmpeg.wasm usage in videoRender.js: avoids
// Vite worker-bundling complexity and any cross-origin-isolation headers).
export async function extractTextFromPdf(file) {
  const pdfjsLib = await import("pdfjs-dist");
  const { version } = await import("pdfjs-dist/package.json");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNum);
    // eslint-disable-next-line no-await-in-loop
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(" "));
  }
  return pageTexts.join("\n\n");
}

// .epub — reads the OCF container to find the .opf, parses its manifest +
// spine (the book's real, author-defined reading order — far more reliable
// than guessing chapter boundaries from a heading regex), and pulls plain
// text out of each spine document's <p>/<div> blocks. Spine items under
// MIN_CHAPTER_CHARS are skipped as likely non-chapter matter (cover, blank
// separator pages, copyright page) — a heuristic, not a guarantee; very
// short real chapters could get dropped and would need re-adding by hand.
const MIN_CHAPTER_CHARS = 200;

export async function extractChaptersFromEpub(file) {
  const JSZip = (await import("jszip")).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("File EPUB không hợp lệ (thiếu container.xml)");
  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("File EPUB không hợp lệ (không tìm thấy .opf)");

  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("File EPUB không hợp lệ (không đọc được .opf)");
  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = {};
  opfDoc.querySelectorAll("manifest > item").forEach((item) => {
    manifest[item.getAttribute("id")] = {
      href: item.getAttribute("href"),
      properties: item.getAttribute("properties") || "",
    };
  });

  const spineIds = [...opfDoc.querySelectorAll("spine > itemref")].map((el) =>
    el.getAttribute("idref")
  );

  const chapters = [];
  for (const id of spineIds) {
    const entry = manifest[id];
    if (!entry || entry.properties.includes("nav")) continue; // skip the EPUB3 nav/TOC document
    const path = opfDir + entry.href;
    // eslint-disable-next-line no-await-in-loop
    const html = await (zip.file(path) || zip.file(decodeURIComponent(path)))?.async("text");
    if (!html) continue;

    const doc = new DOMParser().parseFromString(html, "text/html");
    const heading = doc.querySelector("h1, h2, h3, h4, title");
    const title = heading?.textContent?.trim() || entry.href.replace(/\.[^.]+$/, "");

    const blocks = [...doc.querySelectorAll("p, div")]
      .map((el) => el.textContent.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const content = blocks.length ? blocks.join("\n\n") : (doc.body?.textContent || "").trim();

    if (content.length >= MIN_CHAPTER_CHARS) {
      chapters.push({ title, content });
    }
  }
  return chapters;
}

// Reconstructs EPUB's structured {title, content}[] as one marked-up blob
// so it can be pasted into the same textarea the "Dán & tự tách" mode
// already uses, with EPUB_CHAPTER_REGEX_SOURCE as the (auto-selected)
// custom split pattern — reuses that pipeline's preview/edit/import UI
// as-is instead of a parallel structured-import code path.
export function epubChaptersToMarkedText(chapters) {
  return chapters
    .map((c) => `${CHAPTER_MARKER} ${c.title}\n\n${c.content}`)
    .join("\n\n");
}
