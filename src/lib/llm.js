// Multi-provider LLM dispatch: Gemini / OpenAI (GPT) / Anthropic (Claude).

const PROVIDER_KEY = "llm_provider";
const KEY_STORE = {
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  claude: "claude_api_key",
};

const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

const MODELS = {
  gemini: "gemini-3-flash-preview",
  openai: "gpt-4o-mini",
  claude: "claude-sonnet-4-6",
};

export const PROVIDERS = ["gemini", "openai", "claude"];

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

// `image`, when provided, is { base64, mimeType } — a data-URL-free base64
// payload plus its MIME type (e.g. "image/png"). Only Gemini/OpenAI/Claude
// (this custom-key path) support image input; the Base44 managed AI path
// (InvokeLLM) is text-only.
export async function callLLM(prompt, image) {
  const provider = getProvider();
  const key = getApiKey(provider).trim();
  if (!key) {
    throw new Error("Chưa cấu hình API Key. Vào Cài đặt (⚙️) để nhập key.");
  }
  if (provider === "gemini") return callGeminiRaw(key, prompt, image);
  if (provider === "openai") return callOpenAI(key, prompt, image);
  if (provider === "claude") return callClaude(key, prompt, image);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

export async function testLLMKey(provider, key) {
  if (!key.trim()) throw new Error("Vui lòng nhập API key");
  if (provider === "gemini") return testGeminiRaw(key);
  if (provider === "openai") return testOpenAI(key);
  if (provider === "claude") return testClaude(key);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

async function callGeminiRaw(apiKey, prompt, image) {
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  const res = await fetch(`${ENDPOINTS.gemini}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
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
  return text.trim();
}

async function callOpenAI(apiKey, prompt, image) {
  const content = image
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      ]
    : prompt;
  const res = await fetch(ENDPOINTS.openai, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELS.openai,
      messages: [{ role: "user", content }],
      temperature: 0.7,
      max_tokens: 8192,
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
  return text.trim();
}

async function callClaude(apiKey, prompt, image) {
  const content = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
        { type: "text", text: prompt },
      ]
    : prompt;
  const res = await fetch(ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for Anthropic to allow direct browser (CORS) requests.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: 8192,
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
  return text.trim();
}

async function testGeminiRaw(apiKey) {
  const res = await fetch(`${ENDPOINTS.gemini}?key=${encodeURIComponent(apiKey)}`, {
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
  return true;
}

async function testOpenAI(apiKey) {
  const res = await fetch(ENDPOINTS.openai, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELS.openai,
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

// Split long text into chunks along paragraph (then sentence, then hard-cut)
// boundaries so no chunk exceeds maxChars.
export function chunkText(text, maxChars = 3000) {
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let current = "";

  const flushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    flushCurrent();
    if (para.length <= maxChars) {
      current = para;
      continue;
    }
    // Single paragraph longer than maxChars: split by sentence, then hard-cut.
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
  }
  flushCurrent();
  return chunks;
}

async function testClaude(apiKey) {
  const res = await fetch(ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODELS.claude,
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