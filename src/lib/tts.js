// Text-to-speech: one free browser backend, plus a choice of paid/AI
// backends for real downloadable audiobook-quality output — Google Cloud
// TTS, OpenAI, ElevenLabs, Azure. Each needs its own account/API key (a
// different product from each provider, not shared with anything else in
// this app except OpenAI, which reuses the same key already stored for AI
// Edit in llm.js). See per-provider comments below for setup/CORS/quality
// notes — picked so the user can compare and pick, not because one is
// obviously best for every case.
import { chunkText, getApiKey as getLlmApiKey } from "@/lib/llm";

export const TTS_AI_PROVIDERS = [
  { id: "gcp", label: "Google Cloud TTS", note: "Hạn mức free lớn nhất (1 triệu ký tự/tháng), cần thẻ tín dụng để bật." },
  { id: "openai", label: "OpenAI", note: "Dùng chung API Key OpenAI đã có sẵn (nếu bạn đã cấu hình cho Auto Edit)." },
  { id: "elevenlabs", label: "ElevenLabs", note: "Giọng tự nhiên nhất, nhưng hạn mức free rất ít." },
  { id: "azure", label: "Microsoft Azure", note: "Hạn mức free khá (500k ký tự/tháng), cần thêm \"vùng\" (region) lúc tạo tài nguyên." },
];

const TTS_PROVIDER_KEY = "tts_ai_provider";

export function getTtsProvider() {
  try {
    return localStorage.getItem(TTS_PROVIDER_KEY) || "gcp";
  } catch {
    return "gcp";
  }
}

export function saveTtsProvider(p) {
  localStorage.setItem(TTS_PROVIDER_KEY, p);
}

const GCP_TTS_KEY_STORE = "gcp_tts_api_key";
const GCP_TTS_VOICE_KEY = "gcp_tts_voice";

const DEFAULT_GCP_VOICE = "vi-VN-Wavenet-A";

// Confirmed Vietnamese voices as of this writing (Google adds new ones over
// time — check https://cloud.google.com/text-to-speech/docs/list-voices-and-types
// for the current full list if these stop working).
export const GCP_TTS_VOICES = [
  { id: "vi-VN-Wavenet-A", label: "Wavenet A — nữ (chất lượng cao)" },
  { id: "vi-VN-Wavenet-B", label: "Wavenet B — nam (chất lượng cao)" },
  { id: "vi-VN-Wavenet-C", label: "Wavenet C — nữ (chất lượng cao)" },
  { id: "vi-VN-Standard-A", label: "Standard A — nữ (rẻ hơn, hạn mức free lớn hơn)" },
  { id: "vi-VN-Standard-B", label: "Standard B — nam" },
  { id: "vi-VN-Standard-C", label: "Standard C — nữ" },
  { id: "vi-VN-Standard-D", label: "Standard D — nam" },
];

export function getGcpTtsKey() {
  try {
    return localStorage.getItem(GCP_TTS_KEY_STORE) || "";
  } catch {
    return "";
  }
}

export function saveGcpTtsKey(key) {
  localStorage.setItem(GCP_TTS_KEY_STORE, (key || "").trim());
}

export function clearGcpTtsKey() {
  localStorage.removeItem(GCP_TTS_KEY_STORE);
}

export function hasGcpTtsKey() {
  return !!getGcpTtsKey().trim();
}

export function getGcpTtsVoice() {
  try {
    return localStorage.getItem(GCP_TTS_VOICE_KEY) || DEFAULT_GCP_VOICE;
  } catch {
    return DEFAULT_GCP_VOICE;
  }
}

export function saveGcpTtsVoice(voice) {
  localStorage.setItem(GCP_TTS_VOICE_KEY, voice || DEFAULT_GCP_VOICE);
}

// ---- Browser TTS (Web Speech API) — quick free preview, not downloadable ----

// Voice list loads asynchronously in some browsers (first call returns
// empty until the "voiceschanged" event fires) — this waits for that.
export function loadBrowserVoices() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const onChange = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    // Fallback in case the event never fires on this browser.
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(window.speechSynthesis.getVoices());
    }, 1500);
  });
}

export function supportsBrowserTts() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

/**
 * Speaks `text` with the browser's built-in TTS. Long text is split into
 * per-utterance chunks along sentence/line boundaries — a single very long
 * utterance is silently cut short by some browsers (notably Chrome).
 */
