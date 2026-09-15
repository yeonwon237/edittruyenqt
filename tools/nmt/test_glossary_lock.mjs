import { pipeline } from "@huggingface/transformers";

// Same longest-match-first idea as src/lib/qtGlossary.js glossarySpans,
// but for locking terms before NMT translation instead of dictionary lookup.
function lockGlossary(text, terms) {
  const sorted = [...terms].sort((a, b) => b.source_term.length - a.source_term.length);
  const placeholders = [];
  let out = "";
  let i = 0;
  outer: while (i < text.length) {
    for (const term of sorted) {
      if (text.startsWith(term.source_term, i)) {
        const tag = `[${placeholders.length}]`;
        placeholders.push(term.translation);
        out += tag;
        i += term.source_term.length;
        continue outer;
      }
    }
    out += text[i];
    i += 1;
  }
  return { locked: out, placeholders };
}

function unlockGlossary(text, placeholders) {
  return text.replace(/\[\s*(\d+)\s*\]/g, (m, idx) => placeholders[Number(idx)] ?? m);
}

const glossary = [
  { source_term: "祁溪", translation: "Kỷ Khê" },
  { source_term: "温锦", translation: "Ôn Cẩm" },
];

const samples = [
  "他让祁溪流血，也要加倍讨回来。",
  "温锦没点评她的狂妄发言。",
  "祁溪看着温锦，一言不发。",
];

const translator = await pipeline("translation", "DanVP/MoxhiMT-30-onnx", { dtype: "q8" });

for (const src of samples) {
  const { locked, placeholders } = lockGlossary(src, glossary);
  const out = await translator(locked, { max_new_tokens: 128 });
  const rawText = Array.isArray(out) ? out[0].translation_text : out.translation_text;
  const finalText = unlockGlossary(rawText, placeholders);
  console.log(`\nSRC:    ${src}`);
  console.log(`LOCKED: ${locked}`);
  console.log(`MODEL:  ${rawText}`);
  console.log(`FINAL:  ${finalText}`);
}
