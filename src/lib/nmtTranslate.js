// AI translation engine (Văn bản gốc → QT thô).
// Web: calls the private Lily Translation API through a same-origin Vercel
// function. The VPS Bearer key never reaches browser JavaScript.
// Desktop: runs CTranslate2 (int8) builds of the same model family — not
// ONNX, and not a from-scratch quantization we invented: these are the
// model authors' own official ct2-int8 exports (or, for the couple that
// didn't publish one, our own conversion verified byte-identical to their
// process — see tools/nmt/convert_ct2.py). No torch/transformers needed at
// runtime, so the desktop app spawns the much lighter tools/nmt/server.py
// as a Tauri sidecar and this file just calls it over localhost instead of
// loading the WASM pipeline.
import { isDesktopApp } from "@/lib/platform";
import { supabase } from "@/api/supabaseClient";

const SIDECAR_URL = "http://127.0.0.1:8787/translate";
const WEB_PROXY_URL = "/api/lily-translation";
const WEB_POLL_INTERVAL_MS = 500;
const WEB_JOB_TIMEOUT_MS = 12 * 60 * 1000;

// Desktop only — all 8 translate Chinese source → Vietnamese (matches the
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
    throw new Error("Không kết nối được máy dịch nội bộ — nếu app vừa mở, model có thể đang tải lần đầu, đợi rồi thử lại.");
  }
  if (!response.ok) throw new Error(`Máy dịch nội bộ lỗi (${response.status})`);
  const data = await response.json();
  const translatedLines = String(data.text || "").split("\n");
  return translatedLines
    .map((line, idx) => (locks[idx]?.placeholders.length ? unlockGlossary(line, locks[idx].placeholders).trim() : line))
    .join("\n");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function webProxyRequest(body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Vui lòng đăng nhập lại để dùng dịch AI VPS.");
  let response;
  try {
    response = await fetch(WEB_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Không kết nối được dịch AI VPS. Vui lòng kiểm tra mạng và thử lại.");
  }
  const data = await response.json().catch(() => null);
  if (!data) throw new Error("API dịch chưa sẵn sàng hoặc trả dữ liệu không hợp lệ.");
  if (!response.ok) throw Object.assign(new Error(data.error || `Dịch AI VPS lỗi (${response.status})`), { status: response.status, code: data.code });
  return data;
}

async function translateViaWebApi(text, glossaryTerms) {
  const created = await webProxyRequest({
    action: "create",
    source: text,
    model_key: getSidecarModelId(),
    glossary_rows: glossaryTerms,
  });
  if (!created.job_token) throw new Error("API dịch không trả mã tác vụ.");
  const deadline = Date.now() + WEB_JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(WEB_POLL_INTERVAL_MS);
    const job = await webProxyRequest({ action: "status", job_token: created.job_token });
    if (job.status === "completed") {
      const textResult = String(job.result?.result_text || "");
      if (!textResult.trim()) throw new Error("Model hoàn tất nhưng không trả bản dịch.");
      return textResult;
    }
    if (job.status === "error") throw new Error(job.error || "Model dịch thất bại.");
    if (!['queued', 'running'].includes(job.status)) throw new Error("Trạng thái tác vụ dịch không hợp lệ.");
  }
  throw new Error("Tác vụ dịch quá thời gian chờ 12 phút. Kết quả trên VPS không bị hủy.");
}

export async function translateWithNmt(text, glossaryTerms = []) {
  const t0 = performance.now();
  let translated;
  if (isDesktopApp()) {
    translated = await translateViaSidecar(text, glossaryTerms);
  } else {
    try {
      translated = await translateViaSidecar(text, glossaryTerms);
    } catch {
      translated = await translateViaWebApi(text, glossaryTerms);
    }
  }
  return { text: translated, ms: Math.round(performance.now() - t0) };
}
