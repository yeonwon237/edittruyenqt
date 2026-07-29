// Text-to-speech: two independent backends.
//
// 1. Browser (Web Speech API, window.speechSynthesis) — zero setup, zero
//    cost, works everywhere, but voice quality/availability for Vietnamese
//    depends entirely on the user's OS/browser.
// 2. Gemini TTS (native audio output via the Gemini API) — reuses the same
//    Gemini API key already stored for AI Edit (see llm.js), much more
//    natural-sounding, but costs separate quota from text generation and
//    needs a key configured.
import { getApiKey } from "@/lib/llm";

const TTS_MODEL_KEY = "gemini_tts_model";
const TTS_VOICE_KEY = "gemini_tts_voice";

// NOTE: Gemini model IDs churn often (see llm.js's DEFAULT_MODELS comment —
// same caveat applies here). This is only a starting default; if it 404s or
// the account has no access, the user can override it below with whatever
// current TTS-capable model name they see in Google AI Studio.
const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_VOICE = "Kore";

// A handful of the documented prebuilt voice names — not exhaustive, just
// enough to pick from without needing to look anything up.
export const GEMINI_TTS_VOICES = [
  "Kore", "Puck", "Zephyr", "Charon", "Fenrir", "Leda", "Orus", "Aoede",
];

export function getTtsModel() {
  try {
    return (localStorage.getItem(TTS_MODEL_KEY) || "").trim() || DEFAULT_TTS_MODEL;
  } catch {
    return DEFAULT_TTS_MODEL;
  }
}

export function saveTtsModel(model) {
  const trimmed = (model || "").trim();
  if (!trimmed) localStorage.removeItem(TTS_MODEL_KEY);
  else localStorage.setItem(TTS_MODEL_KEY, trimmed);
}

export function getTtsVoice() {
  try {
    return localStorage.getItem(TTS_VOICE_KEY) || DEFAULT_TTS_VOICE;
  } catch {
    return DEFAULT_TTS_VOICE;
  }
}

export function saveTtsVoice(voice) {
  localStorage.setItem(TTS_VOICE_KEY, voice || DEFAULT_TTS_VOICE);
}

export function hasGeminiKey() {
  return !!getApiKey("gemini").trim();
}

// ---- Browser TTS (Web Speech API) ----

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

// ---- Gemini TTS ----

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Gemini's audio response is raw PCM (16-bit signed, mono, 24kHz by
// default), not a playable file — an <audio> element needs a WAV container
// wrapped around it first.
function pcmToWavBlob(pcmBytes, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: "audio/wav" });
}

// Parses the "audio/L16;codec=pcm;rate=24000" style mimeType Gemini returns
// for the sample rate, since it isn't always exactly 24000.
function parseSampleRate(mimeType) {
  const m = /rate=(\d+)/.exec(mimeType || "");
  return m ? parseInt(m[1], 10) : 24000;
}

/**
 * Generates speech audio for `text` via the Gemini API and returns an
 * object URL playable directly in an <audio> element. Caller is responsible
 * for revoking the URL (URL.revokeObjectURL) once done with it.
 */
export async function generateGeminiSpeech(text, { model, voiceName } = {}) {
  const apiKey = getApiKey("gemini").trim();
  if (!apiKey) {
    throw new Error("Chưa có Gemini API Key. Vào Cài đặt để thêm.");
  }
  const m = model || getTtsModel();
  const voice = voiceName || getTtsVoice();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    }
  );

  if (!res.ok) {
    let msg = `Gemini TTS lỗi ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    if (res.status === 404) {
      msg += ` — model "${m}" có thể không còn hỗ trợ TTS, hãy kiểm tra lại tên model trong Cài đặt.`;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) {
    throw new Error("Gemini không trả về âm thanh nào.");
  }

  const pcmBytes = base64ToBytes(part.data);
  const sampleRate = parseSampleRate(part.mimeType);
  const wavBlob = pcmToWavBlob(pcmBytes, sampleRate);
  return URL.createObjectURL(wavBlob);
}
