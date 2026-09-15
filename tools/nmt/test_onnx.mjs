import { pipeline } from "@huggingface/transformers";

const MODELS = [
  "DanVP/MoxhiMT-30-onnx",
  "DanVP/HachimiMT-30-zh-vi-onnx",
];

const samples = [
  "她把书递给我。",
  "他将那皱起的书页翻过去。",
  "温锦没点评她的狂妄发言。",
  "他慢慢地走了过去。",
  "他看书, 却不知道。",
  "万里长城是末法时代最伟大的建筑之一，被世人誉为世界第八大奇迹。",
  "陆令没想到自己竟然被人下了药，也没想到给自己下药的人，居然是他最信任的助理。",
  // name+verb boundary stress test (the "Kỷ Khê" bug class from last night)
  "他让祁溪流血，也要加倍讨回来。",
];

for (const modelId of MODELS) {
  console.log(`\n########## ${modelId} ##########`);
  const t0 = Date.now();
  const translator = await pipeline("translation", modelId, { dtype: "q8" });
  console.log(`loaded in ${Date.now() - t0}ms`);
  for (const src of samples) {
    const t1 = Date.now();
    const out = await translator(src, { max_new_tokens: 128 });
    const text = Array.isArray(out) ? out[0].translation_text : out.translation_text;
    console.log(`[${Date.now() - t1}ms] ${src}\n  -> ${text}`);
  }
}
