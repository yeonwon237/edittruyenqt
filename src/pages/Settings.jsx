import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Save,
  Trash2,
  ExternalLink,
  Loader2,
  Sparkles,
  LogOut,
  Check,
} from "lucide-react";
import {
  getProvider,
  saveProvider,
  getApiKey,
  saveApiKey,
  clearApiKey,
  testLLMKey,
} from "@/lib/llm";
import { isDraftMode, setDraftMode } from "@/lib/draftMode";
import { Switch } from "@/components/ui/switch";

const PROVIDERS_INFO = {
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    emoji: "✨",
    desc: "Nhanh, nhiều quota miễn phí — Gemini 3.6 Flash",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpStep1: "Truy cập Google AI Studio → chọn \"Get API Key\"",
    accentText: "text-blue-600",
    accentBorder: "border-blue-300",
    accentBg: "bg-blue-50",
    gradFrom: "from-blue-500",
    gradTo: "to-cyan-500",
  },
  openai: {
    label: "OpenAI GPT",
    shortLabel: "GPT",
    emoji: "🤖",
    desc: "GPT-4o-mini — chất lượng tốt, trả phí",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpStep1: "Truy cập OpenAI Platform → API Keys → Create new secret key",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-300",
    accentBg: "bg-emerald-50",
    gradFrom: "from-emerald-500",
    gradTo: "to-teal-500",
  },
  claude: {
    label: "Anthropic Claude",
    shortLabel: "Claude",
    emoji: "🧠",
    desc: "Claude Sonnet 4.6 — giỏi biên tập văn học",
    placeholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpStep1: "Truy cập Anthropic Console → API Keys → Create Key",
    accentText: "text-amber-600",
    accentBorder: "border-amber-300",
    accentBg: "bg-amber-50",
    gradFrom: "from-amber-500",
    gradTo: "to-orange-500",
  },
};

export default function Settings() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [draftMode, setDraftModeState] = useState(isDraftMode());
  const [provider, setProvider] = useState(getProvider());
  const [keyInputs, setKeyInputs] = useState({
    gemini: getApiKey("gemini"),
    openai: getApiKey("openai"),
    claude: getApiKey("claude"),
  });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleSelectProvider = (p) => {
    saveProvider(p);
    setProvider(p);
    toast({ title: `Đã chọn ${PROVIDERS_INFO[p].label} làm AI mặc định` });
  };

  const handleSaveKey = (p) => {
    saveApiKey(p, keyInputs[p].trim());
    toast({ title: `Đã lưu API Key (${PROVIDERS_INFO[p].shortLabel}) 🔑` });
  };

  const handleClearKey = (p) => {
    clearApiKey(p);
    setKeyInputs((prev) => ({ ...prev, [p]: "" }));
    toast({ title: `Đã xóa API Key (${PROVIDERS_INFO[p].shortLabel})` });
  };

  const handleTest = async (p) => {
    setTesting(true);
    try {
      saveApiKey(p, keyInputs[p].trim());
      await testLLMKey(p, keyInputs[p].trim());
      toast({ title: `✅ Kết nối ${PROVIDERS_INFO[p].shortLabel} thành công!` });
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

  const info = PROVIDERS_INFO[provider];

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
              {user.full_name && (
                <span className="font-medium">{user.full_name} · </span>
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

        {/* AI Provider selection */}
        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-6">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              🤖 Nhà cung cấp AI
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Chọn nhà cung cấp sẽ dùng khi bấm nút AI Edit trong Workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {Object.entries(PROVIDERS_INFO).map(([key, p]) => {
              const active = provider === key;
              const hasKey = !!keyInputs[key].trim();
              return (
                <button
                  key={key}
                  onClick={() => handleSelectProvider(key)}
                  className={`relative text-left p-4 rounded-xl border transition-all ${
                    active
                      ? `${p.accentBorder} ${p.accentBg} ring-2 ring-violet-200`
                      : "border-violet-100 hover:border-violet-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{p.emoji}</span>
                    {hasKey ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-medium">
                        ✓ có key
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        chưa key
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-semibold mt-2 ${active ? p.accentText : "text-slate-800"}`}>
                    {p.shortLabel}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {p.desc}
                  </p>
                  {active && (
                    <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${p.accentText}`}>
                      <Check className="w-3 h-3" /> Đang dùng
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active provider key form */}
          <div className={`rounded-xl ${info.accentBg} border ${info.accentBorder} p-4`}>
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="text-lg">{info.emoji}</span> API Key — {info.label}
            </p>
            <input
              type="password"
              value={keyInputs[provider]}
              onChange={(e) =>
                setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))
              }
              placeholder={info.placeholder}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-violet-100 bg-white focus:outline-none focus:border-violet-400 transition-colors mb-3"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleSaveKey(provider)}
                className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
              >
                <Save className="w-4 h-4 mr-1.5" /> Lưu Key
              </Button>
              <Button
                onClick={() => handleTest(provider)}
                disabled={testing || !keyInputs[provider].trim()}
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
              {keyInputs[provider] && (
                <Button
                  onClick={() => handleClearKey(provider)}
                  variant="ghost"
                  className="text-red-500 hover:bg-red-50 rounded-xl"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Xóa
                </Button>
              )}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-white/60 border border-violet-100 text-xs text-slate-500 space-y-1.5">
              <p className="font-medium text-slate-700">💡 Hướng dẫn</p>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                <li>
                  {info.helpStep1}
                </li>
                <li>
                  Truy cập{" "}
                  <a
                    href={info.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-0.5 ${info.accentText} hover:underline`}
                  >
                    {info.helpUrl.replace("https://", "")} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>Sao chép key và dán vào ô trên.</li>
                <li>Bấm "Lưu Key" rồi "Test kết nối".</li>
              </ol>
              <p className="text-slate-400 pt-1 border-t border-violet-100 mt-2">
                Key lưu riêng trên trình duyệt (localStorage), không chia sẻ. Bạn có
                thể nhập key cho cả 3 nhà cung cấp và chuyển đổi tuỳ ý.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}