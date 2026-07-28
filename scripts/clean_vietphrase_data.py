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

  3. Entries whose KEY starts with 的 (e.g. "的怀抱" -> "ôm ấp hoài bão",
     a mistranslation of 怀抱="vòng ôm" glued to a leading particle that
     should never have been part of the key). Unlike a *trailing* 的/得/地/了
     — which is often a legitimate final syllable of a real word — a
     *leading* 的 is never legitimate: 的 always attaches to the end of
     what precedes it, never the start of what follows, so this direction
     has no ambiguous cases to worry about. Deleting these entries lets the
     greedy matcher fall through to (a) the existing "的":"" drop rule, then
     (b) whatever correct standalone entry already exists for the rest of
     the word — confirmed safe for 411/415 cases (the other 4 are obscure
     enough that falling back to per-character/unknown-char is still a
     strict improvement over the wrong glued translation).

Re-run this script whenever the upstream dataset is refreshed/replaced.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "src" / "data"
FILES = ["vietphrase-words.json", "vietphrase-chars.json"]

# Known-bad individual entries found by testing real chapters: each one is a
# legitimate-looking N-char match that "shadows" a better, more general
# match starting one position later, because greedy longest-match always
# fires at the earliest position first. E.g. "在这屋" (3 chars, "ở nhà này")
# consumes the "在这屋顶" text before the much better "屋顶"/"屋顶上" entries
# ("nóc nhà"/"trên nóc nhà") ever get a chance to match. Deleting the bad
# shadow entry lets the matcher fall through to the good one.
KNOWN_BAD_SHADOW_ENTRIES = {
    "在这屋",
}


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
    total_deleted = 0
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

        # 3. Drop entries whose key starts with 的 (leading-particle glue),
        #    plus any known-bad shadow entries.
        deleted_keys = [k for k in data if len(k) > 1 and k.startswith("的")]
        deleted_keys += [k for k in KNOWN_BAD_SHADOW_ENTRIES if k in data]
        for k in deleted_keys:
            del data[k]

        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"{filename}: {changed} entries cleaned, {len(deleted_keys)} leading-的 entries deleted (of {len(data)} total)")
        for k, old, new in examples:
            print(f"   {k!r}: {old!r} -> {new!r}")
        if deleted_keys:
            print(f"   deleted examples: {deleted_keys[:8]}")
        total_changed += changed
        total_deleted += len(deleted_keys)

    print(f"\nTotal entries cleaned: {total_changed}, deleted: {total_deleted}")


if __name__ == "__main__":
    main()
