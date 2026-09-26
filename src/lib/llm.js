// Multi-provider LLM dispatch: Gemini / OpenAI (GPT) / OrcaRouter.
import { recordGeminiCall } from "@/lib/geminiUsage";
import { ORCAROUTER_CHAT_ENDPOINT } from "@/lib/orcarouterModels";

const PROVIDER_KEY = "llm_provider";
const KEY_STORE = {
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  orcarouter: "orcarouter_api_key",
};
// A provider can have several keys (e.g. multiple free-tier Gemini accounts)
// so callLLM can rotate to the next one when one hits its quota, instead of
// the whole workflow stalling until the user notices and swaps keys by hand.
const KEYS_STORE = {
  gemini: "gemini_api_keys",
  openai: "openai_api_keys",
  orcarouter: "orcarouter_api_keys",
};
const KEY_CURSOR_STORE = {
  gemini: "gemini_api_key_cursor",
  openai: "openai_api_key_cursor",
  orcarouter: "orcarouter_api_key_cursor",
};

// Model IDs churn fast (providers rename/retire them every few months —
// see git history for the number of times this exact file needed a fix).
// So the model is a per-provider, user-editable setting stored alongside
// the API key, not a hardcoded constant — if a model gets retired or the
// user's account runs out of quota for it, they can switch from Settings
// without needing a code change.
const MODEL_KEY_STORE = {
  gemini: "gemini_model",
  openai: "openai_model",
  orcarouter: "orcarouter_model",
};

const DEFAULT_MODELS = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
  orcarouter: "orcarouter/free",
};
const ENDPOINT_KEY_STORE = {};
const DEFAULT_ENDPOINTS = { orcarouter: ORCAROUTER_CHAT_ENDPOINT };

const BASE_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
};

function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const PROVIDERS = ["gemini", "openai", "orcarouter"];

export function getEndpoint(provider) {
  const p=provider||getProvider();
  if (p === "orcarouter") return ORCAROUTER_CHAT_ENDPOINT;
  try{return (localStorage.getItem(ENDPOINT_KEY_STORE[p])||"").trim()||DEFAULT_ENDPOINTS[p]||"";}catch{return DEFAULT_ENDPOINTS[p]||"";}
}
export function saveEndpoint(provider,value) {
  if (provider === "orcarouter") return;
  if(!ENDPOINT_KEY_STORE[provider])return;
  const next=String(value||"").trim();
  if(next)localStorage.setItem(ENDPOINT_KEY_STORE[provider],next);else localStorage.removeItem(ENDPOINT_KEY_STORE[provider]);
}

export function getProvider() {
  try {
    const stored = localStorage.getItem(PROVIDER_KEY);
    return PROVIDERS.includes(stored) ? stored : "gemini";
  } catch {
    return "gemini";
  }
}

export function saveProvider(p) {
  localStorage.setItem(PROVIDER_KEY, p);
}

export function getApiKey(provider) {
  const p = provider || getProvider();
  try {
    return localStorage.getItem(KEY_STORE[p]) || "";
  } catch {
    return "";
  }
}

export function saveApiKey(provider, key) {
  localStorage.setItem(KEY_STORE[provider], key);
}

export function clearApiKey(provider) {
  localStorage.removeItem(KEY_STORE[provider]);
}

// Full key pool for a provider. Falls back to the legacy single-key slot so
// accounts that only ever set one key keep working unchanged.
export function getApiKeys(provider) {
  const p = provider || getProvider();
  try {
    const raw = localStorage.getItem(KEYS_STORE[p]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = [...new Set(parsed.map((k) => String(k || "").trim()).filter(Boolean))];
        if (cleaned.length) return cleaned;
      }
    }
  } catch {}
  const legacy = getApiKey(p).trim();
  return legacy ? [legacy] : [];
}

