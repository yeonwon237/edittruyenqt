import test from "node:test";
import assert from "node:assert/strict";
import { assertPronounsPreserved, pronounSequence, protectPronouns, restoreProtectedPronouns } from "../src/lib/preservePronouns.js";

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

test("protects exact address words while surrounding prose is smoothed", () => {
  const input = '"Ta bảo ngươi đi."';
  const protectedInput = protectPronouns(input);
  assert.equal(protectedInput.text, '"⟦XH1⟧ bảo ⟦XH2⟧ đi."');
  const result = restoreProtectedPronouns('"⟦XH1⟧ đã dặn ⟦XH2⟧ đi."', protectedInput.tokens);
  assert.equal(result, '"Ta đã dặn ngươi đi."');
  assertPronounsPreserved(input, result);
});

test("rejects a missing or reordered protected word", () => {
  const { tokens } = protectPronouns("Ta bảo ngươi đi.");
  assert.throws(() => restoreProtectedPronouns("⟦XH1⟧ đi.", tokens));
  assert.throws(() => restoreProtectedPronouns("⟦XH2⟧ bảo ⟦XH1⟧ đi.", tokens));
});
