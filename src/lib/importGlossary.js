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
  const sourceIdx = findIdx(headers, ["source_term", "source", "term", "word", "tu goc", "từ gốc", "goc"]);
  const transIdx = findIdx(headers, ["translation", "meaning", "trans", "ban dich", "bản dịch", "dich", "dịch"]);
  const catIdx = findIdx(headers, ["category", "cat", "type", "danh muc", "danh mục", "loai", "loại"]);
  const notesIdx = findIdx(headers, ["notes", "note", "ghi chu", "ghi chú", "description", "mota", "mô tả"]);
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

function splitLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = false;
      } else current += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      result.push(current);
      current = "";
    } else current += c;
  }
  result.push(current);
  return result;
}

function findIdx(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return 0;
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