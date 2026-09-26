import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save, Trash2, ExternalLink, Loader2, Sparkles, Check, RotateCcw, Bot, Plus, Zap } from "lucide-react";
import {
  getProvider,
  saveProvider,
  getApiKeys,
  saveApiKeys,
  getKeyCursor,
  testLLMKey,
  getModel,
  saveModel,
  resetModel,
  getDefaultModel,
  getEndpoint,
} from "@/lib/llm";
import { useToast } from "@/components/ui/use-toast";
import { GEMINI_MODELS } from "@/lib/geminiModels";
import { getGeminiUsageToday } from "@/lib/geminiUsage";
import {
  ORCAROUTER_BASE_URL,
  ORCAROUTER_FREE_MODELS,
  ORCAROUTER_MODELS_URL,
} from "@/lib/orcarouterModels";

const PROVIDERS_INFO = {
  gemini: {
    label: "Google Gemini",
    shortLabel: "Gemini",
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
    desc: "GPT-4o-mini — chất lượng tốt, trả phí",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpStep1: "Truy cập OpenAI Platform → API Keys → Create new secret key",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-300",
    accentBg: "bg-emerald-50",
  },
  orcarouter: {
    label: "OrcaRouter",
    shortLabel: "OrcaRouter",
    desc: "Nhiều model miễn phí qua một API tương thích OpenAI",
    placeholder: "sk-...",
    helpUrl: "https://www.orcarouter.ai/",
    helpStep1: "Mở OrcaRouter → đăng nhập và tạo API Key",
    accentText: "text-sky-600",
    accentBorder: "border-sky-300",
    accentBg: "bg-sky-50",
  },
};

// AI provider/key/model management for Auto Edit — lives inside the
// Workspace (not the general Settings page) since it's specific to
// editing a story, not app-wide appearance/behavior. Moved out of
// Settings.jsx so that page can stay scoped to interface-only settings.
const maskKey = (key) => (key.length <= 10 ? key : `${key.slice(0, 6)}…${key.slice(-4)}`);

