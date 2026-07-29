// Text-to-speech: two independent backends.
//
// 1. Browser (Web Speech API, window.speechSynthesis) — zero setup, zero
//    cost, works everywhere, quick preview only (can't be downloaded as a
//    file — the browser just plays it live).
// 2. Google Cloud Text-to-Speech — a real audiobook-quality path: natural
//    Vietnamese voices, generous free tier (WaveNet voices free up to
//    1,000,000 characters/month), and returns actual MP3 audio the user can
//    download. Needs its own Google Cloud API key (separate from the
//    Gemini/OpenAI/Claude keys already used for AI Edit — different
//    product, different account setup, see hint text in the UI).
import { chunkText } from "@/lib/llm";

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
