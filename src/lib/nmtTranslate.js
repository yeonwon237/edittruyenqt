// AI translation engine (Văn bản gốc → QT thô) — runs entirely client-side via
// transformers.js/ONNX Runtime Web (WASM), no server/API cost. Model weights
// (~55-60MB, quantized) download once on first use and are cached by the
// browser afterward. See tools/nmt/ for the offline evaluation that picked
// this model and the "[N]" glossary-lock format (verified against "<N>",
// which the model sometimes corrupts mid-generation — see test_glossary_lock.mjs).
import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "DanVP/MoxhiMT-30-onnx";

let translatorPromise = null;
function getTranslator() {
  if (!translatorPromise) {
    translatorPromise = pipeline("translation", MODEL_ID, { dtype: "q8" });
  }
  return translatorPromise;
}

function lockGlossary(text, terms) {
  const sorted = [...terms]
    .filter((t) => t?.source_term && t?.translation)
    .sort((a, b) => b.source_term.length - a.source_term.length);
  const placeholders = [];
  let out = "";
  let i = 0;
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (text.startsWith(term.source_term, i)) {
        out += `[${placeholders.length}]`;
        placeholders.push(term.translation);
        i += term.source_term.length;
        continue outer;
      }
    }
    out += text[i];
    i += 1;
  }
  return { locked: out, placeholders };
}

// Substitutes placeholders back with their glossary translation, and fixes
// the case where the model capitalizes the word right after a placeholder
// that sat at the very start of the line (it doesn't know a name is about
// to fill that spot, so it treats the placeholder itself as sentence-start).
function unlockGlossary(text, placeholders) {
  const startedWithPlaceholder = /^\s*\[\s*0\s*\]/.test(text);
  let out = text.replace(/\[\s*(\d+)\s*\]/g, (match, idx) => {
    const name = placeholders[Number(idx)];
    return name === undefined ? match : name;
  });
  const leadName = placeholders[0];
  if (startedWithPlaceholder && leadName && out.startsWith(leadName)) {
    // The model saw the placeholder as the first token and capitalized the
    // word after it as if it were sentence-initial; undo that once the real
    // (already multi-syllable-capitalized) name has taken its place.
    const rest = out.slice(leadName.length);
    const fixedRest = rest.replace(/^(\s+)([A-ZÀ-Ỹ])/, (m, space, c) => space + c.toLowerCase());
    out = leadName + fixedRest;
  }
  return out;
}

async function translateLine(translator, line, glossaryTerms) {
  if (!line.trim()) return line;
  const { locked, placeholders } = lockGlossary(line, glossaryTerms);
  const out = await translator(locked, { max_new_tokens: 512 });
  const rawText = Array.isArray(out) ? out[0].translation_text : out.translation_text;
  return placeholders.length ? unlockGlossary(rawText, placeholders).trim() : rawText;
}

export async function translateWithNmt(text, glossaryTerms = []) {
  const t0 = performance.now();
  const translator = await getTranslator();
  const lines = text.split("\n");
  const translated = [];
  for (const line of lines) {
    translated.push(await translateLine(translator, line, glossaryTerms));
  }
  return { text: translated.join("\n"), ms: Math.round(performance.now() - t0) };
}
