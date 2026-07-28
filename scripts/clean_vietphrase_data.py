#!/usr/bin/env python3
"""One-time (and re-runnable) cleanup pass over the bundled VietPhrase dataset.

The community-sourced dataset in src/data/vietphrase-{words,chars}.json carries
a few raw-format artifacts left over from the original QT/Convert data dump:

  1. Values still wrapped in "{...}" (proper-noun marker that was never
     unwrapped), e.g. "黑骑士" -> "{Hắc kỵ sĩ}".
  2. Values joining two candidate translations with ":" that was never
     resolved down to one, e.g. "第四章" -> "Chương 4:.".

Deliberately NOT handled here: stripping a trailing "đích/liễu/đắc/địa"
particle reading (的/了/得/地 leaking through literally, e.g. "长空的" ->
"bầu trời đích"). That pattern was investigated and rejected — 的/得/地 are
just as often the *last character of a real compound noun* (天地, 心得, 心地,
目的, 陆地, 圣地, 根据地, 殖民地...) as they are a dropped grammatical particle,
and no purely mechanical rule reliably tells the two apart. A blanket strip
would silently corrupt hundreds of correct entries. Fix confirmed leaks by
hand in hanvietData.js (HANVIET_WORDS override) instead, one verified case
at a time.

Re-run this script whenever the upstream dataset is refreshed/replaced.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "src" / "data"
FILES = ["vietphrase-words.json", "vietphrase-chars.json"]


def clean_value(key, value):
    original = value

    # 1. Unwrap "{...}" proper-noun marker.
    if value.startswith("{") and value.endswith("}") and len(value) >= 2:
        value = value[1:-1].strip()

    # 2. Keep only the first candidate of an unresolved "A:B" pair.
    if ":" in value:
        first = value.split(":", 1)[0].strip()
        if first:
            value = first

    return value, value != original


def main():
    total_changed = 0
    for filename in FILES:
        path = DATA_DIR / filename
        data = json.loads(path.read_text(encoding="utf-8"))

        changed = 0
        examples = []
        for key, value in data.items():
            new_value, was_changed = clean_value(key, value)
            if was_changed:
                changed += 1
                if len(examples) < 8:
                    examples.append((key, value, new_value))
                data[key] = new_value

        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"{filename}: {changed} entries cleaned (of {len(data)} total)")
        for k, old, new in examples:
            print(f"   {k!r}: {old!r} -> {new!r}")
        total_changed += changed

    print(f"\nTotal entries cleaned: {total_changed}")


if __name__ == "__main__":
    main()
