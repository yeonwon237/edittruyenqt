// Desktop-only supplementary QA signal: an AI speaker classifier
// (DanVP/moxhimt-pronoun-clf, ported to run without torch — see
// tools/nmt/pronoun_clf_np.py) exposed by the Tauri sidecar's /speaker
// endpoint. This module is pure glue between the chapter's raw Chinese
// source + the resolved pronoun QA lookup shape qualityCheck.js already
// uses for src/lib/qtPronounEvidence.js — same "supporting evidence only"
// contract: qualityCheck.js only ever reads clfEvidence.speaker/topProb to
// append a line of context to an issue's detail text, never to pick a
// role or auto-fix (see the speakerClfLookup usage in scanContextualAddress).
//
// The model's own author documents ~50% speaker accuracy on validation data
// ("PoC, not production") — this module makes no attempt to filter that;
// qualityCheck.js is responsible for treating the result as informational.
import { isDesktopApp } from "@/lib/platform";

const SIDECAR_SPEAKER_URL = "http://127.0.0.1:8787/speaker";

// Splits into non-empty lines with byte-ish offsets into the ORIGINAL
// string — mirrors qtPronounEvidence.js's splitNonEmptyLines so the two
// lookups line up the same way for the same edited text.
function splitNonEmptyLines(text) {
  const lines = [];
  let offset = 0;
  for (const raw of String(text || "").split("\n")) {
    const trimmed = raw.trim();
    if (trimmed) lines.push({ text: trimmed, offset: offset + (raw.length - raw.trimStart().length) });
    offset += raw.length + 1;
  }
  return lines;
}

// Pairs raw Chinese source lines with edited (Vietnamese) lines by index,
// same strict "abstain on any mismatch" rule as qtPronounEvidence's
// alignParagraphs — a chapter where paragraph counts don't line up 1:1
// makes per-paragraph attribution unreliable to place at a position.
function alignRawToEdited(rawOriginal, edited) {
  const rawLines = splitNonEmptyLines(rawOriginal);
  const editedLines = splitNonEmptyLines(edited);
  if (!rawLines.length || rawLines.length !== editedLines.length) return [];
  return rawLines.map((raw, i) => ({
    zh: raw.text,
    ctx: i > 0 ? rawLines[i - 1].text : "",
    editedOffset: editedLines[i].offset,
    editedEnd: editedLines[i].offset + editedLines[i].text.length,
  }));
}

const SPECIAL_SPEAKER_LABELS = { "旁白": "(lời dẫn truyện)", "自语": "(tự nói một mình)" };

// Calls the sidecar once for every paragraph in the chapter (one HTTP
// round trip total, not one per quote) and returns a lookup in the same
// {start, end, evidence} shape qualityCheck.js's qtEvidenceLookup uses, so
// callers can pass it straight through as `speakerClfLookup`. Desktop only:
// resolves to [] immediately on web, or if the sidecar isn't reachable
// (model still loading, etc) — callers should treat this as best-effort.
//
// `zhToViName`: Map of Chinese source_term → this project's glossary
// translation (built from glossaryTerms, category "Tên người"). The
// classifier only understands Chinese candidate names (it searches the raw
// source text), but qualityCheck.js's world is entirely Vietnamese — every
// name it returns is translated back through this map before being surfaced,
// so "AI đoán người nói: ..." never shows a stray Chinese name. A Chinese
// name the map doesn't cover is dropped rather than shown untranslated.
export async function buildSpeakerClfLookup(rawOriginal, edited, zhToViName) {
  if (!isDesktopApp()) return [];
  const aligned = alignRawToEdited(rawOriginal, edited);
  if (!aligned.length || !zhToViName?.size) return [];

  const candidates = [...zhToViName.keys()];
  const items = aligned.map((p, i) => ({ id: String(i), ctx: p.ctx, zh: p.zh, candidates }));
  let data;
  try {
    const response = await fetch(SIDECAR_SPEAKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) return [];
    data = await response.json();
  } catch {
    return [];
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((result, i) => {
      const paragraph = aligned[Number(result.id ?? i)];
      if (!paragraph || !result.speaker || result.speaker === "UNKNOWN") return null;
      const speaker = SPECIAL_SPEAKER_LABELS[result.speaker] || zhToViName.get(result.speaker);
      if (!speaker) return null;
      return {
        start: paragraph.editedOffset,
        end: paragraph.editedEnd,
        evidence: { speaker, topProb: result.top_prob ?? 0, margin: result.margin ?? 0 },
      };
    })
    .filter(Boolean);
}
