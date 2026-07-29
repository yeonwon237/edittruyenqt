import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save, Trash2, ExternalLink, Loader2, Sparkles, Check, RotateCcw } from "lucide-react";
import {
  getProvider,
  saveProvider,
  getApiKey,
  saveApiKey,
  clearApiKey,
  testLLMKey,
  getModel,
  saveModel,
  resetModel,
  getDefaultModel,
} from "@/lib/llm";
import { useToast } from "@/components/ui/use-toast";
import { GEMINI_MODELS } from "@/lib/geminiModels";
import { getGeminiUsageToday } from "@/lib/geminiUsage";

const PROVIDERS_INFO = {
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
    emoji: "✨",
    desc: "Miễn phí, ~500 lượt/ngày — Gemini 3.5 Flash Lite",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpStep1: "Truy cập Google AI Studio → chọn \"Get API Key\"",
    accentText: "text-blue-600",
    accentBorder: "border-blue-300",
    accentBg: "bg-blue-50",
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
  },
};

// AI provider/key/model management for Auto Edit — lives inside the
// Workspace (not the general Settings page) since it's specific to
// editing a story, not app-wide appearance/behavior. Moved out of
// Settings.jsx so that page can stay scoped to interface-only settings.
export default function AISettingsDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState(getProvider());
  const [keyInputs, setKeyInputs] = useState({
    gemini: getApiKey("gemini"),
    openai: getApiKey("openai"),
    claude: getApiKey("claude"),
  });
  const [modelInputs, setModelInputs] = useState({
    gemini: getModel("gemini"),
    openai: getModel("openai"),
    claude: getModel("claude"),
  });
  const [testing, setTesting] = useState(false);

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
      saveModel(p, modelInputs[p]);
      await testLLMKey(p, keyInputs[p].trim(), modelInputs[p].trim() || getDefaultModel(p));
      toast({ title: `✅ Kết nối ${PROVIDERS_INFO[p].shortLabel} thành công!` });
    } catch (e) {
      toast({ title: "❌ Lỗi kết nối", description: e.message, variant: "destructive" });
    }
    setTesting(false);
  };

  const handleSaveModel = (p) => {
    saveModel(p, modelInputs[p]);
    setModelInputs((prev) => ({ ...prev, [p]: getModel(p) }));
    toast({ title: `Đã lưu model (${PROVIDERS_INFO[p].shortLabel}) 🎯` });
  };

  const handleResetModel = (p) => {
    resetModel(p);
    setModelInputs((prev) => ({ ...prev, [p]: getDefaultModel(p) }));
    toast({ title: `Đã đặt lại model mặc định (${PROVIDERS_INFO[p].shortLabel})` });
  };

  const info = PROVIDERS_INFO[provider];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto cute-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-violet-700 flex items-center gap-2">
            🤖 Nhà cung cấp AI
          </DialogTitle>
          <DialogDescription>
            Chọn nhà cung cấp và API Key sẽ dùng khi bấm nút AI Edit trong Workspace này.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
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
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.desc}</p>
                {active && (
                  <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${p.accentText}`}>
                    <Check className="w-3 h-3" /> Đang dùng
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className={`rounded-xl ${info.accentBg} border ${info.accentBorder} p-4`}>
          <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="text-lg">{info.emoji}</span> API Key — {info.label}
          </p>
          <input
            type="password"
            value={keyInputs[provider]}
            onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
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
              {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
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

          <div className="mt-4 pt-4 border-t border-violet-100">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Model ({info.shortLabel})</p>
            <p className="text-xs text-slate-400 mb-2">
              Nhà cung cấp hay đổi/khai tử model — nếu báo lỗi kết nối hoặc hết hạn mức, đổi model
              khác ở đây mà không cần chờ sửa code. Mặc định:{" "}
              <code className="bg-white/70 px-1 rounded">{getDefaultModel(provider)}</code>
            </p>

            {provider === "gemini" && (
              <div className="mb-2.5">
                <p className="text-[11px] text-slate-400 mb-1">
                  Chọn nhanh (theo hạn mức trang aistudio.google.com/rate-limit của bạn, chép
                  2026-07-28 — hạn mức thật đổi theo thời gian, kiểm tra lại trang đó nếu nghi
                  ngờ). Bấm để điền vào ô Model bên dưới, vẫn cần bấm "Lưu model".
                </p>
                <div className="flex gap-1.5 overflow-x-auto cute-scrollbar pb-1">
                  {GEMINI_MODELS.map((m) => {
                    const used = getGeminiUsageToday(m.id);
                    const active = modelInputs.gemini === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setModelInputs((prev) => ({ ...prev, gemini: m.id }))}
                        className={`shrink-0 text-left px-2.5 py-1.5 rounded-xl border text-[11px] transition-colors ${
                          active
                            ? "border-violet-400 bg-violet-50 text-violet-700"
                            : "border-violet-100 bg-white text-slate-600 hover:bg-violet-50/60"
                        }`}
                      >
                        <div className="font-medium">{m.label}</div>
                        <div className="text-slate-400">
                          {m.perMinute}/phút · {m.perDay}/ngày
                        </div>
                        <div className={used > 0 ? "text-amber-600" : "text-slate-300"}>
                          Hôm nay: {used}/{m.perDay}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <input
                value={modelInputs[provider]}
                onChange={(e) => setModelInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                placeholder={getDefaultModel(provider)}
                className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-xl border border-violet-100 bg-white focus:outline-none focus:border-violet-400 transition-colors font-mono"
                spellCheck={false}
              />
              <Button
                onClick={() => handleSaveModel(provider)}
                variant="outline"
                className="border-violet-200 text-violet-600 rounded-xl"
              >
                <Save className="w-4 h-4 mr-1.5" /> Lưu model
              </Button>
              <Button
                onClick={() => handleResetModel(provider)}
                variant="ghost"
                className="text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" /> Mặc định
              </Button>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-white/60 border border-violet-100 text-xs text-slate-500 space-y-1.5">
            <p className="font-medium text-slate-700">💡 Hướng dẫn</p>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              <li>{info.helpStep1}</li>
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
              Key lưu riêng trên trình duyệt (localStorage), không chia sẻ. Bạn có thể nhập key
              cho cả 3 nhà cung cấp và chuyển đổi tuỳ ý.
            </p>
            {provider === "gemini" && (
              <p className="text-slate-400">
                Hết hạn mức hoặc lỗi model?{" "}
                <a
                  href="https://aistudio.google.com/rate-limit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-0.5 ${info.accentText} hover:underline`}
                >
                  Xem hạn mức thật theo tài khoản <ExternalLink className="w-3 h-3" />
                </a>{" "}
                — chọn model nào còn hạn mức rồi dán ID (cột "Modèle") vào ô Model ở trên.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
