import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoTokenizer, MarianMTModel

MODEL_ID = "ngocdang83/HachimiMT-60-QT"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"Loading {MODEL_ID} ...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = MarianMTModel.from_pretrained(MODEL_ID)
model.eval()
print("Model ready.")

MAX_CHARS_PER_CHUNK = 400


class TranslateRequest(BaseModel):
    text: str


def split_paragraphs(text: str) -> list[str]:
    return [line for line in text.split("\n")]


def chunk_line(line: str) -> list[str]:
    if len(line) <= MAX_CHARS_PER_CHUNK:
        return [line]
    # split on Chinese sentence-ending punctuation, keeping the delimiter
    parts = []
    buf = ""
    for ch in line:
        buf += ch
        if ch in "。！？" and len(buf) > 0:
            parts.append(buf)
            buf = ""
    if buf:
        parts.append(buf)
    chunks = []
    cur = ""
    for p in parts:
        if len(cur) + len(p) > MAX_CHARS_PER_CHUNK and cur:
            chunks.append(cur)
            cur = ""
        cur += p
    if cur:
        chunks.append(cur)
    return chunks or [line]


def translate_line(line: str) -> str:
    if not line.strip():
        return line
    outputs = []
    for chunk in chunk_line(line):
        inputs = tokenizer(chunk, return_tensors="pt", truncation=True, max_length=512)
        out = model.generate(**inputs, max_length=512, num_beams=1)
        outputs.append(tokenizer.decode(out[0], skip_special_tokens=True))
    return "".join(outputs)


@app.post("/translate")
def translate(req: TranslateRequest):
    t0 = time.time()
    lines = split_paragraphs(req.text)
    translated = [translate_line(line) for line in lines]
    return {
        "text": "\n".join(translated),
        "ms": round((time.time() - t0) * 1000),
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}
