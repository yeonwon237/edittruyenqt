import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download as DownloadIcon, Apple, MonitorCog, ExternalLink } from "lucide-react";

// Public GitHub Releases API — no auth needed for a public repo. Assets come
// from .github/workflows/desktop-release.yml (tauri-action attaches the
// macOS .dmg and Windows .msi/.exe to the release created by pushing a `v*`
// tag — see docs/desktop-packaging.md for the full pipeline).
const REPO = "yeonwon237/edittruyenqt";

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return null;
}

function pickAsset(assets, matcher) {
  return assets.find((a) => matcher(a.name.toLowerCase()));
}

export default function Download() {
  const [release, setRelease] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const platform = detectPlatform();

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Chưa có bản phát hành nào." : `Lỗi tải thông tin (${res.status})`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setRelease(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const assets = release?.assets || [];
  const macAsset = pickAsset(assets, (n) => n.endsWith(".dmg"));
  const winAsset = pickAsset(assets, (n) => n.endsWith(".msi") || n.endsWith(".exe"));

  const CARD = "flex flex-col gap-3 border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#1e1e1e]">
      <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#1e1e1e]/80">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="p-2 hover:bg-violet-50 text-slate-500 transition-colors dark:text-slate-400 dark:hover:bg-white/5">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Tải ứng dụng LilyNovel</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bản desktop chạy AI dịch + QA xưng hô ngay trên máy bạn, không cần mạng khi biên tập
          (trừ lúc đăng nhập/đồng bộ). Tải bản đúng hệ điều hành bên dưới.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-violet-500 dark:border-white/10 dark:border-t-violet-400" />
          </div>
        )}

        {error && !loading && (
          <div className={CARD}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        )}

        {!loading && !error && release && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={`${CARD} ${platform === "mac" ? "border-violet-400 dark:border-violet-500/50" : ""}`}>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Apple className="h-5 w-5" />
                  <span className="font-semibold">macOS</span>
                  {platform === "mac" && <span className="text-xs font-medium text-violet-600 dark:text-violet-300">— máy bạn</span>}
                </div>
                {macAsset ? (
                  <a
                    href={macAsset.browser_download_url}
                    className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
                  >
                    <DownloadIcon className="h-4 w-4" /> Tải .dmg ({(macAsset.size / 1024 / 1024).toFixed(0)} MB)
                  </a>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Chưa có bản macOS trong lần phát hành này.</p>
                )}
              </div>

              <div className={`${CARD} ${platform === "windows" ? "border-violet-400 dark:border-violet-500/50" : ""}`}>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <MonitorCog className="h-5 w-5" />
                  <span className="font-semibold">Windows</span>
                  {platform === "windows" && <span className="text-xs font-medium text-violet-600 dark:text-violet-300">— máy bạn</span>}
                </div>
                {winAsset ? (
                  <a
                    href={winAsset.browser_download_url}
                    className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
                  >
                    <DownloadIcon className="h-4 w-4" /> Tải {winAsset.name.endsWith(".msi") ? ".msi" : ".exe"} ({(winAsset.size / 1024 / 1024).toFixed(0)} MB)
                  </a>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Chưa có bản Windows trong lần phát hành này.</p>
                )}
              </div>
            </div>

            <div className={CARD}>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Phiên bản: <span className="font-medium text-slate-600 dark:text-slate-300">{release.tag_name}</span>
                {release.published_at && ` · ${new Date(release.published_at).toLocaleDateString("vi-VN")}`}
              </p>
              <a
                href={release.html_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-violet-600 hover:underline dark:text-violet-300"
              >
                Xem ghi chú phát hành trên GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
