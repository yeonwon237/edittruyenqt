import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  BookOpen, Settings as SettingsIcon, LogOut, Volume2, Clapperboard,
  Captions, ArrowUpRight, Sparkles, Bot, Layers3, ShieldCheck, Zap, Palette,
} from "lucide-react";
import AISettingsDialog from "@/components/workspace/AISettingsDialog";

const FEATURES = [
  { id: "edit", icon: BookOpen, title: "Biên tập truyện", eyebrow: "Không gian chính", desc: "Quản lý bộ truyện, từ điển, ma trận xưng hô và biên tập bản QT với trợ lý AI.", to: "/stories", color: "violet", number: "01" },
  { id: "audio", icon: Volume2, title: "Tạo audio", eyebrow: "Chuyển văn bản", desc: "Biến bản edit thành giọng đọc tự nhiên và tạo phụ đề đồng bộ theo nội dung.", to: "/text-to-speech", color: "emerald", number: "02" },
  { id: "video", icon: Clapperboard, title: "Dựng video", eyebrow: "Sản xuất nội dung", desc: "Ghép audio, hình ảnh và hiệu ứng thành video truyện sẵn sàng để xuất bản.", to: "/create-video", color: "amber", number: "03" },
  { id: "subtitle", icon: Captions, title: "Tạo phụ đề", eyebrow: "Căn chỉnh thời gian", desc: "Tách câu, điều chỉnh timeline và xuất tệp phụ đề SRT hoặc VTT chuyên nghiệp.", to: "/create-subtitle", color: "sky", number: "04" },
  { id: "cover", icon: Palette, title: "Làm bìa truyện", eyebrow: "Studio thiết kế", desc: "Tạo bìa truyện chuyên nghiệp từ ảnh của bạn với chữ nghệ thuật, bố cục linh hoạt và xuất ảnh chất lượng cao.", to: "/cover-designer", color: "rose", number: "05" },
];

const TONES = {
  violet: { icon: "bg-violet-600 text-white", glow: "from-violet-100/80", text: "text-violet-600" },
  emerald: { icon: "bg-emerald-600 text-white", glow: "from-emerald-100/80", text: "text-emerald-600" },
  amber: { icon: "bg-amber-500 text-white", glow: "from-amber-100/80", text: "text-amber-600" },
  sky: { icon: "bg-sky-600 text-white", glow: "from-sky-100/80", text: "text-sky-600" },
  rose: { icon: "bg-rose-600 text-white", glow: "from-rose-100/80", text: "text-rose-600" },
};

export default function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showAISettings, setShowAISettings] = useState(false);
  const handleLogout = async () => { await logout(); window.location.href = "/login"; };
  const name = user?.user_metadata?.full_name?.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 border-b border-violet-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => navigate("/")} className="flex min-w-0 items-center gap-3 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_10px_24px_-10px_rgb(var(--violet-600))]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">Trợ Lý Sáng Tạo Truyện</span>
              <span className="hidden text-[11px] font-medium text-slate-400 sm:block">Biên tập · Audio · Video · Phụ đề</span>
            </span>
          </button>
          <nav className="flex items-center gap-1.5" aria-label="Tài khoản và cài đặt">
            <button onClick={() => setShowAISettings(true)} className="app-header-action" title="Cấu hình trợ lý AI"><Bot className="h-4 w-4" /><span className="hidden sm:inline">Trợ lý AI</span></button>
            <button onClick={() => navigate("/settings")} className="app-header-action" title="Cài đặt"><SettingsIcon className="h-4 w-4" /><span className="hidden sm:inline">Cài đặt</span></button>
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <button onClick={handleLogout} className="app-header-action app-header-action--muted" title="Đăng xuất"><LogOut className="h-4 w-4" /><span className="hidden md:inline">Đăng xuất</span></button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <section className="dashboard-hero">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 backdrop-blur">
              <Zap className="h-3.5 w-3.5" /> Không gian sáng tạo tập trung
            </span>
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              {name ? `Chào ${name},` : "Chào bạn,"}<br />hôm nay mình tạo nên điều gì?
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
              Toàn bộ quy trình từ bản thảo đến nội dung hoàn chỉnh nằm trong một nơi. Chọn công cụ bên dưới để tiếp tục.
            </p>
          </div>
          <div className="dashboard-hero__orb" />
          <div className="relative z-10 mt-10 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
            <div className="hero-stat"><Layers3 /><span><strong>4 công cụ</strong><small>Một quy trình thống nhất</small></span></div>
            <div className="hero-stat"><ShieldCheck /><span><strong>Riêng tư</strong><small>Dữ liệu trong tài khoản</small></span></div>
            <div className="hero-stat"><Sparkles /><span><strong>AI linh hoạt</strong><small>Gemini · GPT · Claude</small></span></div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Bộ công cụ</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Bắt đầu công việc</h2></div>
            <p className="hidden text-sm text-slate-400 sm:block">Chọn một không gian để tiếp tục</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const tone = TONES[feature.color];
              return (
                <button key={feature.id} onClick={() => navigate(feature.to)} className="feature-card group">
                  <div className={`feature-card__wash bg-gradient-to-br ${tone.glow} to-transparent`} />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${tone.icon}`}><Icon className="h-5 w-5" /></span>
                      <span className="text-xs font-bold tracking-widest text-slate-300">{feature.number}</span>
                    </div>
                    <div className="mt-8">
                      <p className={`text-[11px] font-bold uppercase tracking-[.16em] ${tone.text}`}>{feature.eyebrow}</p>
                      <div className="mt-2 flex items-center justify-between gap-3"><h3 className="text-xl font-bold text-slate-900">{feature.title}</h3><ArrowUpRight className="h-5 w-5 text-slate-300 transition-all group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-violet-600" /></div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{feature.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </main>
      <AISettingsDialog open={showAISettings} onOpenChange={setShowAISettings} />
    </div>
  );
}
