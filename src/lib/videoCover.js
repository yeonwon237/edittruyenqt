// Video cover generator: background image (Pollinations.ai, free/no-key —
// or a user-uploaded file) + HTML5 Canvas text overlay (title/chapter),
// 1920x1080 (YouTube standard). Fully client-side, no server involved —
// the background image is fetched directly by the browser from
// Pollinations, never proxied through this app's own hosting.
export const COVER_WIDTH = 1920;
export const COVER_HEIGHT = 1080;

export function buildPollinationsUrl(prompt, seed) {
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: String(COVER_WIDTH),
    height: String(COVER_HEIGHT),
    nologo: "true",
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
