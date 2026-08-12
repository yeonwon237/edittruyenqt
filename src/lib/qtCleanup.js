const DIVIDER = String.raw`[=＝]{5,}`;
const PART_TITLE = String.raw`phần\s*\d+(?:\s*[\/-]\s*\d+)?`;
const TOOL_PART_BLOCK = new RegExp(
  String.raw`^[ \t]*${DIVIDER}[ \t]*\r?\n[ \t]*${PART_TITLE}[ \t]*\r?\n[ \t]*${DIVIDER}[ \t]*(?:\r?\n)?`,
  "gimu"
);

export function cleanToolPartMarkers(value) {
  const source = String(value || "");
  let removed = 0;
  const text = source.replace(TOOL_PART_BLOCK, () => {
    removed += 1;
    return "";
  }).replace(/\n{3,}/g, "\n\n");
  return { text, removed, changed: removed > 0 };
}
