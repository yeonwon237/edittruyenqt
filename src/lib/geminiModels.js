// Curated from the user's own aistudio.google.com/rate-limit page
// (2026-07-28) — per established practice in this project, model IDs and
// quotas are NOT trustworthy from web search/training data, only from the
// user's actual account page. Re-paste an updated table here if Google
// changes limits again.
//
// `id` follows the "gemini-{version}-flash[-lite]" pattern confirmed
// working for the current default (gemini-3.5-flash-lite) — the newer
// versions (3, 3.1, 3.6) are inferred from that same pattern and NOT
// independently confirmed; if picking one throws a connection error on
// Test kết nối, that's why — fall back to typing the exact ID Google's
// own docs/console show for it.
//
// TTS ("text-to-speech") variants are deliberately excluded — this app
// only ever calls Gemini for text generation, never audio, so a TTS model
// would just fail here even though it's a valid model on the account.
export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", perMinute: 5, perDay: 20 },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", perMinute: 10, perDay: 20 },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", perMinute: 5, perDay: 20 },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", perMinute: 15, perDay: 500 },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", perMinute: 5, perDay: 20 },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", perMinute: 15, perDay: 500 },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", perMinute: 5, perDay: 20 },
];
