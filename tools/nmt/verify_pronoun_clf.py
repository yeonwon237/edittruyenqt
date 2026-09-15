"""One-off verification: numpy PronounSpeakerClassifier vs the original torch
PronounRenderer.score_speakers on real Chinese dialogue lines. Not part of the
app; a dev-only check that the numpy port matches (see pronoun_clf_np.py).
"""
import sys

sys.path.insert(0, "pronoun_clf_ref")
sys.path.insert(0, ".")

from pronoun_infer import PronounRenderer  # noqa: E402
from pronoun_clf_np import PronounSpeakerClassifier  # noqa: E402

torch_clf = PronounRenderer("pronoun_clf_ref", "pronoun_clf_ref/source.spm")
np_clf = PronounSpeakerClassifier("pronoun_clf")

samples = [
    ("", "程谨走到李清风面前，笑着说道。", "“你终于来了。”"),
    ("苏文瑶推开门，看见沈亦臣坐在窗边。", "沈亦臣抬起头，冷冷地看着她。", "“你来做什么？”"),
    ("", "他让祁溪流血。", "“住手！”祁溪喊道。"),
    ("陆令走进房间，助理跟在身后。", "陆令皱眉。", "“你确定？”"),
    ("", "完全没有候选人名字的句子。", "“……”"),
]

max_diff = 0.0
for ctx, zh_ctx, zh in samples:
    full_zh = zh_ctx + zh
    t = torch_clf.score_speakers(ctx, full_zh)
    n = np_clf.score_speakers(ctx, full_zh)
    print(f"\nZH: {full_zh}")
    print(f"  torch: speaker={t['speaker']!r} p={t['top_prob']:.4f} margin={t['margin']:.4f} cands={t['candidates']}")
    print(f"  numpy: speaker={n['speaker']!r} p={n['top_prob']:.4f} margin={n['margin']:.4f} cands={n['candidates']}")
    assert t["candidates"] == n["candidates"], "candidate list mismatch!"
    assert t["speaker"] == n["speaker"], f"SPEAKER MISMATCH: {t['speaker']} vs {n['speaker']}"
    for ts, ns in zip(t["scores"], n["scores"]):
        diff = abs(ts["score"] - ns["score"])
        max_diff = max(max_diff, diff)
        assert ts["candidate"] == ns["candidate"]

print(f"\nOK — all speakers match, max abs logit diff = {max_diff:.2e}")
