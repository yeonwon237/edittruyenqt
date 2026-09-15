import { createContext, useContext, useMemo, useState } from "react";

// Lets Workspace publish its already-computed chapter list (with QA/beta/
// word-count badges) up to the persistent desktop AppSidebar, instead of
// AppSidebar re-fetching chapters and re-running QA scans on its own.
const DesktopSidebarContext = createContext(null);

export function DesktopSidebarProvider({ children }) {
  const [chapterNav, setChapterNav] = useState(null);
  const value = useMemo(() => ({ chapterNav, setChapterNav }), [chapterNav]);
  return <DesktopSidebarContext.Provider value={value}>{children}</DesktopSidebarContext.Provider>;
}

export function useDesktopSidebarContext() {
  return useContext(DesktopSidebarContext);
}

// True whenever the page is rendered inside DesktopLayout's AppSidebar
// chrome — regardless of platform. Now used on both web and desktop (see
// App.jsx: /stories, /workspace/:projectId and /settings route through
// DesktopLayout on both), so components that need to know "is the sidebar
// nav present, do I need my own header" should check this instead of
// isDesktopApp(). Keep using isDesktopApp() itself for things that are
// genuinely about the Tauri runtime (the NMT sidecar, Local SQLite storage,
// WKWebView-specific CSS fixes) — those still only exist on desktop.
export function useInSidebarLayout() {
  return Boolean(useContext(DesktopSidebarContext));
}
