import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { lazy, Suspense } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';

// Each screen is downloaded only when it is opened. This keeps large editor,
// document, audio and video dependencies out of the initial app download.
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Home = lazy(() => import('@/pages/Home'));
const StoryLibrary = lazy(() => import('@/pages/StoryLibrary'));
const Workspace = lazy(() => import('@/pages/Workspace'));
const Settings = lazy(() => import('@/pages/Settings'));
const TextToSpeech = lazy(() => import('@/pages/TextToSpeech'));
const CreateVideo = lazy(() => import('@/pages/CreateVideo'));
const CreateSubtitle = lazy(() => import('@/pages/CreateSubtitle'));
const CoverDesigner = lazy(() => import('@/pages/CoverDesigner'));
const RoleplayStudio = lazy(() => import('@/pages/RoleplayStudio'));
const PromptGenerator = lazy(() => import('@/pages/PromptGenerator'));

const AppLoading = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
    <div className="h-7 w-7 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
    <p className="mt-3 text-sm text-muted-foreground">Đang mở…</p>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <div className="h-7 w-7 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
        </div>
        <p className="mt-4 text-sm font-medium text-muted-foreground">Đang chuẩn bị không gian làm việc…</p>
      </div>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<Home />} />
        <Route path="/stories" element={<StoryLibrary />} />
        <Route path="/workspace/:projectId" element={<Workspace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/text-to-speech" element={<TextToSpeech />} />
        <Route path="/create-video" element={<CreateVideo />} />
        <Route path="/create-subtitle" element={<CreateSubtitle />} />
        <Route path="/cover-designer" element={<CoverDesigner />} />
        <Route path="/roleplay" element={<RoleplayStudio />} />
        <Route path="/roleplay/:projectId" element={<RoleplayStudio />} />
        <Route path="/prompt-generator" element={<PromptGenerator />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
