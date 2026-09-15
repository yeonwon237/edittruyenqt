"""Converts our MarianMT translation models to CTranslate2 (int8) format.

ctranslate2's stock MarianMTLoader assumes HF Transformers appended one extra
"ghost" <pad> embedding row after the real vocabulary (the normal Marian/OPUS-MT
layout), and unconditionally strips the last embedding row to compensate. Our
models don't have that: vocab.json already includes <pad> at id 0, and the
embedding matrix size exactly matches the vocab size (verified per-model below).
Stripping the last row would silently delete a real, in-vocabulary token (e.g.
for DanVP/MoxhiMT-60, id 23999 is the Chinese character '薜') instead of a
harmless pad slot. This subclass skips that removal so the converted model
keeps the exact original vocabulary and weights (only int8-quantized, nothing
dropped).
"""

import os
import sys

from ctranslate2.converters.transformers import BartLoader, MarianMTLoader


class ExactVocabMarianMTLoader(MarianMTLoader):
    def get_model_spec(self, model):
        model.config.normalize_before = False
        model.config.normalize_embedding = False
        return BartLoader.get_model_spec(self, model)

    def get_vocabulary(self, model, tokenizer):
        return BartLoader.get_vocabulary(self, model, tokenizer)


def convert(model_id: str, output_dir: str) -> None:
    from transformers import AutoTokenizer, MarianMTModel

    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = MarianMTModel.from_pretrained(model_id)
    vocab_size = len(tokenizer.get_vocab())
    embed_rows = model.model.shared.weight.shape[0]
    if vocab_size != embed_rows:
        raise SystemExit(
            f"{model_id}: vocab size {vocab_size} != embedding rows {embed_rows} — "
            "this model does NOT match the assumption this script was written for "
            "(exact vocab/embedding match). Falling back to the stock loader would "
            "silently drop a real token; stopping instead."
        )

    loader = ExactVocabMarianMTLoader()
    spec = loader(model, tokenizer)
    spec.validate()
    spec.optimize(quantization="int8")
    os.makedirs(output_dir, exist_ok=True)
    spec.save(output_dir)
    print(f"OK: {model_id} -> {output_dir} (vocab={vocab_size}, weights unchanged)")


if __name__ == "__main__":
    model_id, output_dir = sys.argv[1], sys.argv[2]
    convert(model_id, output_dir)
