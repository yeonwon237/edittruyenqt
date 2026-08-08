import React from "react";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits text into segments, wrapping any glossary source_term occurrences
 * in clickable highlight spans.
 */
export function highlightTerms(text, terms, onTermClick) {
  if (!text) return null;
  if (!terms || terms.length === 0) return text;

  const valid = terms.filter((t) => t.source_term && t.source_term.trim().length > 0);
  if (valid.length === 0) return text;

  const sorted = [...valid].sort((a, b) => b.source_term.length - a.source_term.length);
  const pattern = sorted.map((t) => escapeRegex(t.source_term)).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const matched = sorted.find(
      (t) => t.source_term.toLowerCase() === part.toLowerCase()
    );
    if (matched) {
      return React.createElement(
        "span",
        {
          key: i,
          className: "glossary-highlight",
          title: `${matched.translation}${matched.notes ? " — " + matched.notes : ""}`,
          onClick: (e) => {
            e.stopPropagation();
            onTermClick?.(matched);
          },
        },
        part
      );
    }
    return part;
  });
}

const CJK_RUN_REGEX = /[一-鿿㐀-䶿]+/g;

/**
 * Post-process the array/string returned by highlightTerms(), wrapping any
 * leftover Chinese character runs in a red warning span — a "còn sót tiếng
 * Trung" flag for the final edited text. Elements already produced by
 * highlightTerms (glossary highlight spans) are left untouched; only plain
 * string segments are scanned.
 */
export function highlightForeignChars(nodes) {
  const arr = Array.isArray(nodes) ? nodes : [nodes];
  const result = [];
  arr.forEach((node, idx) => {
    if (typeof node !== "string") {
      result.push(node);
      return;
    }
    const matches = node.match(CJK_RUN_REGEX);
    if (!matches) {
      result.push(node);
      return;
    }
    const parts = node.split(CJK_RUN_REGEX);
    parts.forEach((part, i) => {
      if (part) result.push(part);
      if (matches[i]) {
        result.push(
          React.createElement(
            "span",
            {
              key: `foreign-${idx}-${i}`,
              className: "foreign-char-warning",
              title: "Còn sót ký tự Hán/Trung chưa dịch",
            },
            matches[i]
          )
        );
      }
    });
  });
  return result;
}

// Total count of leftover CJK characters — used for a quick header badge
// so the warning is visible even without switching the panel to view mode.
export function countForeignChars(text) {
  if (!text) return 0;
  const matches = text.match(CJK_RUN_REGEX);
  return matches ? matches.reduce((sum, m) => sum + m.length, 0) : 0;
}

/** UI-only QA decoration. It never mutates the source string, so exports and
 * saved chapter content remain plain text. Overlapping findings are merged. */
export function highlightQualityIssues(text, issues, { overlay = false } = {}) {
  if (!text || !issues?.length) return text;
  const ranges = issues
    .filter((issue) => Number.isInteger(issue.start) && Number.isInteger(issue.end) && issue.end > issue.start)
    .map((issue) => ({ start: issue.start, end: issue.end, labels: [issue.label] }))
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((merged, range) => {
      const last = merged.at(-1);
      if (last && range.start < last.end) {
        last.end = Math.max(last.end, range.end);
        last.labels.push(...range.labels);
      } else merged.push(range);
      return merged;
    }, []);
  const result = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) result.push(text.slice(cursor, range.start));
    result.push(React.createElement("span", {
      key: `qa-${range.start}-${index}`,
      className: overlay
        ? "rounded-sm bg-red-200/70 border-b-2 border-red-500"
        : "rounded-sm bg-red-100 text-inherit underline decoration-red-500 decoration-2 underline-offset-2",
      title: [...new Set(range.labels)].join(" · ")
    }, text.slice(range.start, range.end)));
    cursor = range.end;
  });
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

export const CATEGORY_STYLES = {
  "Tên người": "bg-rose-100 text-rose-700 border-rose-200",
  "Địa danh": "bg-sky-100 text-sky-700 border-sky-200",
  "Chiêu thức": "bg-amber-100 text-amber-700 border-amber-200",
  "Vật phẩm": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Xưng hô": "bg-violet-100 text-violet-700 border-violet-200",
  "Cấp bậc": "bg-orange-100 text-orange-700 border-orange-200",
  "Khác": "bg-slate-100 text-slate-600 border-slate-200",
};

export const CATEGORY_EMOJI = {
  "Tên người": "👤",
  "Địa danh": "🗺️",
  "Chiêu thức": "⚔️",
  "Vật phẩm": "💎",
  "Xưng hô": "💬",
  "Cấp bậc": "🎖️",
  "Khác": "📌",
};

export const CATEGORIES = [
  "Tên người",
  "Địa danh",
  "Chiêu thức",
  "Vật phẩm",
  "Xưng hô",
  "Cấp bậc",
  "Khác",
];
