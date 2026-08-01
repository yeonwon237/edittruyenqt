import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  BookOpen,
  Settings as SettingsIcon,
  LogOut,
  Volume2,
  Clapperboard,
  Captions,
  ArrowRight,
  Sparkles,
  Bot,
} from "lucide-react";
import AISettingsDialog from "@/components/workspace/AISettingsDialog";

const FEATURES = [
  {
    id: "edit",
    icon: BookOpen,
    title: "Edit Truyện",
    desc: "Quản lý bộ truyện, từ điển, ma trận xưng hô và biên tập QT với AI Gemini · GPT · Claude.",
    to: "/stories",
    gradFrom: "from-violet-500",
    gradTo: "to-indigo-600",
  },
  {
    id: "audio",
    icon: Volume2,
    title: "Tạo Audio",
    desc: "Chuyển văn bản truyện thành audio, kèm tạo phụ đề .srt/.vtt.",
    to: "/text-to-speech",
    gradFrom: "from-emerald-500",
    gradTo: "to-teal-600",
  },
  {
    id: "video",
    icon: Clapperboard,
    title: "Tạo Video",
    desc: "Biến audio truyện thành video.",
    to: "/create-video",
    gradFrom: "from-amber-500",
    gradTo: "to-orange-600",
  },
  {
    id: "subtitle",
    icon: Captions,
    title: "Tạo Phụ Đề",
    desc: "Tự tách câu, căn thời gian theo audio, sửa tay và tải .srt/.vtt.",
    to: "/create-subtitle",
    gradFrom: "from-sky-500",
    gradTo: "to-indigo-600",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showAISettings, setShowAISettings] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const greeting = user?.user_metadata?.full_name ? `Chào, ${user.user_metadata.full_name} 👋` : "Chào bạn 👋";

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
                Trợ Lý Sáng Tạo Truyện
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Edit · Audio · Video · Phụ đề
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAISettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 text-sm font-medium transition-colors"
              title="Cấu hình AI (Key/model dùng chung cho mọi chức năng)"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI</span>
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 text-sm font-medium transition-colors"
              title="Cài đặt"
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Cài đặt</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-600 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" /> Trợ lý AI cho dịch giả & sáng tạo nội dung
          </span>
          <h2 className="mt-4 text-2xl sm:text-4xl font-bold text-slate-800">
            {greeting}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-500">
            Chọn một chức năng để bắt đầu
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const content = (
              <>
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradFrom} ${f.gradTo} flex items-center justify-center text-white shadow-md shrink-0`}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-800">{f.title}</h3>
                    {f.comingSoon && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                        Sắp ra mắt
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{f.desc}</p>
                </div>
                {!f.comingSoon && (
                  <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-1 transition-all shrink-0 self-center" />
                )}
              </>
            );

            if (f.comingSoon) {
              return (
                <div
                  key={f.id}
                  className="group flex items-start gap-4 p-5 sm:p-6 rounded-3xl bg-white/60 border border-slate-100 opacity-70 cursor-not-allowed"
                >
                  {content}
                </div>
              );
            }
            return (
              <button
                key={f.id}
                onClick={() => navigate(f.to)}
                className="group flex items-start gap-4 p-5 sm:p-6 rounded-3xl bg-white border border-violet-100 hover:border-violet-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all text-left"
              >
                {content}
              </button>
            );
          })}
        </div>
      </main>

      <AISettingsDialog open={showAISettings} onOpenChange={setShowAISettings} />
    </div>
  );
}
