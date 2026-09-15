"""Pure numpy reimplementation of DanVP/moxhimt-pronoun-clf's SpeakerScorer
(see pronoun_clf_ref/pronoun_infer.py for the original torch nn.Module this
mirrors). No torch at runtime — the model is a tiny 2-layer Transformer
encoder (~7.8M params, 31MB) and reimplementing its forward pass in numpy
keeps the sidecar as light as the CT2 translation backend (see server.py).
Weights were exported once via torch (see tools/nmt/README in this dir /
the session that produced pronoun_clf/speaker_clf_weights.npz) — this module
never imports torch.

Verified against the original torch model on random + real inputs: max
abs logit diff ~1e-5 (float32 accumulation order differences only) — see
verify_pronoun_clf.py.

Only implements score_speakers() (candidate ranking) — the supplementary
signal this app actually uses. The original render()'s full pronoun
substitution/abstention logic is NOT reproduced here; this codebase's own
qualityCheck.js already owns pronoun substitution and only wants a speaker
confidence signal to break ties (see src/lib/qtPronounEvidence.js pattern).
"""
import json
import math
from pathlib import Path
from typing import Union

import numpy as np
import sentencepiece as spm

MAXLEN = 192
SEP = 1
NUM_HEADS = 4
HEAD_DIM = 256 // NUM_HEADS
SPECIAL_CANDS = ["旁白", "自语"]


def _erf(x: np.ndarray) -> np.ndarray:
    # Abramowitz & Stegun 7.1.26 rational approximation, max abs error ~1.5e-7
    # — no scipy dependency needed for this one call site (GELU below).
    a1, a2, a3, a4, a5 = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429
    p = 0.3275911
    sign = np.sign(x)
    ax = np.abs(x)
    t = 1.0 / (1.0 + p * ax)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * np.exp(-ax * ax)
    return sign * y


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + _erf(x / math.sqrt(2.0)))


def _layer_norm(x: np.ndarray, weight: np.ndarray, bias: np.ndarray, eps: float = 1e-5) -> np.ndarray:
    mean = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return (x - mean) / np.sqrt(var + eps) * weight + bias


def _softmax(x: np.ndarray, axis: int) -> np.ndarray:
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)


class SpeakerScorerNP:
    def __init__(self, weights: dict):
        self.w = weights
        self.num_layers = 2

    def _self_attention(self, x: np.ndarray, key_padding_mask: np.ndarray, layer: int) -> np.ndarray:
        # x: (B, T, D); key_padding_mask: (B, T) bool, True = PAD (ignore as key)
        w = self.w
        in_w = w[f"enc.layers.{layer}.self_attn.in_proj_weight"]  # (3D, D)
        in_b = w[f"enc.layers.{layer}.self_attn.in_proj_bias"]  # (3D,)
        d = x.shape[-1]
        qkv = x @ in_w.T + in_b  # (B, T, 3D)
        q, k, v = np.split(qkv, 3, axis=-1)
        B, T, _ = x.shape
        q = q.reshape(B, T, NUM_HEADS, HEAD_DIM).transpose(0, 2, 1, 3)  # (B, H, T, hd)
        k = k.reshape(B, T, NUM_HEADS, HEAD_DIM).transpose(0, 2, 1, 3)
        v = v.reshape(B, T, NUM_HEADS, HEAD_DIM).transpose(0, 2, 1, 3)
        scores = q @ k.transpose(0, 1, 3, 2) / math.sqrt(HEAD_DIM)  # (B, H, T, T)
        mask = key_padding_mask[:, None, None, :]  # (B,1,1,T) broadcast over query dim + heads
        scores = np.where(mask, -1e9, scores)
        attn = _softmax(scores, axis=-1)
        out = attn @ v  # (B, H, T, hd)
        out = out.transpose(0, 2, 1, 3).reshape(B, T, d)
        out_w = w[f"enc.layers.{layer}.self_attn.out_proj.weight"]
        out_b = w[f"enc.layers.{layer}.self_attn.out_proj.bias"]
        return out @ out_w.T + out_b

    def forward(self, x_ids: np.ndarray, mask: np.ndarray) -> np.ndarray:
        # x_ids: (B, T) int64 token ids; mask: (B, T) bool, True = valid token
        w = self.w
        B, T = x_ids.shape
        h = w["emb.weight"][x_ids] + w["pos.weight"][:T][None, :, :]
        key_padding_mask = ~mask
        for layer in range(self.num_layers):
            attn_out = self._self_attention(h, key_padding_mask, layer)
            h = _layer_norm(h + attn_out, w[f"enc.layers.{layer}.norm1.weight"], w[f"enc.layers.{layer}.norm1.bias"])
            ff = h @ w[f"enc.layers.{layer}.linear1.weight"].T + w[f"enc.layers.{layer}.linear1.bias"]
            ff = _gelu(ff)
            ff = ff @ w[f"enc.layers.{layer}.linear2.weight"].T + w[f"enc.layers.{layer}.linear2.bias"]
            h = _layer_norm(h + ff, w[f"enc.layers.{layer}.norm2.weight"], w[f"enc.layers.{layer}.norm2.bias"])
        mask_f = mask.astype(h.dtype)[:, :, None]
        pooled = (h * mask_f).sum(axis=1) / np.clip(mask_f.sum(axis=1), 1e-9, None)
        head0 = pooled @ w["head.0.weight"].T + w["head.0.bias"]
        head0 = _gelu(head0)
        out = head0 @ w["head.2.weight"].T + w["head.2.bias"]
        return out.reshape(-1)


