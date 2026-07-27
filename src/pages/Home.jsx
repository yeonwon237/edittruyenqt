import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plus,
  LogOut,
  BookOpen,
  Settings as SettingsIcon,
  Sparkles,
  Search,
  Clock,
  Languages,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

const EMOJIS = ["📚", "🌸", "⚔️", "👑", "💎", "🔥", "🌙", "❄️", "🌿", "🐉", "🦋", "🌹", "🔮", "⛩️", "🌉", "🐺"];
const LANGUAGES = ["Trung", "Anh", "Nhật", "Hàn", "Việt"];
const EMOJI_GRADIENTS = {
  "📚": "from-violet-400 to-indigo-500",
  "🌸": "from-pink-400 to-rose-500",
  "⚔️": "from-red-400 to-orange-500",
  "👑": "from-amber-400 to-yellow-500",
  "💎": "from-cyan-400 to-blue-500",
  "🔥": "from-orange-400 to-red-500",
  "🌙": "from-indigo-400 to-slate-600",
  "❄️": "from-sky-300 to-cyan-400",
  "🌿": "from-emerald-400 to-green-500",
  "🐉": "from-lime-400 to-emerald-500",
  "🦋": "from-purple-400 to-fuchsia-500",
  "🌹": "from-rose-400 to-pink-500",
  "🔮": "from-violet-500 to-purple-600",
  "⛩️": "from-rose-400 to-red-500",
  "🌉": "from-slate-400 to-violet-500",
  "🐺": "from-stone-400 to-amber-600",
};

