import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import ctranslate2
import sentencepiece as spm
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pronoun_clf_np import PronounSpeakerClassifier

# Desktop app's native translation backend — runs CTranslate2 int8 builds of
# the original checkpoints (see convert_ct2.py + ct2_models/README.md for how
# these were produced/fetched: 3 of the 8 zh-vi models + vp2vi were converted
# here from source, matching the model authors' own official ct2-int8 builds
# byte-for-byte; the other 5 zh-vi models were downloaded pre-built straight
# from the authors' own HF repos). No torch/transformers needed at runtime —
# started as a Tauri sidecar process, models loaded lazily per model key on
# first request and kept warm in MODELS for the rest of the session.
#
# Model directory resolution has 3 cases, checked in order:
#  1. NMT_MODELS_DIR env var — set by src-tauri/src/lib.rs in a packaged
#     build, pointing at the Tauri "resources" copy shipped alongside the
#     app bundle (see tauri.conf.json bundle.resources and build_release.md).
#  2. Next to the frozen executable (PyInstaller onedir build run directly,
#     e.g. for manual testing without going through Tauri at all).
#  3. Dev fallback: next to this very source file (tools/nmt/ck2_models),
#     unchanged from every earlier session — `tauri dev` keeps working
#     exactly as before.
def _default_base_dir() -> Path:
    if os.environ.get("NMT_MODELS_DIR"):
        return Path(os.environ["NMT_MODELS_DIR"]).resolve().parent
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


_BASE_DIR = _default_base_dir()
MODELS_DIR = Path(os.environ["NMT_MODELS_DIR"]) if os.environ.get("NMT_MODELS_DIR") else _BASE_DIR / "ct2_models"

EOS = "</s>"
SPECIAL_TOKENS = {"<s>", "</s>", "<pad>", "<unk>"}


@dataclass(frozen=True)
class ModelConfig:
    label: str
    desc: str
    beam_size: int = 2
    repetition_penalty: float = 1.2
    max_input_tokens: int = 160
    max_decoding_length: int = 300


# Decode params mirror the per-model tuning documented in the reference
# HachimiMT app (beam size / repetition_penalty / input chunk cap chosen per
# model to avoid entity-name drift on long chunks — see their translator.py).
MODEL_CONFIGS: dict[str, ModelConfig] = {
    "HachimiMT-60": ModelConfig("HachimiMT-60", "Webnovel/xianxia, 57M — mặc định", max_decoding_length=300),
    "HachimiMT-60-QT": ModelConfig("HachimiMT-60-QT", "Như HachimiMT-60, văn phong QT (ta/ngươi/hắn/nàng)", max_decoding_length=300),
    "HachimiMT-30": ModelConfig("HachimiMT-30", "37M, nhẹ hơn", beam_size=1, max_decoding_length=512, repetition_penalty=1.0),
    "MoxhiMT-60": ModelConfig("MoxhiMT-60", "Webnovel/xianxia, 57M", max_decoding_length=300),
    "MoxhiMT-30": ModelConfig("MoxhiMT-30", "Truyện hiện đại/cross-domain, 36.5M", max_decoding_length=512),
    "MoxhiMT-30-QT": ModelConfig("MoxhiMT-30-QT", "Như MoxhiMT-30, văn phong QT", beam_size=1, max_decoding_length=512),
    "HirashibaMT-Medium": ModelConfig("HirashibaMT-Medium", "62M", beam_size=4, repetition_penalty=1.0, max_input_tokens=128, max_decoding_length=256),
    "HirashibaMT-Tiny": ModelConfig("HirashibaMT-Tiny", "17M, siêu nhẹ", beam_size=1, repetition_penalty=1.0, max_decoding_length=512),
}
DEFAULT_MODEL_KEY = "HachimiMT-60"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SentencePieceTokenizer:
    def __init__(self, model_dir: Path) -> None:
        self.source_sp = spm.SentencePieceProcessor(model_file=str(model_dir / "source.spm"))
        self.target_sp = spm.SentencePieceProcessor(model_file=str(model_dir / "target.spm"))

    def encode(self, text: str, max_tokens: int) -> list[str]:
        pieces = self.source_sp.encode(text, out_type=str)
        if len(pieces) > max_tokens - 1:
            pieces = pieces[: max_tokens - 1]
        pieces.append(EOS)
        return pieces

    def decode(self, pieces: list[str]) -> str:
        pieces = [p for p in pieces if p not in SPECIAL_TOKENS]
        return self.target_sp.decode(pieces)


class FastTokenizerWrapper:
    def __init__(self, model_dir: Path) -> None:
        from tokenizers import Tokenizer

        self._tok = Tokenizer.from_file(str(model_dir / "tokenizer.json"))

    def encode(self, text: str, max_tokens: int) -> list[str]:
        pieces = self._tok.encode(text).tokens
        if len(pieces) > max_tokens - 1:
            pieces = pieces[: max_tokens - 1]
        pieces.append(EOS)
        return pieces

    def decode(self, pieces: list[str]) -> str:
        pieces = [p for p in pieces if p not in SPECIAL_TOKENS]
        return self._tok.decode_batch([[self._tok.token_to_id(p) for p in pieces if self._tok.token_to_id(p) is not None]])[0]


@dataclass
class LoadedModel:
    translator: "ctranslate2.Translator"
    tokenizer: object
    config: ModelConfig