export function speakWithBrowser(text, { voiceURI, rate = 1, onEnd, onBoundary } = {}) {
  if (!supportsBrowserTts() || !text) return () => {};
  const synth = window.speechSynthesis;
  synth.cancel();

  const voices = synth.getVoices();
  const voice = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;

  const chunks = text.split(/(?<=[.!?…\n])\s+/).filter((c) => c.trim());
  let i = 0;

  const speakNext = () => {
    if (i >= chunks.length) {
      onEnd?.();
      return;
    }
    const utter = new SpeechSynthesisUtterance(chunks[i]);
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.lang = voice?.lang || "vi-VN";
    utter.onboundary = onBoundary;
    utter.onend = () => {
      i += 1;
      speakNext();
    };
    utter.onerror = () => {
      i += 1;
      speakNext();
    };
    synth.speak(utter);
  };
  speakNext();

  return () => synth.cancel();
}

export function pauseBrowser() {
  window.speechSynthesis?.pause();
}
export function resumeBrowser() {
  window.speechSynthesis?.resume();
}
export function stopBrowser() {
  window.speechSynthesis?.cancel();
}

// ---- Google Cloud Text-to-Speech (audiobook-quality, downloadable) ----

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Chunk size kept well under the API's 5,000-*byte* per-request cap: text
// with heavy Vietnamese diacritics runs 2-3 bytes/char in UTF-8, so 1,500
// characters stays safely under that even in the worst case.
const GCP_CHUNK_CHARS = 1500;

/**
 * Synthesizes `text` into a single downloadable MP3 via Google Cloud TTS.
 * Long text is split into multiple API calls (5,000-byte request cap) and
 * the resulting MP3 fragments are concatenated — simple byte-concatenation
 * of consecutive MP3 streams plays back correctly in browsers/players
 * (unlike WAV, which would need real header surgery to do the same thing).
 * @param {string} text
 * @param {{apiKey?: string, voiceName?: string, onProgress?: (i:number,total:number)=>void}} opts
 * @returns {Promise<{blob: Blob, url: string}>}
 */
export async function generateGcpSpeech(text, { apiKey, voiceName, onProgress } = {}) {
  const key = (apiKey || getGcpTtsKey()).trim();
  if (!key) {
    throw new Error("Chưa có Google Cloud TTS API Key.");
  }
  const voice = voiceName || getGcpTtsVoice();
  const chunks = chunkText(text, GCP_CHUNK_CHARS);
  if (chunks.length === 0) {
    throw new Error("Không có văn bản để tạo audio.");
  }

  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i + 1, chunks.length);
    const chunk = chunks[i];
    if (!chunk.trim()) continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: chunk },
          voice: { languageCode: "vi-VN", name: voice },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );
    if (!res.ok) {
      let msg = `Google Cloud TTS lỗi ${res.status}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const e = await res.json();
        msg = e?.error?.message || msg;
      } catch {}
      if (res.status === 403 || res.status === 401) {
        msg += " — kiểm tra lại API Key và đảm bảo đã bật \"Cloud Text-to-Speech API\" trong Google Cloud Console.";
      }
      throw new Error(msg);
    }
    // eslint-disable-next-line no-await-in-loop
    const data = await res.json();
    if (!data.audioContent) {
      throw new Error("Google Cloud TTS không trả về âm thanh nào.");
    }
    parts.push(base64ToBytes(data.audioContent));
  }

  const blob = new Blob(parts, { type: "audio/mpeg" });
  return { blob, url: URL.createObjectURL(blob) };
}

// ---- OpenAI TTS ----
// Reuses the exact same API key already stored for AI Edit (llm.js) — no
// new account/key needed if OpenAI is already configured there. Response is
// raw binary MP3 (not JSON+base64 like Gemini/GCP), so no decoding needed.
// Confirmed working directly from the browser already: llm.js's callOpenAI
// hits the same api.openai.com host for chat completions with no CORS
// issue, so the /audio/speech endpoint should behave the same way.
const OPENAI_TTS_MODEL_KEY = "openai_tts_model";
const OPENAI_TTS_VOICE_KEY = "openai_tts_voice";
const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = "alloy";
// The 4,096-character request cap is well below GCP's, so chunks are
// smaller here — more API calls for the same chapter, but each is cheap.
const OPENAI_CHUNK_CHARS = 3800;

export const OPENAI_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export function getOpenAiTtsModel() {
  try {
    return (localStorage.getItem(OPENAI_TTS_MODEL_KEY) || "").trim() || DEFAULT_OPENAI_TTS_MODEL;
  } catch {
    return DEFAULT_OPENAI_TTS_MODEL;
  }
}
export function saveOpenAiTtsModel(m) {
  const t = (m || "").trim();
  if (!t) localStorage.removeItem(OPENAI_TTS_MODEL_KEY);
  else localStorage.setItem(OPENAI_TTS_MODEL_KEY, t);
}
export function getOpenAiTtsVoice() {
  try {
    return localStorage.getItem(OPENAI_TTS_VOICE_KEY) || DEFAULT_OPENAI_TTS_VOICE;
  } catch {
    return DEFAULT_OPENAI_TTS_VOICE;
  }
}
export function saveOpenAiTtsVoice(v) {
  localStorage.setItem(OPENAI_TTS_VOICE_KEY, v || DEFAULT_OPENAI_TTS_VOICE);
}
export function hasOpenAiKey() {
  return !!getLlmApiKey("openai").trim();
}

export async function generateOpenAiSpeech(text, { model, voice, onProgress } = {}) {
  const key = getLlmApiKey("openai").trim();
  if (!key) throw new Error("Chưa có OpenAI API Key (thêm ở Cài đặt, mục AI Auto Edit).");
  const m = model || getOpenAiTtsModel();
  const v = voice || getOpenAiTtsVoice();
  const chunks = chunkText(text, OPENAI_CHUNK_CHARS);
  if (chunks.length === 0) throw new Error("Không có văn bản để tạo audio.");

  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i + 1, chunks.length);
    const chunk = chunks[i];
    if (!chunk.trim()) continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: m, input: chunk, voice: v, response_format: "mp3" }),
    });
    if (!res.ok) {
      let msg = `OpenAI TTS lỗi ${res.status}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const e = await res.json();
        msg = e?.error?.message || msg;
      } catch {}
      throw new Error(msg);
    }
    // eslint-disable-next-line no-await-in-loop
    parts.push(await res.blob());
  }

  const blob = new Blob(parts, { type: "audio/mpeg" });
  return { blob, url: URL.createObjectURL(blob) };
}

