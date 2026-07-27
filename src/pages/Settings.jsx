import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Key,
  Save,
  Trash2,
  ExternalLink,
  Loader2,
  Sparkles,
  LogOut,
} from "lucide-react";
import {
  getGeminiKey,
  saveGeminiKey,
  clearGeminiKey,
  testGeminiKey,
} from "@/lib/gemini";

export default function Settings() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(getGeminiKey());
  const [user, setUser] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    base44.auth
      .me()
      .then(setUser)
      .catch(() => {});
  }, []);

  const handleSave = () => {
    saveGeminiKey(apiKey.trim());
    toast({ title: "Đã lưu Gemini API Key 🔑" });
  };

  const handleClear = () => {
    clearGeminiKey();
    setApiKey("");
    toast({ title: "Đã xóa API Key" });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      saveGeminiKey(apiKey.trim());
      await testGeminiKey(apiKey.trim());
      toast({ title: "✅ Kết nối Gemini thành công!" });
    } catch (e) {
      toast({
        title: "❌ Lỗi kết nối",
        description: e.message,
        variant: "destructive",
      });
    }
    setTesting(false);
  };

  const handleLogout = async () => {
    await base44.auth.logout("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
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
        {/* Account info */}
        {user && (
          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              Tài khoản
            </h2>
            <p className="text-sm text-slate-500">
              {user.full_name && <span className="font-medium">{user.full_name} · </span>}
              {user.email}
            </p>
          </div>
        )}

        {/* Gemini API Key */}
        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                Google Gemini API Key
              </h2>
              <p className="text-sm text-slate-400">
                Dùng AI tự động edit chương bằng Gemini cá nhân (miễn phí)
              </p>
            </div>
          </div>

          <label className="text-xs font-medium text-slate-500 mb-1.5 block">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-violet-100 bg-slate-50/50 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors mb-4"
            spellCheck={false}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSave}
              className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
            >
              <Save className="w-4 h-4 mr-1.5" /> Lưu Key
            </Button>
            <Button
              onClick={handleTest}
              disabled={testing || !apiKey.trim()}
              variant="outline"
              className="border-violet-200 text-violet-600 rounded-xl"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              Test kết nối
            </Button>
            {apiKey && (
              <Button
                onClick={handleClear}
                variant="ghost"
                className="text-red-500 hover:bg-red-50 rounded-xl"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Xóa Key
              </Button>
            )}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-violet-50/70 border border-violet-100 text-sm space-y-2">
            <p className="font-medium text-slate-700">💡 Hướng dẫn lấy API Key</p>
            <ol className="list-decimal list-inside text-slate-500 space-y-1 text-xs leading-relaxed">
              <li>
                Truy cập{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Google AI Studio <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Đăng nhập tài khoản Google và chọn "Get API Key"</li>
              <li>Sao chép key (bắt đầu bằng "AIza...") và dán vào ô trên</li>
              <li>Bấm "Lưu Key" rồi "Test kết nối" để kiểm tra</li>
            </ol>
            <p className="text-xs text-slate-400 pt-1 border-t border-violet-100 mt-2">
              Key được lưu riêng trên trình duyệt của bạn (localStorage), an toàn
              và không chia sẻ với ai khác.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}