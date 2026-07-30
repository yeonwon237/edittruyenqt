// Auto-timestamp subtitle engine for "Tạo Phụ Đề": splits chapter text into
// short sentence-level cues by punctuation/line breaks, estimates a
// Start/End time per cue from an assumed reading speed (words/minute), and
// exports YouTube-ready .srt/.vtt files. Fully client-side, no AI/network
// call involved — this is a text-length heuristic, not real TTS timing, so
// the editor lets the user hand-correct every line/timestamp afterwards.

export const DEFAULT_READING_WPM = 165;
export const MIN_READING_WPM = 150;
export const MAX_READING_WPM = 180;

// Floor so a one-word sentence ("Được!") doesn't flash for a fraction of a
// second; GAP keeps consecutive cues from touching, which most subtitle
// tools/players read more comfortably than perfectly back-to-back cues.
const MIN_LINE_DURATION_SEC = 1.2;
const GAP_SEC = 0.12;

// Splits on paragraph breaks first, then on sentence-ending punctuation
// (. ? ! or the … ellipsis) followed by whitespace, mirroring the sentence
// regex already used for AI-chunking in llm.js's chunkText. Known
// limitation: a sentence ending inside a closing quote (…rồi." Nàng nói.)
// won't split right after the quote mark since the lookbehind only checks
// the literal last character — acceptable for this feature since the editor
// below lets the user fix any mis-split line by hand.
export function splitIntoSentences(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const sentences = [];
  for (const rawLine of normalized.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const part of line.split(/(?<=[.!?…])\s+/)) {
      const cleaned = part.replace(/\s+/g, " ").trim();
      if (cleaned) sentences.push(cleaned);
    }
  }
  return sentences;
}

// Word count via whitespace-split is a reasonable proxy for spoken duration
// here — Vietnamese text is space-delimited at (mostly) the syllable level,
// so it correlates with speaking pace similarly to how word-count does for
// English, without needing real linguistic segmentation.
export function computeSubtitleTiming(sentences, wpm = DEFAULT_READING_WPM) {
  const safeWpm = wpm > 0 ? wpm : DEFAULT_READING_WPM;
  let cursor = 0;
  return sentences.map((text, index) => {
    const wordCount = text.split(/\s+/).filter(Boolean).length || 1;
    const duration = Math.max(MIN_LINE_DURATION_SEC, (wordCount / safeWpm) * 60);
    const start = cursor;
    const end = start + duration;
    cursor = end + GAP_SEC;
    return { id: index + 1, text, start, end };
  });
}

export function generateSubtitleLines(text, wpm = DEFAULT_READING_WPM) {
  return computeSubtitleTiming(splitIntoSentences(text), wpm);
}

// Reads a File/Blob's real playback duration via a throwaway <audio>
// element. Preferred over the wpm-estimate above whenever the user already
// has the actual generated MP3 for this chapter — there's no reliable way
// to convert a TTS engine's "speed" setting (e.g. Google Cloud TTS's
// speakingRate multiplier) into a wpm figure, since that multiplier scales
// against each engine/voice's own unpublished baseline pace. Measuring the
// real file sidesteps needing to know that baseline at all.
export function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(duration) || duration <= 0) reject(new Error("Không đọc được thời lượng file audio này."));
      else resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được file audio này."));
    };
    audio.src = url;
  });
}

// Distributes a known total duration across cues proportionally by word
// count, instead of assuming a reading speed — every cue's share of the
// real audio length matches its share of the text, so cues stay in sync
// with the actual narration regardless of how fast/slow the TTS voice was
// set. No MIN_LINE_DURATION_SEC floor here (unlike computeSubtitleTiming):
// forcing a short cue to run longer than its real proportional slice would
// push it past when the audio has already moved on to the next sentence.
export function computeTimingFromDuration(sentences, totalDurationSec) {
  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length || 1);
  const totalWords = wordCounts.reduce((sum, n) => sum + n, 0) || 1;
  const totalGap = sentences.length > 1 ? GAP_SEC * (sentences.length - 1) : 0;
  const effectiveTotal = Math.max(0, totalDurationSec - totalGap);
  let cursor = 0;
  return sentences.map((text, index) => {
    const duration = effectiveTotal * (wordCounts[index] / totalWords);
    const start = cursor;
    const end = start + duration;
    cursor = end + GAP_SEC;
    return { id: index + 1, text, start, end };
  });
}

