import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, LogOut } from "lucide-react";
import { isDraftMode, setDraftMode } from "@/lib/draftMode";
import { THEMES, getTheme, setTheme } from "@/lib/theme";
import { Switch } from "@/components/ui/switch";

// General app settings — interface/behavior only. AI provider/API key/model
// configuration for editing a story lives inside the Workspace itself now
// (AISettingsDialog), not here, since it's per-editing-session, not
// app-wide appearance.
export default function Settings() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [draftMode, setDraftModeState] = useState(isDraftMode());
  const [theme, setThemeState] = useState(getTheme());

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const handleToggleDraftMode = (checked) => {
    setDraftMode(checked);
    setDraftModeState(checked);
    toast({
      title: checked ? "Đã bật chế độ nháp 📝" : "Đã tắt chế độ nháp",
      description: checked
        ? "Sẽ không tự động lưu nữa — chỉ lưu khi bạn bấm nút Lưu trong Workspace."
        : "Quay lại tự động lưu như bình thường.",
    });
  };

  const handleChangeTheme = (id) => {
    setTheme(id);
    setThemeState(id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 pb-16">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 rounded-lg hover:bg-violet-50 text-slate-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-lg font-bold text-slate-800">Cài đặt</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 text-sm font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Đăng xuất
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {user && (
          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Tài khoản
            </h2>
            <p className="text-sm text-slate-500">
              {user.user_metadata?.full_name && (
                <span className="font-medium">{user.user_metadata.full_name} · </span>
              )}
              {user.email}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-1">
                📝 Chế độ nháp
              </h2>
              <p className="text-xs text-slate-400">
                Tắt tự động lưu — dùng khi bạn chỉ chế biến văn bản rồi copy ra ngoài, không
                cần lưu lại trên web. Vẫn có thể bấm nút Lưu thủ công trong Workspace khi muốn.
              </p>
            </div>
            <Switch checked={draftMode} onCheckedChange={handleToggleDraftMode} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">🎨 Giao diện</h2>
          <p className="text-xs text-slate-400 mb-3">
            Đổi màu chủ đạo của web. Áp dụng ngay trên máy này, không ảnh hưởng người khác.
          </p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleChangeTheme(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  theme === t.id
                    ? "border-violet-400 bg-violet-50 text-violet-700 font-medium"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                  style={{ backgroundColor: t.swatch }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
          <p className="text-xs text-slate-400">
            🤖 Cài đặt Nhà cung cấp AI (API Key, model) đã chuyển vào bên trong từng bộ truyện —
            mở một bộ truyện, bấm nút "AI" trên thanh công cụ để cấu hình.
          </p>
        </div>
      </main>
    </div>
  );
}
