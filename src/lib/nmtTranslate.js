// AI translation engine (Văn bản gốc → QT thô).
// The 8 zh-vi models use the local CTranslate2 service on this computer. Web
// and desktop both call it the same way; the desktop app starts it
// automatically, web users must have it running (see tools/nmt/server.py).
// These are CTranslate2 (int8) builds of the same model family — not ONNX,
// and not a from-scratch quantization we invented: these are the model
// authors' own official ct2-int8 exports (or, for the couple that didn't
// publish one, our own conversion verified byte-identical to their process —
// see tools/nmt/convert_ct2.py). No torch/transformers needed at runtime for
// those, so the desktop app spawns the much lighter tools/nmt/server.py as a
// Tauri sidecar and this file just calls it over localhost.
//
// vp2vi is different: it's Vietnamese→Vietnamese (polishes an existing QT
// draft, not raw Chinese) and has no CTranslate2 build published, only a
// quantized ONNX export meant for browser use (yennguyen45/vp2vi-polish-web).
// So it skips the sidecar entirely and runs client-side via
// transformers.js/ONNX Runtime Web (WASM) — no local service required, which
// matters since this is the one model web-only users can actually use.
import { pipeline } from "@huggingface/transformers";
import { assertChineseSourceReadable } from "@/lib/chineseSourceCheck";
const SIDECAR_URL = "http://127.0.0.1:8787/translate";

// direction: "vi-vi" models skip the Chinese-source check below; onnxModel
// set means translateWithNmt() runs it client-side instead of via the sidecar.
export const NMT_MODELS = [
  { id: "HachimiMT-60", label: "HachimiMT-60", desc: "Webnovel/xianxia, 57M — mặc định" },
  { id: "HachimiMT-60-QT", label: "HachimiMT-60-QT", desc: "Như HachimiMT-60, văn phong QT (ta/ngươi/hắn/nàng)" },
  { id: "HachimiMT-30", label: "HachimiMT-30", desc: "37M, nhẹ hơn" },
  { id: "MoxhiMT-60", label: "MoxhiMT-60", desc: "Webnovel/xianxia, 57M" },
  { id: "MoxhiMT-30", label: "MoxhiMT-30", desc: "Truyện hiện đại/cross-domain, 36.5M" },
  { id: "MoxhiMT-30-QT", label: "MoxhiMT-30-QT", desc: "Như MoxhiMT-30, văn phong QT" },
  { id: "HirashibaMT-Medium", label: "HirashibaMT-Medium", desc: "62M" },
  { id: "HirashibaMT-Tiny", label: "HirashibaMT-Tiny", desc: "17M, siêu nhẹ" },
  { id: "vp2vi", label: "vp2vi", desc: "Việt→Việt, làm mượt bản QT thô (chạy trong trình duyệt)", direction: "vi-vi", onnxModel: "yennguyen45/vp2vi-polish-web" },
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

const clientTranslators = new Map();
function getClientTranslator(modelId) {
  if (!clientTranslators.has(modelId)) {
    clientTranslators.set(modelId, pipeline("translation", modelId, { dtype: "q8" }));
  }
  return clientTranslators.get(modelId);
}

async function translateViaClientOnnx(text, glossaryTerms, modelId) {
  const translator = await getClientTranslator(modelId);
  const lines = text.split("\n");
  const translated = [];
  for (const line of lines) {
    if (!line.trim()) {
      translated.push(line);
      continue;
    }
    const { locked, placeholders } = lockGlossary(line, glossaryTerms);
    const out = await translator(locked, { max_new_tokens: 512 });
    const rawText = Array.isArray(out) ? out[0].translation_text : out.translation_text;
    translated.push(placeholders.length ? unlockGlossary(rawText, placeholders).trim() : rawText);
  }
  return translated.join("\n");
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
  const model = NMT_MODELS.find((m) => m.id === getSidecarModelId());
  if (model?.direction !== "vi-vi") {
    assertChineseSourceReadable(text);
  }
  const t0 = performance.now();
  const translated = model?.onnxModel
    ? await translateViaClientOnnx(text, glossaryTerms, model.onnxModel)
    : await translateViaSidecar(text, glossaryTerms);
  return { text: translated, ms: Math.round(performance.now() - t0), engine: model?.onnxModel ? "browser" : "local" };
}