// ---- ElevenLabs ----
// Voices are per-account voice IDs (not simple names like other providers)
// — premade voices' IDs are stable and public, but the user's own cloned
// voices (if any) would have their own IDs from the ElevenLabs dashboard,
// hence a free-text field in the UI rather than a fixed dropdown.
const ELEVENLABS_KEY_STORE = "elevenlabs_api_key";
const ELEVENLABS_VOICE_KEY = "elevenlabs_voice_id";
// "Rachel", a stable premade multilingual-capable voice — reasonable
// starting default, swappable via the UI/ElevenLabs voice library.
const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_CHUNK_CHARS = 2500;

export function getElevenLabsKey() {
  try {
    return localStorage.getItem(ELEVENLABS_KEY_STORE) || "";
  } catch {
    return "";
  }
}
export function saveElevenLabsKey(k) {
  localStorage.setItem(ELEVENLABS_KEY_STORE, (k || "").trim());
}
export function hasElevenLabsKey() {
  return !!getElevenLabsKey().trim();
}
export function getElevenLabsVoiceId() {
  try {
    return localStorage.getItem(ELEVENLABS_VOICE_KEY) || DEFAULT_ELEVENLABS_VOICE_ID;
  } catch {
    return DEFAULT_ELEVENLABS_VOICE_ID;
  }
}
export function saveElevenLabsVoiceId(id) {
  localStorage.setItem(ELEVENLABS_VOICE_KEY, (id || "").trim() || DEFAULT_ELEVENLABS_VOICE_ID);
}

