const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const STORAGE_KEY = "gemini_api_key";

export function getGeminiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveGeminiKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearGeminiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasGeminiKey() {
  return !!getGeminiKey().trim();
}

export async function callGemini(prompt) {
  const apiKey = getGeminiKey();
  if (!apiKey.trim()) {
    throw new Error(
      "Chưa cấu hình Gemini API Key. Vào Cài đặt (⚙️) để nhập key."
    );
  }
  const res = await fetch(
    `${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) {
    let msg = `Gemini API ${res.status}`;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error("Gemini không trả về kết quả");
  }
  return text.trim();
}

export async function testGeminiKey(key) {
  const res = await fetch(
    `${GEMINI_API_URL}?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Trả lời đúng 2 từ: OK đã hoạt động" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 50 },
      }),
    }
  );
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return true;
}