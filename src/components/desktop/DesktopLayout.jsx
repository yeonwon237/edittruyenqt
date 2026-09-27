import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { DesktopSidebarProvider } from "@/lib/desktopSidebarContext";
import AppSidebar from "@/components/desktop/AppSidebar";
import { Menu } from "lucide-react";

// Layout route mounted only for the Tauri desktop build (see src/App.jsx) —
// keeps AppSidebar persistent across /stories, /workspace/:projectId and
// /settings instead of remounting a full-page header on every navigation.
export default function DesktopLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith("/workspace/");
  // Toggles a class on the real <html> element (outside React's mount div)
  // so src/index.css can disable WKWebView's rubber-band scroll bounce —
  // see the html.desktop-app rule there for why.
  useEffect(() => {
    document.documentElement.classList.add("desktop-app");
    return () => document.documentElement.classList.remove("desktop-app");
  }, []);

  return (
    <DesktopSidebarProvider>
      {/* No hardcoded "dark" class here anymore — light/dark now follows
          src/lib/colorMode.js's toggle on <html> (same mechanism the web
          Sáng/Tối setting uses), so the desktop app can switch too instead
          of being stuck permanently dark. bg-background/text-foreground
          follow the shared shadcn tokens (light in :root, dark in .dark —
          see src/index.css), so this container itself repaints correctly
          either way. */}
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        <AppSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[3.25rem] min-h-[3.25rem] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 md:hidden dark:border-white/10 dark:bg-[#1a1a1c]">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-white/10"
              aria-label="Mở danh sách truyện và chương"
              aria-expanded={mobileSidebarOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">LilyNovel</span>
          </div>
          <div className={`min-h-0 min-w-0 flex-1 ${isWorkspace ? "overflow-hidden" : "overflow-y-auto overscroll-y-contain"}`}>
            <Outlet />
          </div>
        </div>
      </div>
    </DesktopSidebarProvider>
  );
}