class PronounSpeakerClassifier:
    """Candidate-ranking-only port of pronoun_infer.PronounRenderer.score_speakers."""

    def __init__(self, model_dir: Union[Path, str]):
        model_dir = Path(model_dir)
        weights = dict(np.load(model_dir / "speaker_clf_weights.npz"))
        self.model = SpeakerScorerNP(weights)
        self.sp = spm.SentencePieceProcessor(model_file=str(model_dir / "source.spm"))
        self.names = sorted(
            json.loads((model_dir / "known_names.json").read_text(encoding="utf-8")),
            key=len,
            reverse=True,
        )

    def encode(self, ctx: str, zh: str, cand: str) -> list[int]:
        ids = (
            self.sp.encode(ctx[-120:], out_type=int)
            + [SEP]
            + self.sp.encode(zh[:120], out_type=int)
            + [SEP]
            + self.sp.encode(cand, out_type=int)
        )
        return ids[:MAXLEN]

    def candidates(self, ctx: str, zh: str, cap: int = 30) -> list[str]:
        text = ctx + " " + zh
        found = [n for n in self.names if n in text]
        return list(dict.fromkeys(found))[:cap] + SPECIAL_CANDS

    def score_speakers(self, ctx: str, zh: str) -> dict:
        return self._score(ctx, zh, self.candidates(ctx, zh))

    def score_speakers_with_candidates(self, ctx: str, zh: str, candidates: list) -> dict:
        """Same scoring, but against caller-supplied candidate names (e.g. this
        app's own project glossary) instead of the model's built-in
        known_names.json — that dictionary is specific to the model author's
        own training corpus and won't contain most users' character names."""
        seen = list(dict.fromkeys(c for c in candidates if c and c in (ctx + " " + zh)))
        return self._score(ctx, zh, seen[:30] + SPECIAL_CANDS)

    def _score(self, ctx: str, zh: str, cands: list) -> dict:
        if not cands:
            return {"speaker": "UNKNOWN", "candidates": [], "top_prob": 0.0, "margin": 0.0, "scores": []}
        seqs = [self.encode(ctx, zh, c) for c in cands]
        m = max(len(s) for s in seqs)
        x = np.zeros((len(seqs), m), dtype=np.int64)
        mask = np.zeros((len(seqs), m), dtype=bool)
        for i, s in enumerate(seqs):
            x[i, : len(s)] = s
            mask[i, : len(s)] = True
        scores_np = self.model.forward(x, mask).astype(np.float32)
        exp = np.exp(scores_np - scores_np.max())
        probs = exp / max(float(exp.sum()), 1e-9)
        order = np.argsort(-probs)
        top = int(order[0])
        second_prob = float(probs[int(order[1])]) if len(order) > 1 else 0.0
        return {
            "speaker": cands[top],
            "candidates": cands,
            "top_prob": float(probs[top]),
            "margin": float(probs[top] - second_prob),
            "scores": [
                {"candidate": cands[i], "score": float(scores_np[i]), "prob": float(probs[i])}
                for i in order[:5]
            ],
        }
