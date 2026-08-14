// Snapshot of the public STALI pricing page, verified 2026-08-14.
// `price` is VND per 1M tokens or per request, depending on `priceKind`.
const token = (id, name, price, tier = "Tiêu chuẩn") => ({ id, name, price, priceKind: "token", tier });
const request = (id, name, price, compatible = true) => ({ id, name, price, priceKind: "request", tier: "Theo lượt", compatible });

export const STALI_BASE_URL = "https://api.stali.vn/v1";
export const STALI_CHAT_ENDPOINT = `${STALI_BASE_URL}/chat/completions`;
export const STALI_PRICING_URL = "https://api.stali.vn/pricing";
export const STALI_PRICE_VERIFIED_AT = "14/08/2026";

export const STALI_MODELS = [
  token("stali/qwen3-codex", "Qwen3 Codex", 1000, "AWS Premium"),
  token("stali/minimax-m2.1", "MiniMax M2.1", 2700, "AWS Premium"),
  token("stali/minimax-m2.5", "MiniMax M2.5", 4300, "AWS Premium"),
  token("stali/claude-haiku-4-5", "Claude Haiku 4.5", 8100, "AWS Premium"),
  token("stali/glm-5", "GLM 5", 8100, "AWS Premium"),
  token("stali/gpt-5.6-luna", "GPT 5.6 Luna", 8200, "AWS Premium"),
  token("stali/claude-sonnet-5-medium", "Claude Sonnet 5 Medium", 14200, "AWS Premium"),
  token("stali/gpt-5.6-terra", "GPT 5.6 Terra", 17500, "AWS Premium"),
  token("stali/claude-sonnet-4-6-medium", "Claude Sonnet 4.6 Medium", 18200, "AWS Premium"),
  token("stali/claude-sonnet-5-max-thinking", "Claude Sonnet 5 Max Thinking", 22300, "AWS Premium"),
  token("stali/claude-opus-5-medium", "Claude Opus 5 Medium", 24000, "AWS Premium"),
  token("stali/gpt-5.6-sol", "GPT 5.6 Sol", 24200, "AWS Premium"),
  token("stali/claude-opus-4-6-medium", "Claude Opus 4.6 Medium", 24300, "AWS Premium"),
  token("stali/claude-sonnet-4-6-max-thinking", "Claude Sonnet 4.6 Max Thinking", 24300, "AWS Premium"),
  token("stali/claude-opus-4-7-medium", "Claude Opus 4.7 Medium", 25500, "AWS Premium"),
  token("stali/claude-opus-4-8-medium", "Claude Opus 4.8 Medium", 25500, "AWS Premium"),
  token("stali/claude-opus-5-max-thinking", "Claude Opus 5 Max Thinking", 27400, "AWS Premium"),
  token("stali/claude-opus-4-6-max-thinking", "Claude Opus 4.6 Max Thinking", 27500, "AWS Premium"),
  token("stali/claude-opus-4-7-max-thinking", "Claude Opus 4.7 Max Thinking", 27600, "AWS Premium"),
  token("stali/claude-opus-4-8-max-thinking", "Claude Opus 4.8 Max Thinking", 27600, "AWS Premium"),
  token("claude-fable-5", "Claude Fable 5", 5800),
  request("req/claude-fable-5", "Claude Fable 5", 200),
  token("claude-opus-4-6", "Claude Opus 4.6", 4400),
  token("claude-opus-4-7", "Claude Opus 4.7", 4400),
  token("claude-opus-4-8", "Claude Opus 4.8", 4400),
  token("claude-opus-5", "Claude Opus 5", 4400),
  request("req/claude-opus-5", "Claude Opus 5", 150),
  token("claude-sonnet-4-6", "Claude Sonnet 4.6", 4400),
  token("claude-sonnet-5", "Claude Sonnet 5", 4400),
  token("claude-haiku-4-5", "Claude Haiku 4.5", 4000),
  request("req/claude-sonnet-5", "Claude Sonnet 5", 130),
  request("req/claude-haiku-4-5", "Claude Haiku 4.5", 100),
  token("gpt-5.5", "GPT 5.5", 1800),
  token("gpt-5.6-luna", "GPT 5.6 Luna", 1800),
  request("req/gpt-5.6-luna", "GPT 5.6 Luna", 150),
  token("gpt-5.6-sol", "GPT 5.6 Sol", 2200),
  request("req/gpt-5.6-sol", "GPT 5.6 Sol", 200),
  token("gpt-5.6-terra", "GPT 5.6 Terra", 2000),
  request("req/gpt-5.6-terra", "GPT 5.6 Terra", 120),
  request("req/gpt-image-2", "GPT Image 2", 500, false),
  request("req/gpt-4o-mini-tts", "GPT-4o Mini TTS", 1200, false),
  request("req/wan-2.7", "Wan 2.7", 2500, false),
  request("req/deepseek-v4-pro", "DeepSeek V4 Pro", 110),
  request("req/deepseek-v4-flash", "DeepSeek V4 Flash", 80),
  token("deepseek-v4-flash", "DeepSeek V4 Flash", 1500),
  request("req/minimax-m3", "Minimax M3", 100),
  request("req/gemini-3.5-flash", "Gemini 3.5 Flash", 200),
  token("gemini-3.5-flash", "Gemini 3.5 Flash", 3600),
  token("gemini-3.6-flash", "Gemini 3.6 Flash", 3900),
  token("gemini-3.1-pro", "Gemini 3.1 Pro", 3500),
  token("kimi-k3", "Kimi K3", 3800),
  token("qwen3.8-max", "Qwen 3.8 Max", 4000),
  token("glm-5.2", "GLM 5.2", 1800),
  token("grok-4.5", "Grok 4.5", 1500),
  request("req/grok-4.6", "Grok 4.6", 100),
];

export function formatStaliPrice(model) {
  const amount = new Intl.NumberFormat("vi-VN").format(model.price);
  return model.priceKind === "request" ? `${amount}đ/lượt` : `${amount}đ/1M token`;
}