export function saveApiKeys(provider, keys) {
  const cleaned = [...new Set((keys || []).map((k) => String(k || "").trim()).filter(Boolean))];
  if (cleaned.length) {
    localStorage.setItem(KEYS_STORE[provider], JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(KEYS_STORE[provider]);
  }
  // Keep the legacy single-key slot in sync — other modules (video cover,
  // TTS) read a single key directly rather than going through callLLM.
  if (cleaned[0]) saveApiKey(provider, cleaned[0]);
  else clearApiKey(provider);
}

export function getKeyCursor(provider) {
  const p = provider || getProvider();
  try {
    const n = parseInt(localStorage.getItem(KEY_CURSOR_STORE[p]) || "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setKeyCursor(provider, idx) {
  try {
    localStorage.setItem(KEY_CURSOR_STORE[provider], String(idx));
  } catch {}
}

export function hasCustomAI() {
  return getApiKeys(getProvider()).length > 0;
}

export function getDefaultModel(provider) {
  return DEFAULT_MODELS[provider] || "";
}

export function getModel(provider) {
  const p = provider || getProvider();
  try {
    return (localStorage.getItem(MODEL_KEY_STORE[p]) || "").trim() || DEFAULT_MODELS[p];
  } catch {
    return DEFAULT_MODELS[p];
  }
}

export function saveModel(provider, model) {
  const trimmed = (model || "").trim();
  if (!trimmed) {
    localStorage.removeItem(MODEL_KEY_STORE[provider]);
    return;
  }
  localStorage.setItem(MODEL_KEY_STORE[provider], trimmed);
}

export function resetModel(provider) {
  localStorage.removeItem(MODEL_KEY_STORE[provider]);
}

// `image`, when provided, is { base64, mimeType } — a data-URL-free base64
// payload plus its MIME type (e.g. "image/png"). Gemini/OpenAI and compatible
// OrcaRouter vision models support image input; the Base44 managed AI path
// (InvokeLLM) is text-only.
function dispatchLLM(provider, key, prompt, image, model, maxTokens) {
  if (provider === "gemini") return callGeminiRaw(key, prompt, image, model, maxTokens);
  if (provider === "openai") return callOpenAI(key, prompt, image, model, maxTokens);
  if (provider === "orcarouter") return callOpenAICompatible(key, prompt, image, model, getEndpoint("orcarouter"), "OrcaRouter", maxTokens);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

// Rotates across every saved key for the current provider: starts at the
// last key that worked (so a dead/exhausted key at the front of the list
// doesn't get retried every single call), and on failure moves to the next
// one instead of surfacing the error — the whole point being that a batch
// job (beta reader, whole-story scan, ...) keeps running unattended past a
// single key's rate limit.
export async function callLLM(prompt, image, options = {}) {
  const provider = getProvider();
  const keys = getApiKeys(provider);
  if (!keys.length) {
    throw new Error("Chưa cấu hình API Key. Vào Cài đặt (⚙️) để nhập key.");
  }
  const model = getModel(provider);
  const maxTokens = options.maxTokens || 8192;
  const startIdx = Math.min(getKeyCursor(provider), keys.length - 1);

  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    const idx = (startIdx + i) % keys.length;
    try {
      const result = await dispatchLLM(provider, keys[idx], prompt, image, model, maxTokens);
      if (idx !== startIdx) setKeyCursor(provider, idx);
      return result;
    } catch (e) {
      lastError = e;
      // A different key cannot change request validation or content-policy
      // decisions. Retrying all saved keys only wastes quota and delays the
      // adaptive chunk fallback in Workspace.
      if (/PROHIBITED_CONTENT|\bSAFETY\b|invalid argument|bộ lọc nội dung|lớp bảo vệ bắt buộc/i.test(String(e?.message || ""))) break;
    }
  }
  const suffix = keys.length > 1 ? ` (đã thử hết ${keys.length} key)` : "";
  throw new Error((lastError?.message || "Lỗi gọi AI") + suffix);
}

export async function testLLMKey(provider, key, model) {
  if (!key.trim()) throw new Error("Vui lòng nhập API key");
  const m = model || getModel(provider);
  if (provider === "gemini") return testGeminiRaw(key, m);
  if (provider === "openai") return testOpenAI(key, m);
  if (provider === "orcarouter") return testOpenAICompatible(key, m, getEndpoint("orcarouter"), "OrcaRouter");
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

function geminiSafetyDetails(data, candidate) {
  const ratings = [...(data?.promptFeedback?.safetyRatings || []), ...(candidate?.safetyRatings || [])];
  const flagged = ratings
    .filter((rating) => rating?.blocked || ["HIGH", "MEDIUM"].includes(rating?.probability))
    .map((rating) => `${String(rating.category || "").replace("HARM_CATEGORY_", "")} ${rating.probability || ""}`.trim());
  return [...new Set(flagged)].join(", ");
}

async function callGeminiRaw(apiKey, prompt, image, model, maxTokens = 8192) {
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  const res = await fetch(`${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      // Do not send safetySettings here. Gemini 2.5/3 defaults the four
      // adjustable filters to OFF, while some currently served model/API
      // combinations reject the explicit OFF enum with INVALID_ARGUMENT.
      // Built-in core-harm protections still apply on Google's side.
      // Gemini 2.5+/3 models "think" before answering by default, and those
      // thinking tokens are billed against maxOutputTokens — so a call that
      // used to fit now silently loses part of its budget to invisible
      // reasoning and comes back MAX_TOKENS-truncated on the same input that
      // worked before. Translation/edit here needs the literal text carried
      // across, not extended reasoning, so switch thinking off.
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) {
    let msg = `Gemini ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    const safetyDetails = geminiSafetyDetails(data, candidate);
    const detailSuffix = safetyDetails ? `: ${safetyDetails}` : "";
    if (data?.promptFeedback?.blockReason) throw new Error(`Gemini chặn yêu cầu (${data.promptFeedback.blockReason}${detailSuffix}). Đây là lớp bảo vệ bắt buộc; hãy chia nhỏ đoạn hoặc dùng provider khác.`);
    if (finishReason === "SAFETY" || finishReason === "RECITATION") throw new Error(`Gemini từ chối trả lời (${finishReason}${detailSuffix}). Hãy chia nhỏ đoạn hoặc dùng provider khác.`);
    if (finishReason === "MAX_TOKENS") throw new Error("Gemini bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.");
    throw new Error("Gemini không trả kết quả");
  }
  if (finishReason === "MAX_TOKENS") throw new Error("Gemini bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.");
  recordGeminiCall(model);
  return text.trim();
}

async function callOpenAI(apiKey, prompt, image, model, maxTokens = 8192) {
  const content = image
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      ]
    : prompt;
  const res = await fetch(BASE_ENDPOINTS.openai, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    let msg = `OpenAI ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error("OpenAI không trả kết quả");
  if (data?.choices?.[0]?.finish_reason === "length") throw new Error("OpenAI bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.");
  return text.trim();
}

async function callOpenAICompatible(apiKey,prompt,image,model,endpoint,label,maxTokens=8192) {
  const content=image?[{type:"text",text:prompt},{type:"image_url",image_url:{url:`data:${image.mimeType};base64,${image.base64}`}}]:prompt;
  const payload={model,messages:[{role:"user",content}],temperature:0.3,max_tokens:maxTokens};
  const useProxy=label==="OrcaRouter";
  const localProxy=useProxy&&import.meta.env.DEV;
  const target=localProxy?"/orcarouter-api/v1/chat/completions":useProxy?"/api/orcarouter-chat":endpoint;
  let res;
  try {
    res=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify(useProxy&&!localProxy?{payload}:payload)});
  } catch {
    throw new Error(`${label}: không kết nối được máy chủ. Hãy kiểm tra mạng hoặc thử lại sau.`);
  }
  if(!res.ok){let msg=`${label} HTTP ${res.status}`;try{const e=await res.json();const detail=e?.error?.message||e?.message;const type=e?.error?.type;if(detail)msg=`${label}: ${detail}${type?` (${type})`:""}`;}catch{}throw new Error(msg);}
  const data=await res.json();const text=data?.choices?.[0]?.message?.content;
  if(!text||!String(text).trim())throw new Error(`${label} không trả kết quả`);
  if(data?.choices?.[0]?.finish_reason==="length")throw new Error(`${label} bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.`);
  return String(text).trim();
}

async function testGeminiRaw(apiKey, model) {
  const res = await fetch(`${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Trả lời đúng 2 từ: OK" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 20 },
    }),
  });
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  recordGeminiCall(model);
  return true;
}

async function testOpenAI(apiKey, model) {
  const res = await fetch(BASE_ENDPOINTS.openai, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 10,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return true;
}

async function testOpenAICompatible(apiKey,model,endpoint,label) {
  await callOpenAICompatible(apiKey,"Reply with exactly: OK",null,model,endpoint,label);
  return true;
}

// Reads an image File into { base64, mimeType } for callLLM's `image` param.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve({ base64, mimeType: file.type || "image/png" });
    };
    reader.onerror = () => reject(reader.error || new Error("Không đọc được file ảnh"));
    reader.readAsDataURL(file);
  });
}

