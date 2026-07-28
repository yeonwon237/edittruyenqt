// Lightweight word-level diff (no external dependency) used to show exactly
// what an AI pass changed, rather than silently swapping the whole text and
// leaving the user to spot differences by eye.

// Longest-common-subsequence word diff between two lines.
function diffWords(oldLine, newLine) {
  const a = oldLine.split(/\s+/).filter(Boolean);
  const b = newLine.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "removed", text: a[i] });
      i += 1;
    } else {
      ops.push({ type: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "removed", text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "added", text: b[j] });
    j += 1;
  }
  return ops;
}

// Collapses a word-diff into readable "...context [removed → added] context..."
// change entries — one per contiguous changed span, not per word, so
// "ngươi" swapped twice in one line shows up as two separate entries with
// their own surrounding context rather than one giant highlighted blob.
function summarizeLineDiff(oldLine, newLine, contextWords = 4) {
  if (oldLine === newLine) return [];
  const ops = diffWords(oldLine, newLine);
  const changes = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "same") {
      k += 1;
      continue;
    }
    let end = k;
    while (end < ops.length && ops[end].type !== "same") end += 1;
    changes.push({
      before: ops.slice(Math.max(0, k - contextWords), k).map((o) => o.text).join(" "),
      removed: ops.slice(k, end).filter((o) => o.type === "removed").map((o) => o.text).join(" "),
      added: ops.slice(k, end).filter((o) => o.type === "added").map((o) => o.text).join(" "),
      after: ops.slice(end, end + contextWords).map((o) => o.text).join(" "),
    });
    k = end;
  }
  return changes;
}

/**
 * Line-by-line diff between two texts, expressed as a flat list of word-level
 * changes with a bit of surrounding context for readability.
 * @returns {Array<{line:number, before:string, removed:string, added:string, after:string}>}
 */
export function diffTextChanges(oldText, newText) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const changes = [];
  for (let li = 0; li < maxLen; li += 1) {
    const oldLine = oldLines[li] ?? "";
    const newLine = newLines[li] ?? "";
    if (oldLine === newLine) continue;
    summarizeLineDiff(oldLine, newLine).forEach((c) => changes.push({ line: li + 1, ...c }));
  }
  return changes;
}
