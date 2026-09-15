"""Fetches/builds every model file tools/nmt/server.py needs at runtime, into
tools/nmt/ct2_models/ and tools/nmt/pronoun_clf/. Run once before packaging
(locally or in CI — see .github/workflows/desktop-release.yml) or before a
fresh `tauri dev` on a machine that doesn't have them yet.

Needs requirements-convert.txt installed (torch/transformers/safetensors) —
NOT part of the app's runtime requirements.txt, only needed here.

What this reproduces, exactly as done interactively earlier in this
project's history:
  - 7 of the 8 zh-vi translation models + the vp2vi self-translate polish
    model: downloaded as pre-built CTranslate2 int8 exports straight from
    each model's own HuggingFace repo (the authors publish these
    themselves) — no conversion needed.
  - HachimiMT-30's own repo (no official ct2 build) and vp2vi: converted
    locally via convert_ct2.py's ExactVocabMarianMTLoader, which fixes a
    real bug in ctranslate2's stock MarianMTLoader (it assumes a "ghost"
    padding row that some HF vocab layouts don't have, and blindly strips
    the last embedding row — silently dropping a real in-vocabulary token
    otherwise; see convert_ct2.py's own docstring for the full story).
  - The pronoun speaker classifier (DanVP/moxhimt-pronoun-clf) weights,
    exported once to a plain .npz (see pronoun_clf_np.py — the numpy port
    that runs it without torch at app runtime).
"""
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download

HERE = Path(__file__).resolve().parent
CT2_DIR = HERE / "ct2_models"
PRONOUN_CLF_DIR = HERE / "pronoun_clf"

# (local key, HF repo, ct2 subdir in that repo) — pre-built, just download.
PREBUILT = [
    ("HachimiMT-60", "ngocdang83/HachimiMT-60-zh-vi", "ct2-int8_float32"),
    ("HachimiMT-60-QT", "ngocdang83/HachimiMT-60-QT", "ct2-int8_float32"),
    ("MoxhiMT-60", "DanVP/MoxhiMT-60", "ct2-int8"),
    ("MoxhiMT-30", "DanVP/MoxhiMT-30", "ct2-int8_float32"),
    ("MoxhiMT-30-QT", "DanVP/MoxhiMT-30-QT", "ct2-int8_float32"),
    ("HirashibaMT-Medium", "ngungodan/hirashiba-mt-medium-ct2", "ct2-int8_float32"),
    ("HirashibaMT-Tiny", "ngungodan/hirashiba-mt-tiny-zh-vi-ct2", "ct2-int8-keeppad"),
]
# HirashibaMT-Tiny's ct2 subdir doesn't carry its own source.spm/target.spm —
# those live at the repo root instead.
TINY_EXTRA_FILES = ["source.spm", "target.spm"]

# (local key, source HF repo) — no official ct2 build published, convert
# locally with our vocab-preserving loader.
TO_CONVERT = [
    ("HachimiMT-30", "ngocdang83/HachimiMT-30-zh-vi"),
    ("vp2vi", "DanVP/vp2vi"),
]

PRONOUN_CLF_REPO = "DanVP/moxhimt-pronoun-clf"


def fetch_prebuilt():
    for key, repo, subdir in PREBUILT:
        print(f"=== {key}: downloading {repo}/{subdir} ===")
        local = snapshot_download(repo, allow_patterns=[f"{subdir}/*"])
        src = Path(local) / subdir
        dst = CT2_DIR / key
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        if key == "HirashibaMT-Tiny":
            for f in TINY_EXTRA_FILES:
                p = hf_hub_download(repo, f)
                shutil.copy(p, dst / f)
        print(f"OK: {key} -> {dst}")


def convert_missing():
    # Imported lazily — needs requirements-convert.txt (torch/transformers),
    # not part of the app's own runtime requirements.
    from convert_ct2 import convert

    for key, repo in TO_CONVERT:
        print(f"=== {key}: converting {repo} (no official ct2 build) ===")
        convert(repo, str(CT2_DIR / key))


def fetch_pronoun_clf():
    print(f"=== pronoun-clf: downloading {PRONOUN_CLF_REPO} + exporting weights ===")
    PRONOUN_CLF_DIR.mkdir(parents=True, exist_ok=True)
    for f in ["known_names.json", "source.spm"]:
        p = hf_hub_download(PRONOUN_CLF_REPO, f)
        shutil.copy(p, PRONOUN_CLF_DIR / f)

    import numpy as np
    import torch

    weights_path = hf_hub_download(PRONOUN_CLF_REPO, "speaker_clf.pt")
    state_dict = torch.load(weights_path, map_location="cpu")
    np.savez(PRONOUN_CLF_DIR / "speaker_clf_weights.npz", **{k: v.numpy() for k, v in state_dict.items()})
    print(f"OK: pronoun-clf -> {PRONOUN_CLF_DIR}")


if __name__ == "__main__":
    CT2_DIR.mkdir(parents=True, exist_ok=True)
    fetch_prebuilt()
    convert_missing()
    fetch_pronoun_clf()
    print("\nAll models ready.")
    sys.exit(0)
