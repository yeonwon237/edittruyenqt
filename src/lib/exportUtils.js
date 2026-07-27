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