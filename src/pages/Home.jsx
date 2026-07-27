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
import { Plus, LogOut, BookOpen, Settings as SettingsIcon } from "lucide-react";

const EMOJIS = ["📚", "🌸", "⚔️", "👑", "💎", "🔥", "🌙", "❄️", "🌿", "🐉", "🦋", "🌹"];

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    source_language: "Trung",
    cover_emoji: "📚",
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await base44.entities.Project.list("-created_date", 100);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <div>
              <h1 className="text-lg font-bold text-slate-800">
                Trợ Lý Dịch Thuật & Edit QT
              </h1>
              <p className="text-xs text-slate-400">
                Không gian làm việc của dịch giả
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 text-sm font-medium transition-colors"
            >
              <SettingsIcon className="w-4 h-4" /> Cài đặt
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-700">
            📚 Bộ truyện của bạn
          </h2>
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
          >
            <Plus className="w-4 h-4" /> Tạo bộ truyện mới
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">📖</p>
            <p className="text-slate-400 mb-4">
              Chưa có bộ truyện nào. Hãy tạo bộ truyện đầu tiên!
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold shadow-sm hover:shadow-md transition-all"
            >
              ➕ Tạo bộ truyện
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => (
              <button
                key={proj.id}
                onClick={() => navigate(`/workspace/${proj.id}`)}
                className="group p-5 rounded-2xl bg-white/80 border border-violet-100 hover:border-violet-300 hover:shadow-lg transition-all text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-4xl">{proj.cover_emoji || "📚"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                    {proj.source_language || "Trung"}
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 mb-1 group-hover:text-violet-600 transition-colors">
                  {proj.title}
                </h3>
                <p className="text-sm text-slate-400 line-clamp-2 mb-3">
                  {proj.description || "Chưa có mô tả"}
                </p>
                <div className="flex items-center gap-1 text-xs text-violet-500 group-hover:text-violet-600 transition-colors">
                  <BookOpen className="w-3 h-3" /> Mở workspace →
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

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
                <option value="Trung">Trung</option>
                <option value="Anh">Anh</option>
                <option value="Nhật">Nhật</option>
                <option value="Hàn">Hàn</option>
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
                    className={`w-10 h-10 rounded-xl text-xl transition-all ${form.cover_emoji === emoji ? "bg-violet-100 ring-2 ring-violet-400" : "bg-violet-50 hover:bg-violet-100"}`}
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