export async function generateElevenLabsSpeech(text, { apiKey, voiceId, onProgress } = {}) {
  const key = (apiKey || getElevenLabsKey()).trim();
  if (!key) throw new Error("Chưa có ElevenLabs API Key.");
  const voice = (voiceId || getElevenLabsVoiceId()).trim();
  const chunks = chunkText(text, ELEVENLABS_CHUNK_CHARS);
  if (chunks.length === 0) throw new Error("Không có văn bản để tạo audio.");

  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i + 1, chunks.length);
    const chunk = chunks[i];
    if (!chunk.trim()) continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: chunk,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      let msg = `ElevenLabs lỗi ${res.status}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const e = await res.json();
        msg = e?.detail?.message || e?.detail || msg;
      } catch {}
      throw new Error(msg);
    }
    // eslint-disable-next-line no-await-in-loop
    parts.push(await res.blob());
  }

  const blob = new Blob(parts, { type: "audio/mpeg" });
  return { blob, url: URL.createObjectURL(blob) };
}

// ---- Microsoft Azure TTS ----
// The most involved of the four: needs a "region" (wherever the Azure
// Speech resource was created, e.g. "southeastasia") on top of the key,
// and a two-step call — exchange the key for a short-lived bearer token
// first, then send SSML (not plain text) to the actual synthesis endpoint.
// CORS behavior for this REST endpoint isn't independently confirmed the
// way OpenAI's is (this app already proves OpenAI works from the browser);
// if this fails with a generic "Failed to fetch" (no response/status at
// all) rather than a proper error message, that's most likely a CORS block
// requiring a backend proxy Azure's REST API doesn't support from a
// browser — flagged here so a failure here isn't mistaken for a wrong key.
const AZURE_KEY_STORE = "azure_tts_api_key";
const AZURE_REGION_KEY = "azure_tts_region";
const AZURE_VOICE_KEY = "azure_tts_voice";
const DEFAULT_AZURE_VOICE = "vi-VN-HoaiMyNeural";
const AZURE_CHUNK_CHARS = 2000;

// Verified Vietnamese Neural voice names as of this writing — Azure's own
// "voices/list" endpoint is the source of truth if these ever 400.
export const AZURE_TTS_VOICES = [
  { id: "vi-VN-HoaiMyNeural", label: "HoaiMy — nữ" },
  { id: "vi-VN-NamMinhNeural", label: "NamMinh — nam" },
];

export function getAzureKey() {
  try {
    return localStorage.getItem(AZURE_KEY_STORE) || "";
  } catch {
    return "";
  }
}
export function saveAzureKey(k) {
  localStorage.setItem(AZURE_KEY_STORE, (k || "").trim());
}
export function hasAzureKey() {
  return !!getAzureKey().trim();
}
export function getAzureRegion() {
  try {
    return localStorage.getItem(AZURE_REGION_KEY) || "";
  } catch {
    return "";
  }
}
export function saveAzureRegion(r) {
  localStorage.setItem(AZURE_REGION_KEY, (r || "").trim());
}
export function getAzureVoice() {
  try {
    return localStorage.getItem(AZURE_VOICE_KEY) || DEFAULT_AZURE_VOICE;
  } catch {
    return DEFAULT_AZURE_VOICE;
  }
}
export function saveAzureVoice(v) {
  localStorage.setItem(AZURE_VOICE_KEY, v || DEFAULT_AZURE_VOICE);
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getAzureToken(key, region) {
  const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  if (!res.ok) {
    throw new Error(`Không lấy được token Azure (${res.status}) — kiểm tra lại Key và Region.`);
  }
  return res.text();
}

export async function generateAzureSpeech(text, { apiKey, region, voice, onProgress } = {}) {
  const key = (apiKey || getAzureKey()).trim();
  const rg = (region || getAzureRegion()).trim();
  if (!key) throw new Error("Chưa có Azure API Key.");
  if (!rg) throw new Error("Chưa nhập Region (vùng) của tài nguyên Azure Speech.");
  const v = voice || getAzureVoice();
  const chunks = chunkText(text, AZURE_CHUNK_CHARS);
  if (chunks.length === 0) throw new Error("Không có văn bản để tạo audio.");

  const token = await getAzureToken(key, rg);

  const parts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i + 1, chunks.length);
    const chunk = chunks[i];
    if (!chunk.trim()) continue;
    const ssml = `<speak version='1.0' xml:lang='vi-VN'><voice xml:lang='vi-VN' name='${v}'>${escapeXml(chunk)}</voice></speak>`;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`https://${rg}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    });
    if (!res.ok) {
      throw new Error(`Azure TTS lỗi ${res.status} — kiểm tra lại Key/Region/tên giọng.`);
    }
    // eslint-disable-next-line no-await-in-loop
    parts.push(await res.blob());
  }

  const blob = new Blob(parts, { type: "audio/mpeg" });
  return { blob, url: URL.createObjectURL(blob) };
}
