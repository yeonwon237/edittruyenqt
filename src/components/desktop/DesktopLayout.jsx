import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { DesktopSidebarProvider } from "@/lib/desktopSidebarContext";
import AppSidebar from "@/components/desktop/AppSidebar";

// Layout route mounted only for the Tauri desktop build (see src/App.jsx) —
// keeps AppSidebar persistent across /stories, /workspace/:projectId and
// /settings instead of remounting a full-page header on every navigation.
export default function DesktopLayout() {
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
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <AppSidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </DesktopSidebarProvider>
  );
}
