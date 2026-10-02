// Keep existing paragraph breaks (including scene spacing) and only expand
// single line breaks. Preserve indentation, words, and the original EOL style.
export function spaceParagraphs(text) {
  const parts = String(text ?? "").split(/(\r\n|\n|\r)/);
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i - 1].trim() && parts[i + 1].trim()) parts[i] += parts[i];
  }
  return parts.join("");
}
