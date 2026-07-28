// Small shared CSV/TSV helpers used by the glossary and chapter file
// importers (and by CSV export, for the escaping half).

// Splits one line respecting double-quoted fields (with "" as an escaped
// quote inside a quoted field), matching standard CSV/TSV quoting rules.
export function splitLine(line, delimiter) {
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

// Finds the column index whose header matches (exactly, or as a substring)
// one of the given candidate names — lets a header row be in Vietnamese,
// English, with/without diacritics, etc.
export function findColumnIndex(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Quote a field for CSV output if it contains the delimiter, a quote, or a
// newline.
export function escapeCsvField(value, delimiter = ",") {
  const str = (value ?? "").toString();
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
