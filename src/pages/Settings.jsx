import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { FileEdit, Database, Sun, Moon, Palette, Bot, X } from "lucide-react";
import { isDraftMode, setDraftMode } from "@/lib/draftMode";
import { THEMES, getTheme, setTheme } from "@/lib/theme";
import { getColorMode, setColorMode } from "@/lib/colorMode";
import { Switch } from "@/components/ui/switch";
import { isDesktopApp } from "@/lib/platform";
import { getDataMode, setDataMode } from "@/api/dataClient";

// General app settings — interface/behavior only. AI provider/API key/model
// configuration for editing a story lives inside the Workspace itself now
// (AISettingsDialog), not here, since it's per-editing-session, not
// app-wide appearance. Always rendered inside DesktopLayout's AppSidebar now
// (web and desktop both — see App.jsx), which already owns navigation and
// logout, so this page itself only needs a "close" affordance back to
// wherever the user came from.
export default function Settings() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [draftMode, setDraftModeState] = useState(isDraftMode());
  const [theme, setThemeState] = useState(getTheme());
  const [dataMode, setDataModeState] = useState(getDataMode());
  const [colorMode, setColorModeState] = useState(getColorMode());

  const handleToggleDraftMode = (checked) => {
    setDraftMode(checked);
    setDraftModeState(checked);
    toast({
      title: checked ? "Đã bật chế độ nháp" : "Đã tắt chế độ nháp",
      description: checked
        ? "Sẽ không tự động lưu nữa — chỉ lưu khi bạn bấm nút Lưu trong Workspace."
        : "Quay lại tự động lưu như bình thường.",
    });
  };

  const handleChangeTheme = (id) => {
    setTheme(id);
    setThemeState(id);
  };

  const handleChangeColorMode = (mode) => {
    setColorMode(mode);
    setColorModeState(mode);
  };

  const handleChangeDataMode = (mode) => {
    if (mode === dataMode) return;
    setDataMode(mode);
    setDataModeState(mode);
    toast({
      title: mode === "local" ? "Đã chuyển sang lưu Local" : "Đã chuyển sang lưu Cloud",
      description: "Dữ liệu Local và Cloud hiện chưa đồng bộ với nhau — đây là 2 kho riêng biệt (tính năng đồng bộ sẽ có ở bản sau). Mở lại thư viện truyện để thấy đúng kho vừa chọn.",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16 dark:bg-[#1e1e1e]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-[#1e1e1e]/90">
        <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Cài đặt</h1>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
          title="Đóng Cài đặt, quay lại nơi vừa làm việc"
        >
          <X className="h-3.5 w-3.5" /> Đóng
        </button>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-5">
        {user && (
          <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
            <h2 className="text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200">
              Tài khoản
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {user.user_metadata?.full_name && (
                <span className="font-medium">{user.user_metadata.full_name} · </span>
              )}
              {user.email}
            </p>
          </div>
        )}

        <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200">
                <FileEdit className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Chế độ nháp
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Tắt tự động lưu — dùng khi bạn chỉ chế biến văn bản rồi copy ra ngoài, không
                cần lưu lại trên web. Vẫn có thể bấm nút Lưu thủ công trong Workspace khi muốn.
              </p>
            </div>
            <Switch checked={draftMode} onCheckedChange={handleToggleDraftMode} />
          </div>
        </div>

        {isDesktopApp() && (
          <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200"><Database className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Lưu dữ liệu</h2>
            <p className="text-xs text-slate-400 mb-3 dark:text-slate-500">
              Cloud (Supabase, giống web, đồng bộ nhiều máy) hoặc Local (file SQLite ngay trên máy này, hoạt động không cần mạng). Hai kho hiện{" "}
              <strong>chưa đồng bộ với nhau</strong> — đổi qua lại nghĩa là làm việc trên 2 kho dữ liệu riêng biệt.
            </p>
            <div className="flex gap-2">
              {[
                { id: "cloud", label: "Cloud" },
                { id: "local", label: "Local" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleChangeDataMode(option.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                    dataMode === option.id
                      ? "border-violet-400 bg-violet-50 text-violet-700 font-medium dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200"><Sun className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Sáng / Tối</h2>
          <p className="text-xs text-slate-400 mb-3 dark:text-slate-500">
            Đổi cả nền, thẻ, chữ của toàn app — khác với màu nhấn bên dưới (chỉ đổi màu nút/banner). Áp dụng ngay trên máy này.
          </p>
          <div className="flex gap-2">
            {[
              { id: "light", label: "Sáng", Icon: Sun },
              { id: "dark", label: "Tối", Icon: Moon },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => handleChangeColorMode(option.id)}
                className={`flex items-center gap-2 px-3 py-2 border text-sm transition-colors ${
                  colorMode === option.id
                    ? "border-violet-400 bg-violet-50 text-violet-700 font-medium dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                }`}
              >
                <option.Icon className="h-3.5 w-3.5" /> {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200"><Palette className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Màu nhấn</h2>
          <p className="text-xs text-slate-400 mb-3 dark:text-slate-500">
            Màu nút/banner chủ đạo. Áp dụng ngay trên máy này, không ảnh hưởng người khác.
          </p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleChangeTheme(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  theme === t.id
                    ? "border-violet-400 bg-violet-50 text-violet-700 font-medium dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
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

        <div className="bg-white/90 rounded-3xl border border-white shadow-sm p-6 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <p className="flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Bot className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            Cài đặt Nhà cung cấp AI (API Key, model) đã chuyển vào bên trong từng bộ truyện —
            mở một bộ truyện, bấm nút "AI" trên thanh công cụ để cấu hình.
          </p>
        </div>
      </main>
    </div>
  );
}
