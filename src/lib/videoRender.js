// Client-side MP4 rendering: merges one still image (the cover) with one
// audio file into a video, entirely in the browser via ffmpeg.wasm — no
// server involved. Uses the SINGLE-THREAD ffmpeg core deliberately (not
// the faster multi-thread one), which needs SharedArrayBuffer and therefore
// two special response headers (Cross-Origin-Opener-Policy /
// Cross-Origin-Embedder-Policy) that this app's Vercel deployment isn't
// configured for and that can't be verified without a live browser in this
// environment — the single-thread core works with zero server config,
// trading speed for certainty of actually working.
//
// The ~31MB core binary is fetched from a public CDN (unpkg) at runtime,
// not bundled into this app's own deploy — same principle already used for
// Pollinations/Gemini images, so it costs this app's own Vercel bandwidth
// nothing.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

// @ffmpeg/core is versioned INDEPENDENTLY from @ffmpeg/ffmpeg (the wrapper
// in package.json) — an earlier version of this file guessed the core
// version would match the wrapper's (0.12.6) and hardcoded that, which is
// wrong and 404s. Deliberately left unversioned here so unpkg resolves it
// to whatever the current latest published @ffmpeg/core actually is,
// instead of guessing a version number that may not exist.
//
// /dist/esm, NOT /dist/umd: ffmpeg.wasm's own load() does a real ES
// `import()` of ffmpeg-core.js internally, which only works against the
// ESM build — the UMD build (a plain classic script, no `export`
// statements) fails that import with exactly "failed to import
// ffmpeg-core.js" (confirmed in testing), even though the file fetches
// fine. This is apparently the standard gotcha for this library with Vite.
const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core/dist/esm";

let ffmpegInstance = null;
let loadPromise = null;

// Turns whatever ffmpeg.wasm/the browser throws (sometimes a plain Error,
// sometimes an ErrorEvent from a failed Worker/script load with no useful
// .message) into a string that's actually informative on screen — the
// previous version surfaced a blank/empty error toast when this happened,
// which is exactly what showed up in testing.
function describeError(e) {
  if (e instanceof Error && e.message) return e.message;
  if (e?.message) return String(e.message);
  if (typeof e === "string" && e) return e;
  try {
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
  } catch {}
  return String(e) || "Lỗi không xác định (không có mô tả chi tiết).";
}

export function loadFfmpeg() {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();
      const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (e) {
      loadPromise = null; // allow retrying instead of caching a failed load forever
      throw new Error(`Không tải được công cụ dựng video: ${describeError(e)}`);
    }
  })();
  return loadPromise;
}

/**
 * Merges a still cover image with an audio file into a downloadable MP4.
 * @param {{
 *   imageBlob: Blob,
 *   audioFile: Blob|File,
 *   onProgress?: (percent: number) => void,
 *   onStatus?: (status: string) => void,
 * }} opts
 * @returns {Promise<Blob>}
 */
export async function renderVideoFromAudioAndImage({ imageBlob, audioFile, onProgress, onStatus }) {
  onStatus?.("Đang tải công cụ dựng video (lần đầu có thể mất khoảng 1 phút)...");
  const ffmpeg = await loadFfmpeg();

  // Attached per-render (not once globally) since ffmpeg.wasm only keeps
  // the latest listener reliably across repeated .exec() calls in some
  // versions — cheap to re-attach each time.
  const handleProgress = ({ progress }) => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
      onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
    }
  };
  ffmpeg.on("progress", handleProgress);

  try {
    onStatus?.("Đang xử lý audio + ảnh bìa...");
    await ffmpeg.writeFile("cover.png", await fetchFile(imageBlob));
    await ffmpeg.writeFile("audio.mp3", await fetchFile(audioFile));

    const ret = await ffmpeg.exec([
      "-loop", "1",
      "-i", "cover.png",
      "-i", "audio.mp3",
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-shortest",
      "output.mp4",
    ]);
    // ffmpeg.wasm's exec() resolves with an exit code rather than throwing
    // on failure in some versions — a non-zero code here means the merge
    // itself failed (e.g. unreadable input) even though no JS exception
    // was raised, so this needs its own explicit check.
    if (typeof ret === "number" && ret !== 0) {
      throw new Error(`FFmpeg thoát với mã lỗi ${ret} — có thể do file audio/ảnh không hợp lệ.`);
    }

    onStatus?.("Đang hoàn tất...");
    const data = await ffmpeg.readFile("output.mp4");
    if (!data || !data.length) {
      throw new Error("Không tạo được file video (kết quả rỗng).");
    }
    return new Blob([data.buffer], { type: "video/mp4" });
  } catch (e) {
    throw new Error(describeError(e));
  } finally {
    ffmpeg.off("progress", handleProgress);
    // Clean up the virtual filesystem so a second render in the same
    // session doesn't accumulate stale files.
    try {
      await ffmpeg.deleteFile("cover.png");
      await ffmpeg.deleteFile("audio.mp3");
      await ffmpeg.deleteFile("output.mp4");
    } catch {
      // Best-effort cleanup only — a failure here shouldn't surface as an
      // error to the user since the render itself already succeeded.
    }
  }
}

/**
 * Transcodes an audio Blob (e.g. the .webm recorded from browser TTS
 * tab-capture) to .mp3, reusing the same ffmpeg.wasm instance/loader as
 * video rendering above.
 * @param {{ onProgress?: (percent: number) => void, onStatus?: (status: string) => void }} opts
 * @returns {Promise<Blob>}
 */
export async function convertAudioToMp3(audioBlob, { onProgress, onStatus } = {}) {
  onStatus?.("Đang tải công cụ chuyển đổi (lần đầu có thể mất khoảng 1 phút)...");
  const ffmpeg = await loadFfmpeg();

  const handleProgress = ({ progress }) => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
      onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
    }
  };
  ffmpeg.on("progress", handleProgress);

  try {
    onStatus?.("Đang chuyển sang .mp3...");
    await ffmpeg.writeFile("input.audio", await fetchFile(audioBlob));
    const ret = await ffmpeg.exec(["-i", "input.audio", "-vn", "-b:a", "192k", "output.mp3"]);
    if (typeof ret === "number" && ret !== 0) {
      throw new Error(`FFmpeg thoát với mã lỗi ${ret} khi chuyển sang mp3.`);
    }
    const data = await ffmpeg.readFile("output.mp3");
    if (!data || !data.length) {
      throw new Error("Không tạo được file mp3 (kết quả rỗng).");
    }
    return new Blob([data.buffer], { type: "audio/mpeg" });
  } catch (e) {
    throw new Error(describeError(e));
  } finally {
    ffmpeg.off("progress", handleProgress);
    try {
      await ffmpeg.deleteFile("input.audio");
      await ffmpeg.deleteFile("output.mp3");
    } catch {
      // Best-effort cleanup only.
    }
  }
}
