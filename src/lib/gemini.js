// Legacy compatibility shim — new code should import from "@/lib/llm" directly.
import {
  getProvider,
  saveProvider,
  getApiKey,
  saveApiKey,
  clearApiKey,
  callLLM,
  testLLMKey,
} from "./llm";

export function getGeminiKey() {
  return getApiKey("gemini");
}
export function saveGeminiKey(key) {
  saveApiKey("gemini", key);
}
export function clearGeminiKey() {
  clearApiKey("gemini");
}
export function hasGeminiKey() {
  return !!getApiKey("gemini").trim();
}

// Force Gemini for this call regardless of currently selected default provider.
export async function callGemini(prompt) {
  const key = getApiKey("gemini").trim();
  if (!key) {
    throw new Error(
      "Chưa cấu hình Gemini API Key. Vào Cài đặt (⚙️) để nhập key."
    );
  }
  const prev = getProvider();
  saveProvider("gemini");
  try {
    return await callLLM(prompt);
  } finally {
    saveProvider(prev);
  }
}

export async function testGeminiKey(key) {
  return testLLMKey("gemini", key);
}

export { hasCustomAI, getProvider, saveProvider, callLLM } from "./llm";