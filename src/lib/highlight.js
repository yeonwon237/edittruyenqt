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