MODELS: dict[str, LoadedModel] = {}
MAX_CHARS_PER_CHUNK = 400


class TranslateRequest(BaseModel):
    text: str
    model_id: Optional[str] = None


def get_model(model_key: str) -> LoadedModel:
    if model_key not in MODELS:
        model_dir = MODELS_DIR / model_key
        if not model_dir.is_dir():
            raise ValueError(f"Unknown model key: {model_key}")
        print(f"Loading {model_key} ...")
        config = MODEL_CONFIGS.get(model_key, ModelConfig(model_key, ""))
        translator = ctranslate2.Translator(str(model_dir), device="cpu")
        if (model_dir / "source.spm").exists():
            tokenizer = SentencePieceTokenizer(model_dir)
        else:
            tokenizer = FastTokenizerWrapper(model_dir)
        MODELS[model_key] = LoadedModel(translator, tokenizer, config)
        print(f"{model_key} ready.")
    return MODELS[model_key]


def chunk_line(line: str) -> list[str]:
    if len(line) <= MAX_CHARS_PER_CHUNK:
        return [line]
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


@app.post("/translate")
def translate(req: TranslateRequest):
    t0 = time.time()
    model_key = req.model_id or DEFAULT_MODEL_KEY
    loaded = get_model(model_key)
    lines = req.text.split("\n")

    # Flatten every line's chunks into ONE batch instead of calling
    # translate_batch once per line — CTranslate2 parallelizes across a
    # batch (multi-core), so 80 lines as 80 sequential single-item calls was
    # ~5-12s for a chapter-sized text; one batched call brings that well
    # under half, matching the reference app's ~3s claim (measured via
    # tools/nmt's own benchmark — see plan notes).
    chunk_map: list[tuple] = []  # (line_index, pieces) per chunk, in order
    for line_index, line in enumerate(lines):
        if not line.strip():
            continue
        for chunk in chunk_line(line):
            pieces = loaded.tokenizer.encode(chunk, loaded.config.max_input_tokens)
            chunk_map.append((line_index, pieces))

    line_outputs = [""] * len(lines)
    if chunk_map:
        results = loaded.translator.translate_batch(
            [pieces for _, pieces in chunk_map],
            beam_size=loaded.config.beam_size,
            repetition_penalty=loaded.config.repetition_penalty,
            max_decoding_length=loaded.config.max_decoding_length,
            max_batch_size=32,
        )
        for (line_index, _), result in zip(chunk_map, results):
            line_outputs[line_index] += loaded.tokenizer.decode(result.hypotheses[0])
    for i, line in enumerate(lines):
        if not line.strip():
            line_outputs[i] = line

    return {
        "text": "\n".join(line_outputs),
        "ms": round((time.time() - t0) * 1000),
        "model_id": model_key,
    }


@app.get("/health")
def health():
    return {"status": "ok", "loaded_models": list(MODELS.keys()), "default_model": DEFAULT_MODEL_KEY}


@app.get("/models")
def list_models():
    return [
        {"id": key, "label": cfg.label, "desc": cfg.desc}
        for key, cfg in MODEL_CONFIGS.items()
    ]


# Pronoun/speaker QA classifier (DanVP/moxhimt-pronoun-clf, ported to numpy —
# see pronoun_clf_np.py) — a supplementary signal only. The app's own
# qualityCheck.js heuristics stay the source of truth; this just gives an
# extra speaker guess + confidence for the "unknown role" tiebreak case, same
# spirit as the existing qtPronounEvidence.js "supporting evidence" pattern.
PRONOUN_CLF_DIR = Path(os.environ["NMT_PRONOUN_CLF_DIR"]) if os.environ.get("NMT_PRONOUN_CLF_DIR") else _BASE_DIR / "pronoun_clf"
_speaker_clf: Optional[PronounSpeakerClassifier] = None


def get_speaker_clf() -> PronounSpeakerClassifier:
    global _speaker_clf
    if _speaker_clf is None:
        print("Loading pronoun speaker classifier ...")
        _speaker_clf = PronounSpeakerClassifier(PRONOUN_CLF_DIR)
        print("pronoun speaker classifier ready.")
    return _speaker_clf


class SpeakerItem(BaseModel):
    id: str
    ctx: str = ""
    zh: str
    candidates: List[str] = []


class SpeakerBatchRequest(BaseModel):
    items: List[SpeakerItem]


@app.post("/speaker")
def classify_speakers(req: SpeakerBatchRequest):
    clf = get_speaker_clf()
    results = []
    for item in req.items:
        if item.candidates:
            result = clf.score_speakers_with_candidates(item.ctx, item.zh, item.candidates)
        else:
            result = clf.score_speakers(item.ctx, item.zh)
        results.append({"id": item.id, **result})
    return {"results": results}


if __name__ == "__main__":
    # Runs uvicorn programmatically instead of via its own CLI ("uvicorn
    # server:app ...") — PyInstaller freezes this script as a standalone
    # executable, and the CLI's module-string import ("server:app") doesn't
    # resolve inside a frozen build the way it does with a normal Python
    # install. `tauri dev` still calls the CLI directly against the source
    # venv (see src-tauri/src/lib.rs) — this entry point only matters for the
    # packaged sidecar binary, which calls this same file directly.
    import uvicorn

    port = int(os.environ.get("NMT_PORT", "8787"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
