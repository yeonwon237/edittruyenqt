import time
from transformers import AutoTokenizer, MarianMTModel

MODEL_ID = "ngocdang83/HachimiMT-60-QT"

print(f"Loading {MODEL_ID} ...")
t0 = time.time()
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = MarianMTModel.from_pretrained(MODEL_ID)
print(f"Loaded in {time.time() - t0:.1f}s")

samples = [
    "她把书递给我。",
    "他将那皱起的书页翻过去。",
    "温锦没点评她的狂妄发言。",
    "他慢慢地走了过去。",
    "他看书, 却不知道。",
    "万里长城是末法时代最伟大的建筑之一，被世人誉为世界第八大奇迹。",
    "陆令没想到自己竟然被人下了药，也没想到给自己下药的人，居然是他最信任的助理。",
]

for src in samples:
    inputs = tokenizer(src, return_tensors="pt")
    t0 = time.time()
    out = model.generate(**inputs, max_length=256, num_beams=1)
    dt = time.time() - t0
    text = tokenizer.decode(out[0], skip_special_tokens=True)
    print(f"\nSRC: {src}\nOUT: {text}\n({dt*1000:.0f}ms)")
