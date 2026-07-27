// Multi-provider LLM dispatch: Gemini / OpenAI (GPT) / Anthropic (Claude).

const PROVIDER_KEY = "llm_provider";
const KEY_STORE = {
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  claude: "claude_api_key",
};

const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  openai: "https://api.openai.com/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
};

const MODELS = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-20240620",
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

export async function callLLM(prompt) {
  const provider = getProvider();
  const key = getApiKey(provider).trim();
  if (!key) {
    throw new Error("Chưa cấu hình API Key. Vào Cài đặt (⚙️) để nhập key.");
  }
  if (provider === "gemini") return callGeminiRaw(key, prompt);
  if (provider === "openai") return callOpenAI(key, prompt);
  if (provider === "claude") return callClaude(key, prompt);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

export async function testLLMKey(provider, key) {
  if (!key.trim()) throw new Error("Vui lòng nhập API key");
  if (provider === "gemini") return testGeminiRaw(key);
  if (provider === "openai") return testOpenAI(key);
  if (provider === "claude") return testClaude(key);
  throw new Error("Provider AI không được hỗ trợ: " + provider);
}

async function callGeminiRaw(apiKey, prompt) {
  const res = await fetch(`${ENDPOINTS.gemini}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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

async function callOpenAI(apiKey, prompt) {
  const res = await fetch(ENDPOINTS.openai, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELS.openai,
      messages: [{ role: "user", content: prompt }],
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

async function callClaude(apiKey, prompt) {
  const res = await fetch(ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
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

async function testClaude(apiKey) {
  const res = await fetch(ENDPOINTS.claude, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
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