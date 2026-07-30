// Video cover generator: background image — either Pollinations.ai
// (free/no-key) or Gemini's own image model (reuses the Gemini key already
// stored for Auto Edit, better quality, no CORS risk — see
// generateGeminiCoverImage below) — or a user-uploaded file — composited
// with an HTML5 Canvas text overlay (title/chapter), 1920x1080 (YouTube
// standard). Fully client-side, no server involved — background images are
// fetched directly by the browser, never proxied through this app's own
// hosting.
import { callLLM, getApiKey, hasCustomAI } from "@/lib/llm";

export const COVER_WIDTH = 1920;
export const COVER_HEIGHT = 1080;

export function canAutoTranslatePrompt() {
  return hasCustomAI();
}

export function hasGeminiImageKey() {
  return !!getApiKey("gemini").trim();
}

const GEMINI_IMAGE_MODEL_KEY = "gemini_image_model";
// Real error seen in testing: "limit: 0, model: gemini-2.5-flash-preview-
// image" — Google's own server named the model with a "-preview-" segment
// this app's first guess ("gemini-2.5-flash-image") didn't have, AND
// "limit: 0" (not "quota used up") means this account's free-tier key has
// no allotment for this model at all — likely gated behind a paid/billing-
// enabled account, same friction hit earlier with Google Cloud TTS. Kept
// user-editable (same resilience pattern as every other AI model in this
// app) since neither the exact name nor its availability is something this
// environment can verify directly.
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-preview-image";

export function getGeminiImageModel() {
  try {
    return (localStorage.getItem(GEMINI_IMAGE_MODEL_KEY) || "").trim() || DEFAULT_GEMINI_IMAGE_MODEL;
  } catch {
    return DEFAULT_GEMINI_IMAGE_MODEL;
  }
}
export function saveGeminiImageModel(model) {
  const trimmed = (model || "").trim();
  if (!trimmed) localStorage.removeItem(GEMINI_IMAGE_MODEL_KEY);
  else localStorage.setItem(GEMINI_IMAGE_MODEL_KEY, trimmed);
}

// Gemini's own image model ("Nano Banana") — reuses the same Gemini key
// already stored for AI Edit (llm.js), no new signup. Noticeably better
// quality than Pollinations' free tier when it works. Response comes back
// as a data: URL (embedded base64), not a remote URL, so it can NEVER
// taint the canvas — unlike Pollinations, where a cross-origin image could
// block canvas.toBlob() (CORS headers on Pollinations' side were never
// independently confirmed).
export async function generateGeminiCoverImage(prompt, model) {
  const m = model || getGeminiImageModel();
  const apiKey = getApiKey("gemini").trim();
  if (!apiKey) throw new Error("Chưa có Gemini API Key (thêm ở nút AI trong Workspace hoặc bất kỳ đâu đã dùng Gemini).");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
    }
  );

  if (!res.ok) {
    let msg = `Gemini tạo ảnh lỗi ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message || msg;
    } catch {}
    if (res.status === 404) {
      msg += ` — model "${m}" có thể không còn hỗ trợ tạo ảnh, kiểm tra lại tên model.`;
    } else if (/limit:\s*0/.test(msg)) {
      msg += " — Tài khoản của bạn chưa được cấp hạn mức cho model này (khác với việc dùng hết hạn mức), có thể cần bật billing hoặc dùng model khác. Thử đổi tên model ở ô bên dưới, hoặc dùng nguồn Pollinations thay thế.";
    }
    throw new Error(msg);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part?.data) throw new Error("Gemini không trả về ảnh nào.");
  return `data:${part.mimeType || "image/png"};base64,${part.data}`;
}

// Pollinations/Flux (like most image models) understands short, keyword-
// style ENGLISH prompts far better than Vietnamese — a raw Vietnamese
// prompt like "cổ đại, bách hợp, cổ trang" gets loosely/wrongly associated
// (confirmed in testing: produced a Guanyin Bodhisattva statue instead of
// the intended historical-fantasy scene). Reuses whichever AI key the user
// already has configured for Auto Edit (see llm.js) to translate + expand
// the description into a concrete visual English prompt before it's sent
// to Pollinations. Falls back to the raw text untouched if no AI key is
// configured, or if the call fails — never blocks image generation.
export async function translatePromptToEnglish(vietnameseText) {
  if (!vietnameseText.trim() || !hasCustomAI()) return vietnameseText;
  // Explicitly told to turn abstract/genre words into concrete VISUAL
  // description rather than translating them literally — a first version
  // of this that just asked for a "short keyword prompt" still let genre
  // words like "bách hợp" (a romance-genre label, not a visual descriptor)
  // ride through untranslated-in-spirit, and Flux fell back to loosely
  // associating it with unrelated imagery (a Guanyin Bodhisattva statue in
  // testing). Asking for an actual descriptive scene — who/what/where/mood
  // — instead of bare keywords gives the image model something concrete to
  // render.
  const instruction = `Người dùng muốn tạo ảnh bìa AI từ mô tả tiếng Việt sau (có thể chỉ là từ khóa rời rạc, kể cả thể loại truyện như "bách hợp", "ngôn tình", "tiên hiệp"...). Hãy viết lại thành MỘT đoạn mô tả cảnh cụ thể bằng tiếng Anh (2-3 câu) cho công cụ vẽ ảnh AI (text-to-image), mô tả rõ: có ai trong cảnh (giới tính, số lượng, trang phục), họ đang ở đâu, đang làm gì/tư thế gì, không khí/ánh sáng ra sao. TUYỆT ĐỐI không dịch nghĩa đen các từ chỉ thể loại/khái niệm trừu tượng (VD: "bách hợp" nghĩa là truyện tình cảm giữa hai cô gái — hãy mô tả CẢNH đó, không dịch thành hoa "lily" hay bất cứ nghĩa đen nào khác). Không thêm yếu tố tôn giáo/tượng thờ trừ khi mô tả gốc có nhắc tới. CHỈ xuất ra đúng đoạn mô tả tiếng Anh, không giải thích, không ghi chú gì thêm. Mô tả gốc: "${vietnameseText.trim()}"`;
  try {
    const result = await callLLM(instruction);
    const cleaned = result.replace(/^["']|["']$/g, "").trim();
    return cleaned || vietnameseText;
  } catch {
    // Silent fallback — a failed translation shouldn't block cover creation.
    return vietnameseText;
  }
}

// Pollinations model choices for the picker in the UI. "flux" is the
// default: much better detail/proportions (faces, hands) at high
// resolution than "turbo", which natively renders at a fixed low
// resolution (512x512) and gets stretched up to fill 1920x1080 —
// confirmed as the cause of the distorted/uncanny faces seen in testing.
export const POLLINATIONS_MODELS = [
  { id: "flux", label: "Flux (chi tiết, mặc định)" },
  { id: "turbo", label: "Turbo (nhanh hơn, ảnh gốc nhỏ nên dễ méo khi phóng to)" },
];

export function buildPollinationsUrl(prompt, seed, model = "flux") {
  // A light, generic quality nudge — Pollinations' simple prompt endpoint
  // has no separate negative-prompt field, so this rides along in the main
  // prompt. Kept short so it doesn't drown out the user's own description.
  const fullPrompt = `${prompt}, high detail, realistic proportions, professional photography`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}`;
  const params = new URLSearchParams({
    width: String(COVER_WIDTH),
    height: String(COVER_HEIGHT),
    model,
    nologo: "true",
    enhance: "true",
  });
  if (seed !== undefined && seed !== null) params.set("seed", String(seed));
  return `${base}?${params.toString()}`;
}

