// AI translation engine (Văn bản gốc → QT thô).
// Web and desktop both use the local CTranslate2 service on this computer.
// The desktop app starts it automatically; web users must have it running.
// The models are CTranslate2 (int8) builds of the same model family — not
// ONNX, and not a from-scratch quantization we invented: these are the
// model authors' own official ct2-int8 exports (or, for the couple that
// didn't publish one, our own conversion verified byte-identical to their
// process — see tools/nmt/convert_ct2.py). No torch/transformers needed at
// runtime, so the desktop app spawns the much lighter tools/nmt/server.py
// as a Tauri sidecar and this file just calls it over localhost instead of
// loading the WASM pipeline.
const SIDECAR_URL = "http://127.0.0.1:8787/translate";

// All 8 translate Chinese source → Vietnamese (matches the
// sidecar's MODEL_CONFIGS keys in tools/nmt/server.py). DanVP/vp2vi is
// deliberately not here: it's Vietnamese→Vietnamese (polishes an existing QT
// draft, not raw Chinese), a different pipeline stage than this button —
// belongs with a future "beta/polish" feature, not this translate picker.
export const NMT_MODELS = [
  { id: "HachimiMT-60", label: "HachimiMT-60", desc: "Webnovel/xianxia, 57M — mặc định" },
  { id: "HachimiMT-60-QT", label: "HachimiMT-60-QT", desc: "Như HachimiMT-60, văn phong QT (ta/ngươi/hắn/nàng)" },
  { id: "HachimiMT-30", label: "HachimiMT-30", desc: "37M, nhẹ hơn" },
  { id: "MoxhiMT-60", label: "MoxhiMT-60", desc: "Webnovel/xianxia, 57M" },
  { id: "MoxhiMT-30", label: "MoxhiMT-30", desc: "Truyện hiện đại/cross-domain, 36.5M" },
  { id: "MoxhiMT-30-QT", label: "MoxhiMT-30-QT", desc: "Như MoxhiMT-30, văn phong QT" },
  { id: "HirashibaMT-Medium", label: "HirashibaMT-Medium", desc: "62M" },
  { id: "HirashibaMT-Tiny", label: "HirashibaMT-Tiny", desc: "17M, siêu nhẹ" },
];
const NMT_MODEL_STORAGE_KEY = "etq_nmt_model_id";

export function getSidecarModelId() {
  try {
    const saved = localStorage.getItem(NMT_MODEL_STORAGE_KEY);
    if (saved && NMT_MODELS.some((m) => m.id === saved)) return saved;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return NMT_MODELS[0].id;
}

export function setSidecarModelId(id) {
  try {
    localStorage.setItem(NMT_MODEL_STORAGE_KEY, id);
  } catch {
    // localStorage unavailable — selection just won't persist across reloads
  }
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
    const rest = out.slice(leadName.length);
    const fixedRest = rest.replace(/^(\s+)([A-ZÀ-Ỹ])/, (m, space, c) => space + c.toLowerCase());
    out = leadName + fixedRest;
  }
  return out;
}

async function translateViaSidecar(text, glossaryTerms) {
  const lines = text.split("\n");
  const locks = lines.map((line) => (line.trim() ? lockGlossary(line, glossaryTerms) : { locked: line, placeholders: [] }));
  const lockedText = locks.map((l) => l.locked).join("\n");

  let response;
  try {
    response = await fetch(SIDECAR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lockedText, model_id: getSidecarModelId() }),
    });
  } catch {
    throw new Error("Không kết nối được model trên máy (127.0.0.1:8787). Hãy mở ứng dụng/dịch vụ dịch local rồi thử lại.");
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `Máy dịch nội bộ lỗi (${response.status})`);
  }
  const data = await response.json();
  const translatedLines = String(data.text || "").split("\n");
  return translatedLines
    .map((line, idx) => (locks[idx]?.placeholders.length ? unlockGlossary(line, locks[idx].placeholders).trim() : line))
    .join("\n");
}

export async function translateWithNmt(text, glossaryTerms = []) {
  const t0 = performance.now();
  const translated = await translateViaSidecar(text, glossaryTerms);
  return { text: translated, ms: Math.round(performance.now() - t0), engine: "local" };
}
