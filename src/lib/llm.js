// Multi-provider LLM dispatch: Gemini / OpenAI (GPT) / Anthropic (Claude).
import { recordGeminiCall } from "@/lib/geminiUsage";
import { STALI_CHAT_ENDPOINT } from "@/lib/staliModels";

const PROVIDER_KEY = "llm_provider";
const KEY_STORE = {
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  claude: "claude_api_key",
  stali: "stali_api_key",
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
  claude: "claude_model",
  stali: "stali_model",
};

const DEFAULT_MODELS = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
  claude: "claude-sonnet-4-6",
  stali: "gemini-3.5-flash",
};
const ENDPOINT_KEY_STORE = { stali:"stali_api_endpoint" };
const DEFAULT_ENDPOINTS = { stali: STALI_CHAT_ENDPOINT };

const BASE_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const PROVIDERS = ["gemini", "openai", "claude", "stali"];

export function getEndpoint(provider) {
  const p=provider||getProvider();
  if (p === "stali") return STALI_CHAT_ENDPOINT;
  try{return (localStorage.getItem(ENDPOINT_KEY_STORE[p])||"").trim()||DEFAULT_ENDPOINTS[p]||"";}catch{return DEFAULT_ENDPOINTS[p]||"";}
}
export function saveEndpoint(provider,value) {
  if (provider === "stali") return;
  if(!ENDPOINT_KEY_STORE[provider])return;
  const next=String(value||"").trim();
  if(next)localStorage.setItem(ENDPOINT_KEY_STORE[provider],next);else localStorage.removeItem(ENDPOINT_KEY_STORE[provider]);
}

export function getProvider() {
  try {
    return localStorage.getItem(PROVIDER_KEY) || "gemini";
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

export function hasCustomAI() {
  return !!getApiKey(getProvider()).trim();
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
// payload plus its MIME type (e.g. "image/png"). Only Gemini/OpenAI/Claude
// (this custom-key path) support image input; the Base44 managed AI path
// (InvokeLLM) is text-only.
export async function callLLM(prompt, image, options = {}) {
  const provider = getProvider();
  const key = getApiKey(provider).trim();
  if (!key) {
    throw new Error("Chưa cấu hình API Key. Vào Cài đặt (⚙️) để nhập key.");
  }
  const model = getModel(provider);
  const maxTokens = options.maxTokens || 8192;
  if (provider === "gemini") return callGeminiRaw(key, prompt, image, model, maxTokens);
  if (provider === "openai") return callOpenAI(key, prompt, image, model, maxTokens);
  if (provider === "claude") return callClaude(key, prompt, image, model, maxTokens);
  if (provider === "stali") return callOpenAICompatible(key, prompt, image, model, getEndpoint("stali"), "STALI", maxTokens);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

export async function testLLMKey(provider, key, model) {
  if (!key.trim()) throw new Error("Vui lòng nhập API key");
  const m = model || getModel(provider);
  if (provider === "gemini") return testGeminiRaw(key, m);
  if (provider === "openai") return testOpenAI(key, m);
  if (provider === "claude") return testClaude(key, m);
  if (provider === "stali") return testStali(key, m);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

async function callGeminiRaw(apiKey, prompt, image, model, maxTokens = 8192) {
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  const res = await fetch(`${geminiEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) throw new Error("Gemini không trả kết quả");
  if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("Gemini bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.");
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
  const useProxy=label==="STALI";
  const localStali=useProxy&&import.meta.env.DEV;
  const target=localStali?"/stali-api/v1/chat/completions":useProxy?"/api/stali-chat":endpoint;
  let res;
  try {
    res=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify(useProxy&&!localStali?{endpoint,payload}:payload)});
  } catch {
    throw new Error(`${label}: không kết nối được máy chủ. Hãy kiểm tra mạng hoặc thử lại sau.`);
  }
  if(!res.ok){let msg=`${label} HTTP ${res.status}`;try{const e=await res.json();const detail=e?.error?.message||e?.message;const type=e?.error?.type;if(detail)msg=`${label}: ${detail}${type?` (${type})`:""}`;}catch{}throw new Error(msg);}
  const data=await res.json();const text=data?.choices?.[0]?.message?.content;
  if(!text||!String(text).trim())throw new Error(`${label} không trả kết quả`);
  if(data?.choices?.[0]?.finish_reason==="length")throw new Error(`${label} bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.`);
  return String(text).trim();
}

async function callClaude(apiKey, prompt, image, model, maxTokens = 8192) {
  const content = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
        { type: "text", text: prompt },
      ]
    : prompt;
  const res = await fetch(BASE_ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for Anthropic to allow direct browser (CORS) requests.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    let msg = `Claude ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text || !text.trim()) throw new Error("Claude không trả kết quả");
  if (data?.stop_reason === "max_tokens") throw new Error("Claude bị cắt giữa chừng vì vượt giới hạn độ dài phản hồi. Hãy thử lại hoặc chọn ít chương hơn.");
  return text.trim();
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

async function testStali(apiKey, model) {
  const local = import.meta.env.DEV;
  const target = local ? "/stali-api/v1/models" : "/api/stali-chat";
  let response;
  try {
    response = await fetch(target, {
      method: local ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      ...(local ? {} : { body: JSON.stringify({ action: "models" }) }),
    });
  } catch {
    throw new Error("STALI: không tới được máy chủ kiểm tra model.");
  }
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
    const type = data?.error?.type;
    throw new Error(`STALI: ${detail}${type ? ` (${type})` : ""}`);
  }
  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  if (models.length && !models.some((item) => item?.id === model)) {
    throw new Error(`STALI: API key hợp lệ nhưng model “${model}” không có trong danh sách được cấp. Hãy chọn model khác.`);
  }
  await testOpenAICompatible(apiKey, model, getEndpoint("stali"), "STALI");
  return true;
}

async function testClaude(apiKey, model) {
  const res = await fetch(BASE_ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
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
  claude: { input: 3.0, output: 15.0 },
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
