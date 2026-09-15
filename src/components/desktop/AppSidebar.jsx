import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Project } from "@/api/dataClient";
import { fetchAllPages } from "@/lib/paginate";
import { useAuth } from "@/lib/AuthContext";
import { useDesktopSidebarContext } from "@/lib/desktopSidebarContext";
import { ChapterListBody } from "@/components/workspace/ChapterPicker";
import { ArrowLeft, Plus, Settings as SettingsIcon, LogOut, Home } from "lucide-react";
import logo from "@/assets/lilynovel-logo.png";
import { isDesktopApp } from "@/lib/platform";

// Persistent left navigation for the desktop app. Deliberately square/flat
// (no rounded-* anywhere, no backdrop-blur, no soft gradient cards) — a
// distinct visual language from the rest of the app's rounded/glassy look,
// per explicit user request to move away from that "generic AI SaaS" feel
// for the desktop app specifically. Active/hover state reads as a solid
// left accent bar + flat tint instead of a rounded pill highlight. Two
// modes depending on the route: project list (browsing/picking a story) or
// chapter list (inside one). See src/lib/desktopSidebarContext.jsx for how
// Workspace publishes its already-loaded chapter data here instead of this
// component re-fetching and re-running QA scans on its own.
export default function AppSidebar() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const location = useLocation();
  const { logout } = useAuth();
  const { chapterNav } = useDesktopSidebarContext() || {};
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const inProject = Boolean(projectId) && Boolean(chapterNav);

  useEffect(() => {
    if (inProject) return;
    let cancelled = false;
    setLoadingProjects(true);
    fetchAllPages((limit, skip) => Project.list("-updated_date", limit, skip), { pageSize: 200, maxItems: 5000 })
      .then((data) => { if (!cancelled) setProjects(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
    // Re-list whenever we come back to a non-project route (e.g. after
    // creating/deleting a story in StoryLibrary) so the sidebar stays fresh.
  }, [inProject, location.key]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-300 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-[#1a1a1c] dark:text-slate-300">
      <button
        onClick={() => navigate("/stories")}
        className="flex items-center gap-2.5 border-b border-slate-300 px-4 py-3.5 text-left transition-colors hover:bg-slate-200 dark:border-white/10 dark:hover:bg-white/[0.06]"
        title="Về thư viện truyện"
      >
        <img src={logo} alt="" className="h-6 w-6 shrink-0" />
        <span className="truncate text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">LilyNovel</span>
      </button>

      {inProject ? (
        <>
          <div className="flex items-center gap-2 border-b border-slate-300 px-3 py-2.5 dark:border-white/10">
            <button
              onClick={() => navigate("/stories")}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
              title="Đổi truyện"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{chapterNav.projectTitle}</span>
            <button
              onClick={chapterNav.onCreateChapter}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-amber-600/40 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20"
              title="Tạo chương mới"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ChapterListBody
              chapters={chapterNav.chapters}
              currentChapterId={chapterNav.currentChapterId}
              onSelect={chapterNav.onSelect}
              wordCounts={chapterNav.wordCounts}
              averageWords={chapterNav.averageWords}
              editedSampleSize={chapterNav.editedSampleSize}
              editedChapterIds={chapterNav.editedChapterIds}
              qaIssueIds={chapterNav.qaIssueIds}
              betaIssueIds={chapterNav.betaIssueIds}
              autoFocusSearch={false}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-slate-300 px-4 py-2.5 dark:border-white/10">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-500">Thư viện truyện</span>
            <button
              onClick={() => navigate("/stories")}
              className="flex h-7 w-7 items-center justify-center text-violet-700 hover:bg-violet-200/60 dark:text-violet-300 dark:hover:bg-violet-500/20"
              title="Tạo bộ truyện mới"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingProjects ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600 dark:border-white/10 dark:border-t-violet-400" />
              </div>
            ) : projects.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">Chưa có bộ truyện nào.</p>
            ) : (
              projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => navigate(`/workspace/${proj.id}`)}
                  className="flex w-full items-center gap-2.5 border-l-2 border-transparent px-4 py-2 text-left transition-colors hover:border-violet-500 hover:bg-slate-200/70 dark:hover:border-violet-400 dark:hover:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">{proj.title}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-slate-300 px-2 py-2 dark:border-white/10">
        {/* Web only — everything outside this sidebar layout (TTS/Video/
            Subtitle/CoverDesigner/RoleplayStudio/PromptGenerator) still
            lives on the old Home hub; desktop has no such pages. */}
        {!isDesktopApp() && (
          <button
            onClick={() => navigate("/")}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
            title="Trang chủ"
          >
            <Home className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => navigate("/settings")}
          className="flex flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/[0.06]"
        >
          <SettingsIcon className="h-4 w-4 shrink-0" /> Cài đặt
        </button>
        <button
          onClick={handleLogout}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          title="Đăng xuất"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
