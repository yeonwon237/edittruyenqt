import { splitLine, findColumnIndex } from "./csvUtils";

export function parseGlossaryFile(content, filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "json") return parseJSON(content);
  if (ext === "csv" || ext === "tsv") return parseCSV(content, ext === "tsv");
  // Try JSON first, then CSV
  try {
    return parseJSON(content);
  } catch {
    return parseCSV(content, false);
  }
}

function parseJSON(content) {
  const data = JSON.parse(content);
  if (Array.isArray(data)) return data.map(normalizeTerm).filter(valid);
  if (data.terms && Array.isArray(data.terms))
    return data.terms.map(normalizeTerm).filter(valid);
  if (data.length > 0 || data.terms)
    return (data.terms || []).map(normalizeTerm).filter(valid);
  throw new Error("File JSON không chứa danh sách thuật ngữ");
}

function parseCSV(content, isTSV) {
  const delimiter = isTSV ? "\t" : ",";
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0], delimiter).map((h) =>
    h.trim().toLowerCase()
  );
  const sourceIdx = findColIdxOrFirst(headers, ["source_term", "source", "term", "word", "tu goc", "từ gốc", "goc"]);
  const transIdx = findColIdxOrFirst(headers, ["translation", "meaning", "trans", "ban dich", "bản dịch", "dich", "dịch"]);
  const catIdx = findColIdxOrFirst(headers, ["category", "cat", "type", "danh muc", "danh mục", "loai", "loại"]);
  const notesIdx = findColIdxOrFirst(headers, ["notes", "note", "ghi chu", "ghi chú", "description", "mota", "mô tả"]);
  const terms = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    const term = normalizeTerm({
      source_term: cols[sourceIdx] || "",
      translation: cols[transIdx] || "",
      category: cols[catIdx] || "Khác",
      notes: cols[notesIdx] || "",
      custom_fields: {},
    });
    if (valid(term)) terms.push(term);
  }
  return terms;
}

// Preserves this file's original behavior of defaulting to the first
// column when no header name matches (rather than csvUtils' -1 "not found").
function findColIdxOrFirst(headers, candidates) {
  const idx = findColumnIndex(headers, candidates);
  return idx >= 0 ? idx : 0;
}

function normalizeTerm(t) {
  return {
    source_term: (t.source_term || t.term || t.word || "").toString().trim(),
    translation: (t.translation || t.meaning || "").toString().trim(),
    category: (t.category || t.type || "Khác").toString().trim() || "Khác",
    notes: (t.notes || "").toString().trim(),
    custom_fields: t.custom_fields || {},
  };
}

function valid(t) {
  return t.source_term && t.translation;
}