export default function AISettingsDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState(getProvider());
  const [keyLists, setKeyLists] = useState({
    gemini: getApiKeys("gemini"),
    openai: getApiKeys("openai"),
    orcarouter: getApiKeys("orcarouter"),
  });
  const [newKeyInputs, setNewKeyInputs] = useState({ gemini: "", openai: "", orcarouter: "" });
  const [testingKeyIdx, setTestingKeyIdx] = useState(null);
  const [modelInputs, setModelInputs] = useState({
    gemini: getModel("gemini"),
    openai: getModel("openai"),
    orcarouter: getModel("orcarouter"),
  });

  const handleSelectProvider = (p) => {
    saveProvider(p);
    setProvider(p);
    toast({ title: `Đã chọn ${PROVIDERS_INFO[p].label} làm AI mặc định` });
  };

  const handleAddKey = (p) => {
    const value = newKeyInputs[p].trim();
    if (!value) return;
    if (keyLists[p].includes(value)) {
      toast({ title: "Key này đã có trong danh sách rồi", variant: "destructive" });
      return;
    }
    const next = [...keyLists[p], value];
    saveApiKeys(p, next);
    setKeyLists((prev) => ({ ...prev, [p]: next }));
    setNewKeyInputs((prev) => ({ ...prev, [p]: "" }));
    toast({ title: `Đã thêm key (${PROVIDERS_INFO[p].shortLabel}) 🔑 — ${next.length} key cho nhà cung cấp này` });
  };

  const handleRemoveKey = (p, idx) => {
    const next = keyLists[p].filter((_, i) => i !== idx);
    saveApiKeys(p, next);
    setKeyLists((prev) => ({ ...prev, [p]: next }));
    toast({ title: `Đã xóa key (${PROVIDERS_INFO[p].shortLabel})` });
  };

  const handleTestKey = async (p, idx) => {
    setTestingKeyIdx(idx);
    try {
      await testLLMKey(p, keyLists[p][idx], modelInputs[p].trim() || getDefaultModel(p));
      toast({ title: `✅ Key #${idx + 1} (${PROVIDERS_INFO[p].shortLabel}) kết nối thành công!` });
    } catch (e) {
      toast({ title: `❌ Key #${idx + 1} lỗi`, description: e.message, variant: "destructive" });
    }
    setTestingKeyIdx(null);
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
            <Bot className="h-5 w-5" /> Nhà cung cấp AI
          </DialogTitle>
          <DialogDescription>
            Chọn nhà cung cấp và API Key sẽ dùng khi bấm nút AI Edit trong Workspace này.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
          {Object.entries(PROVIDERS_INFO).map(([key, p]) => {
            const active = provider === key;
            const hasKey = keyLists[key].length > 0;
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
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${p.accentBg} ${p.accentText}`}><Bot className="h-4 w-4" /></span>
                  {hasKey ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-medium">
                      ✓ {keyLists[key].length} key
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
          <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
            <Bot className="h-4 w-4" /> API Key — {info.label}
          </p>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Nhập được nhiều key cùng lúc (ví dụ nhiều tài khoản {info.shortLabel} miễn phí). Hết
            hạn mức hoặc lỗi ở key đang dùng, lần gọi AI kế tiếp tự chuyển sang key kế tiếp trong
            danh sách — không phải dừng lại đổi key thủ công giữa chừng.
          </p>

          {keyLists[provider].length > 0 && (
            <div className="mb-3 space-y-1.5">
              {keyLists[provider].map((k, idx) => {
                const isActive = idx === Math.min(getKeyCursor(provider), keyLists[provider].length - 1);
                return (
                  <div
                    key={`${provider}-${idx}-${k.slice(-6)}`}
                    className="flex items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
                      {maskKey(k)}
                    </span>
                    {isActive && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-medium">
                        <Zap className="w-2.5 h-2.5" /> đang dùng
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleTestKey(provider, idx)}
                      disabled={testingKeyIdx === idx}
                      className="shrink-0 p-1.5 rounded-lg text-violet-500 hover:bg-violet-50"
                      title="Test key này"
                    >
                      {testingKeyIdx === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveKey(provider, idx)}
                      className="shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50"
                      title="Xóa key này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={newKeyInputs[provider]}
              onChange={(e) => setNewKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddKey(provider); }}
              placeholder={info.placeholder}
              className="flex-1 min-w-[180px] px-3.5 py-2.5 text-sm rounded-xl border border-violet-100 bg-white focus:outline-none focus:border-violet-400 transition-colors"
              spellCheck={false}
            />
            <Button
              onClick={() => handleAddKey(provider)}
              disabled={!newKeyInputs[provider].trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Thêm key
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-violet-100">
            {provider === "orcarouter" && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700">Kết nối OrcaRouter</p>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Đúng chuẩn OpenAI</span>
                </div>
                <div className="mt-2 space-y-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px]">
                  <div><span className="text-slate-400">Base URL: </span><code className="text-emerald-300">{ORCAROUTER_BASE_URL}</code></div>
                  <div><span className="text-slate-400">Gửi chat: </span><code className="text-emerald-300">{getEndpoint("orcarouter")}</code></div>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Extension tự nối <code>/chat/completions</code> vào Base URL theo chuẩn OpenAI. Địa chỉ được khóa để tránh nhập thiếu hoặc lặp <code>/v1</code>.</p>
              </div>
            )}
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

            {provider === "orcarouter" && (
              <div className="mb-3 rounded-xl border border-sky-100 bg-white/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Model miễn phí OrcaRouter</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Có thể chọn nhanh hoặc nhập bất kỳ model ID nào ở ô bên dưới.</p>
                  </div>
                  <a href={ORCAROUTER_MODELS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 hover:underline">Xem toàn bộ model <ExternalLink className="h-3 w-3" /></a>
                </div>
                <div className="mt-2 space-y-1.5">
                  {ORCAROUTER_FREE_MODELS.map((model) => {
                    const active = modelInputs.orcarouter === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setModelInputs((prev) => ({ ...prev, orcarouter: model.id }))}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-sky-400 bg-sky-50" : "border-slate-100 bg-white hover:border-sky-200 hover:bg-sky-50/40"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-slate-700">{model.label}</span>
                          <code className="block truncate text-[10px] text-slate-400">{model.id}</code>
                          <span className="block text-[10px] text-slate-400">{model.note}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">FREE</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">Bấm model để điền, sau đó bấm “Lưu model”. Model miễn phí có thể bị giới hạn tốc độ hoặc thay đổi theo OrcaRouter.</p>
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
              <li>Sao chép key và dán vào ô, bấm "Thêm key".</li>
              <li>Lặp lại để thêm nhiều key — hết hạn mức key này, key kế tiếp tự được dùng.</li>
            </ol>
            <p className="text-slate-400 pt-1 border-t border-violet-100 mt-2">
              Key lưu riêng trên trình duyệt (localStorage), không chia sẻ. Bạn có thể nhập nhiều
              key cho mỗi nhà cung cấp, và nhập key cho cả 4 nhà cung cấp rồi chuyển đổi tuỳ ý.
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
