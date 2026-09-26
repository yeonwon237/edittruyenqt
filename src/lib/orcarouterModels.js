export const ORCAROUTER_BASE_URL = "https://api.orcarouter.ai/v1";
export const ORCAROUTER_CHAT_ENDPOINT = `${ORCAROUTER_BASE_URL}/chat/completions`;
export const ORCAROUTER_MODELS_URL = "https://www.orcarouter.ai/models";

export const ORCAROUTER_FREE_MODELS = [
  {
    id: "orcarouter/free",
    label: "OrcaRouter Free",
    note: "Tự chọn một model miễn phí đang khả dụng",
  },
  {
    id: "deepseek/deepseek-v4-flash-free",
    label: "DeepSeek V4 Flash (Free)",
    note: "Model miễn phí trong ảnh bạn gửi",
  },
];