export function generateSubtitleLinesFromDuration(text, totalDurationSec) {
  return computeTimingFromDuration(splitIntoSentences(text), totalDurationSec);
}

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

// Builds components from total milliseconds (rounded once, up front) rather
// than rounding seconds/millis separately — avoids a 59.9995s edge case
// rounding to an invalid "60" millis/seconds component.
function splitMs(totalSeconds) {
  let ms = Math.round(Math.max(0, totalSeconds) * 1000);
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const minutes = Math.floor(ms / 60000);
  ms -= minutes * 60000;
  const seconds = Math.floor(ms / 1000);
  ms -= seconds * 1000;
  return { hours, minutes, seconds, ms };
}

export function formatSrtTimestamp(totalSeconds) {
  const { hours, minutes, seconds, ms } = splitMs(totalSeconds);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

export function formatVttTimestamp(totalSeconds) {
  const { hours, minutes, seconds, ms } = splitMs(totalSeconds);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

export function buildSrt(lines) {
  return lines
    .map((l, i) => `${i + 1}\n${formatSrtTimestamp(l.start)} --> ${formatSrtTimestamp(l.end)}\n${l.text}\n`)
    .join("\n");
}

export function buildVtt(lines) {
  const body = lines
    .map((l) => `${formatVttTimestamp(l.start)} --> ${formatVttTimestamp(l.end)}\n${l.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A Blob built from a JS string is always encoded as UTF-8 bytes by the
// browser regardless of the MIME type string — the `charset=utf-8` here is
// just metadata for whatever opens the file next. The leading BOM on the
// .srt is a deliberate belt-and-suspenders move: some older Windows tools
// guess a file's encoding from the BOM and mis-detect BOM-less UTF-8 .srt
// files as ANSI, which is exactly the classic "garbled Vietnamese subtitle"
// failure mode this feature exists to avoid. YouTube Studio itself doesn't
// need the BOM, but it doesn't hurt there either — the .vtt is left without
// one since the WebVTT spec expects the file to start with the literal
// string "WEBVTT".
export function downloadSrt(lines, filenameBase) {
  const BOM = "\uFEFF";
  downloadBlob(`${filenameBase}.srt`, new Blob([BOM + buildSrt(lines)], { type: "text/plain;charset=utf-8" }));
}

export function downloadVtt(lines, filenameBase) {
  downloadBlob(`${filenameBase}.vtt`, new Blob([buildVtt(lines)], { type: "text/vtt;charset=utf-8" }));
}

// "Cổ phong" (period/classical-style) burn-in font for the cover-preview
// overlay used by CreateVideo.jsx's drawCover. Deliberately Noto Serif
// rather than a more overtly decorative display font: Google's Noto family
// specifically guarantees full Unicode (incl. every Vietnamese diacritic
// combination) glyph coverage, which a prettier but narrower-coverage
// display font can silently fail to render correctly for Vietnamese text.
export const SUBTITLE_FONT_FAMILY = "'Noto Serif', serif";

let fontLoadPromise = null;
// Canvas text rendering doesn't lazy-trigger a webfont download the way a
// normal DOM element would — call this once up front so the font is
// actually in the browser's font cache before drawCover tries to use it.
export function ensureSubtitleFontLoaded() {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  if (!fontLoadPromise) {
    fontLoadPromise = document.fonts.load(`700 48px ${SUBTITLE_FONT_FAMILY}`).catch(() => {});
  }
  return fontLoadPromise;
}
