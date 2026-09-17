import test from "node:test";
import assert from "node:assert/strict";
import { assertPronounsPreserved, pronounSequence } from "../src/lib/preservePronouns.js";

test("allows prose smoothing when pronouns stay in the same order", () => {
  assert.doesNotThrow(() => assertPronounsPreserved('"Ta bảo ngươi đi."', '"Ta đã bảo ngươi đi."'));
});

test("rejects a changed or added pronoun", () => {
  assert.throws(() => assertPronounsPreserved('"Ta bảo ngươi đi."', '"Tôi bảo ngươi đi."'));
  assert.throws(() => assertPronounsPreserved('Nàng rời đi.', 'Nàng bảo hắn rời đi.'));
});

test("includes project-specific address terms and checks each line", () => {
  const rules = [{ self_word: "bổn cung", target_word: "điện hạ" }];
  assert.deepEqual(pronounSequence('Bổn cung gặp điện hạ.', rules), [["bổn cung", "điện hạ"]]);
  assert.throws(() => assertPronounsPreserved('Ta đi.\nNgươi ở lại.', 'Ngươi đi.\nTa ở lại.'));
});