// ---- Chunking & rough token/cost estimation ----
// Chapters can be very long; a single AI call can blow past the provider's
// output token cap (8192 here) and get silently truncated. Chunk long text
// along paragraph/sentence boundaries so translate/edit calls stay safe.

const CJK_REGEX = /[一-鿿㐀-䶿]/g;

// Rough heuristic only (not a real tokenizer): CJK text tokenizes far denser
// than Latin/Vietnamese text.
export function estimateTokens(text) {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const otherCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 1.7 + otherCount / 4);
}

// Indicative public pricing per 1M tokens (USD) for the models this app calls.
// These drift over time — treat as a ballpark, not a bill. Always check the
// provider's own pricing page for the real number.
const ROUGH_PRICE_PER_1M_TOKENS = {
  gemini: { input: 0.1, output: 0.4 },
  openai: { input: 0.15, output: 0.6 },
  orcarouter: { input: 0, output: 0 },
};

export function estimateCostUsd(provider, inputText, outputMultiplier = 1.3) {
  const price = ROUGH_PRICE_PER_1M_TOKENS[provider];
  if (!price) return null;
  const inputTokens = estimateTokens(inputText);
  const outputTokens = Math.ceil(inputTokens * outputMultiplier);
  const cost =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return { inputTokens, outputTokens, cost };
}

