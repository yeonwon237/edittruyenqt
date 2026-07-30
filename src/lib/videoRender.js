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

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpegInstance = null;
let loadPromise = null;

function loadFfmpeg() {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
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

    await ffmpeg.exec([
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

    onStatus?.("Đang hoàn tất...");
    const data = await ffmpeg.readFile("output.mp4");
    return new Blob([data.buffer], { type: "video/mp4" });
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