function gradientFor(emoji) {
  return EMOJI_GRADIENTS[emoji] || "from-violet-400 to-indigo-500";
}

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    source_language: "Trung",
    cover_emoji: "📚",
  });

  useEffect(() => {
    loadProjects();
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const loadProjects = async () => {
    try {
      const data = await base44.entities.Project.list("-updated_date", 100);
      setProjects(data);
    } catch (e) {
      toast({
        title: "Lỗi tải dự án",
        description: e.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    try {
      const created = await base44.entities.Project.create({
        title: form.title.trim(),
        description: form.description.trim(),
        source_language: form.source_language,
        cover_emoji: form.cover_emoji,
        custom_field_definitions: [],
        batch_rules: [],
        pronoun_rules: [],
        contextual_pronoun_rules: [],
        visible_columns: ["raw", "qt", "edited"],
      });
      await base44.entities.Chapter.create({
        project_id: created.id,
        title: "Chương 1",
        chapter_order: 0,
        raw_original: "",
        qt_raw: "",
        edited: "",
      });
      toast({ title: "Đã tạo bộ truyện! ✨" });
      setShowCreate(false);
      navigate(`/workspace/${created.id}`);
    } catch (e) {
      toast({
        title: "Lỗi tạo dự án",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await base44.auth.logout("/login");
  };

  const greeting = user?.full_name ? `Chào, ${user.full_name} 👋` : "Chào bạn 👋";

  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
                Trợ Lý Dịch Thuật & Edit QT
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Không gian làm việc của dịch giả
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 p-6 sm:p-10 shadow-xl">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-amber-300/10 blur-2xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-medium backdrop-blur-sm">
              <Sparkles className="w-3.5 h-3.5" /> Trợ lý AI cho dịch giả
            </span>
            <h2 className="mt-4 text-2xl sm:text-4xl font-bold text-white leading-tight">
              {greeting}
            </h2>
            <p className="mt-2 text-sm sm:text-base text-white/80 max-w-2xl">
              Quản lý bộ truyện, từ điển, ma trận xưng hô theo nhân vật, và biên tập
              QT với AI Gemini · GPT · Claude ngay trong không gian làm việc của bạn.
            </p>

            {/* Stat strip */}
            <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4 max-w-md">
              {[
                { label: "Bộ truyện", value: projects.length, emoji: "📚" },
                {
                  label: "Ngôn ngữ",
                  value: new Set(projects.map((p) => p.source_language)).size,
                  emoji: "🌐",
                },
                {
                  label: "Cập nhật gần",
                  value: projects.length
                    ? formatDistanceToNow(
                        new Date(
                          projects.reduce(
                            (a, b) =>
                              new Date(a.updated_date || a.created_date) >
                              new Date(b.updated_date || b.created_date)
                                ? a
                                : b
                          ).updated_date ||
                            projects[0].created_date
                        ),
                        { addSuffix: true, locale: vi }
                      )
                    : "—",
                  emoji: "⏱️",
                  isText: true,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center"
                >
                  <p className={`${s.isText ? "text-xs sm:text-sm" : "text-xl sm:text-2xl"} font-bold text-white`}>
                    {s.value}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/70 mt-0.5">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm bộ truyện theo tên, mô tả..."
            className="w-full pl-10 pr-3 py-2.5 text-sm rounded-2xl border border-violet-100 bg-white/80 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors"
          />
        </div>
        <button
          onClick={() => {
            setForm({
              title: "",
              description: "",
              source_language: "Trung",
              cover_emoji: "📚",
            });
            setShowCreate(true);
          }}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Tạo bộ truyện mới
        </button>
      </section>

      {/* Cards grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Không tìm thấy bộ truyện phù hợp.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((proj) => (
              <button
                key={proj.id}
                onClick={() => navigate(`/workspace/${proj.id}`)}
                className="group text-left rounded-2xl bg-white border border-violet-100 hover:border-violet-300 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div
                  className={`relative h-24 bg-gradient-to-br ${gradientFor(proj.cover_emoji || "📚")} flex items-center justify-center`}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                  <span className="relative text-5xl drop-shadow-md">
                    {proj.cover_emoji || "📚"}
                  </span>
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white/85 text-[10px] font-medium text-slate-600 flex items-center gap-1 backdrop-blur-sm">
                    <Languages className="w-2.5 h-2.5" />
                    {proj.source_language || "Trung"}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 mb-1 line-clamp-1 group-hover:text-violet-600 transition-colors">
                    {proj.title}
                  </h3>
                  <p className="text-sm text-slate-400 line-clamp-2 mb-3 min-h-[2.5rem]">
                    {proj.description || "Chưa có mô tả"}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {proj.updated_date || proj.created_date
                        ? formatDistanceToNow(
                            new Date(proj.updated_date || proj.created_date),
                            { addSuffix: true, locale: vi }
                          )
                        : "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-violet-500 group-hover:text-violet-700 group-hover:gap-2 transition-all font-medium">
                      Mở <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md rounded-2xl border-violet-100">
          <DialogHeader>
            <DialogTitle className="text-violet-700">
              📚 Tạo bộ truyện mới
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Tên bộ truyện
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Vũ Động Càn Khôn"
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Mô tả
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Mô tả ngắn về bộ truyện..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Ngôn ngữ gốc
              </label>
              <select
                value={form.source_language}
                onChange={(e) =>
                  setForm({ ...form, source_language: e.target.value })
                }
                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 transition-colors"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Biểu tượng
              </label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setForm({ ...form, cover_emoji: emoji })}
                    className={`w-10 h-10 rounded-xl text-xl transition-all ${
                      form.cover_emoji === emoji
                        ? "bg-violet-100 ring-2 ring-violet-400"
                        : "bg-violet-50 hover:bg-violet-100"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.title.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
            >
              Tạo mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="py-16 px-4 text-center">
      <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
        <BookOpen className="w-10 h-10 text-violet-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-700 mb-1">
        Bắt đầu hành trình dịch thuật
      </h3>
      <p className="text-slate-400 text-sm mb-5 max-w-md mx-auto">
        Tạo bộ truyện đầu tiên để bắt đầu biên tập QT cùng AI — hỗ trợ từ điển,
        ma trận xưng hô và nhiều nhà cung cấp AI.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-semibold shadow-sm hover:shadow-md transition-all"
      >
        <Plus className="w-4 h-4" /> Tạo bộ truyện đầu tiên
      </button>
    </div>
  );
}