// Split long text into chunks along line (then sentence, then hard-cut)
// boundaries so no chunk exceeds maxChars. Splits on single "\n" (not
// "\n+") and tracks accumulation with a separate `started` flag rather than
// relying on truthiness of `current` — both are needed to preserve blank
// lines exactly: a run like "para1\n\npara2" must come back out the same
// way, including when a chunk happens to start with a blank line.
export function chunkText(text, maxChars = 3000) {
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const lines = text.split("\n");
  const chunks = [];
  let current = "";
  let started = false;

  const flushCurrent = () => {
    if (started) {
      chunks.push(current);
      current = "";
      started = false;
    }
  };

  for (const para of lines) {
    const candidate = started ? `${current}\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      started = true;
      continue;
    }
    flushCurrent();
    if (para.length <= maxChars) {
      current = para;
      started = true;
      continue;
    }
    // Single line longer than maxChars: split by sentence, then hard-cut.
    const sentences = para.split(/(?<=[.!?。!?])\s+/);
    let piece = "";
    for (const s of sentences) {
      const candidatePiece = piece ? `${piece} ${s}` : s;
      if (candidatePiece.length <= maxChars) {
        piece = candidatePiece;
        continue;
      }
      if (piece) {
        chunks.push(piece);
        piece = "";
      }
      if (s.length <= maxChars) {
        piece = s;
      } else {
        let rest = s;
        while (rest.length > maxChars) {
          chunks.push(rest.slice(0, maxChars));
          rest = rest.slice(maxChars);
        }
        piece = rest;
      }
    }
    current = piece;
    started = true;
  }
  flushCurrent();
  return chunks;
}