// Loads an <img> for drawing onto canvas. crossOrigin is requested so the
// canvas isn't "tainted" (which would block toBlob() on export) — this only
// actually works if the image server sends back a matching
// Access-Control-Allow-Origin header; not independently confirmed for
// Pollinations as of writing, so the export step below still guards against
// a tainted-canvas SecurityError with a clear message instead of crashing.
export function loadImage(url, useCors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh."));
    img.src = url;
  });
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draws the full cover onto `canvas` (sized to COVER_WIDTH x COVER_HEIGHT).
 * @param {HTMLCanvasElement} canvas
 * @param {{ image?: HTMLImageElement, title: string, chapterLabel?: string }} opts
 */
export function drawCover(canvas, { image, title, chapterLabel }) {
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // Background: cover-fit the image (crop overflow, no letterboxing), or a
  // brand-colored gradient fallback when there's no image yet.
  if (image) {
    const imgRatio = image.width / image.height;
    const canvasRatio = COVER_WIDTH / COVER_HEIGHT;
    let sx, sy, sw, sh;
    if (imgRatio > canvasRatio) {
      sh = image.height;
      sw = sh * canvasRatio;
      sx = (image.width - sw) / 2;
      sy = 0;
    } else {
      sw = image.width;
      sh = sw / canvasRatio;
      sx = 0;
      sy = (image.height - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);
  } else {
    const grad = ctx.createLinearGradient(0, 0, COVER_WIDTH, COVER_HEIGHT);
    grad.addColorStop(0, "#7c3aed");
    grad.addColorStop(1, "#4338ca");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  }

  // Bottom gradient overlay so white text stays readable over any image.
  const overlay = ctx.createLinearGradient(0, COVER_HEIGHT * 0.35, 0, COVER_HEIGHT);
  overlay.addColorStop(0, "rgba(0,0,0,0)");
  overlay.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  const marginX = 100;
  const maxTextWidth = COVER_WIDTH - marginX * 2;

  // Title (bottom-anchored, wraps to multiple lines if long).
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  const chapterFontSize = 46;
  const titleFontSize = 92;
  const chapterY = COVER_HEIGHT - 90;

  if (chapterLabel?.trim()) {
    ctx.font = `600 ${chapterFontSize}px Arial, sans-serif`;
    ctx.fillStyle = "#e9d5ff";
    ctx.fillText(chapterLabel.trim(), marginX, chapterY);
  }

  ctx.font = `800 ${titleFontSize}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  const titleLines = wrapLines(ctx, (title || "").trim() || "Chưa có tên truyện", maxTextWidth);
  const titleLineHeight = titleFontSize * 1.15;
  const titleBottomY = chapterY - (chapterLabel?.trim() ? 70 : 20);
  const titleTopY = titleBottomY - (titleLines.length - 1) * titleLineHeight;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, marginX, titleTopY + i * titleLineHeight);
  });

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Thin accent bar, a small polish touch.
  ctx.fillStyle = "#a78bfa";
  ctx.fillRect(marginX, chapterY + 24, 140, 6);
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không xuất được ảnh."));
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}
