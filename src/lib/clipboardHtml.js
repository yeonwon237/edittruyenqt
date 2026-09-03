const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Rebuilds paragraph structure as real <p> blocks. A plain-text clipboard
// write only carries \n characters, and most rich-text editors (Wattpad,
// Google Docs, Word...) collapse a blank-line paragraph break down to
// nothing when pasting plain text — this gives them an HTML alternative
// that keeps each paragraph as its own block, so the spacing survives.
export function textToParagraphHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Writes both text/plain and text/html to the clipboard so paste targets
// that understand HTML keep paragraph spacing, while plain-text-only
// targets still get a correct fallback.
export async function copyRichText(text) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([textToParagraphHtml(text)], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Some browsers restrict multi-format clipboard writes (permissions,
      // insecure context, etc.) — fall back to plain text below.
    }
  }
  await navigator.clipboard.writeText(text);
}
