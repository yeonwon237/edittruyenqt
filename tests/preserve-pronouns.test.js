import test from "node:test";
import assert from "node:assert/strict";
import { protectPronouns, restoreProtectedPronouns } from "../src/lib/preservePronouns.js";

test("restores protected pronouns after prose smoothing", () => {
  const protectedInput = protectPronouns('"Ta bảo ngươi đi."');
  assert.equal(protectedInput.text, '"⟦XH1⟧ bảo ⟦XH2⟧ đi."');
  assert.deepEqual(
    restoreProtectedPronouns('"⟦XH1⟧ đã dặn ⟦XH2⟧ đi."', protectedInput.tokens),
    { text: '"Ta đã dặn ngươi đi."', complete: true }
  );
});

test("accepts new line breaks without discarding the paid AI result", () => {
  const protectedInput = protectPronouns("Ta đi. Ngươi ở lại.");
  assert.deepEqual(
    restoreProtectedPronouns("⟦XH1⟧ đi.\n⟦XH2⟧ ở lại.", protectedInput.tokens),
    { text: "Ta đi.\nNgươi ở lại.", complete: true }
  );
});

test("keeps a usable result and flags missing markers for review", () => {
  const protectedInput = protectPronouns("Ta bảo ngươi đi.");
  assert.deepEqual(
    restoreProtectedPronouns("⟦XH1⟧ bảo đi.", protectedInput.tokens),
    { text: "Ta bảo đi.", complete: false }
  );
});

test("restores the original sequence if AI swaps marker numbers", () => {
  const protectedInput = protectPronouns("Ta bảo ngươi đi.");
  assert.deepEqual(
    restoreProtectedPronouns("⟦XH2⟧ bảo ⟦XH1⟧ đi.", protectedInput.tokens),
    { text: "Ta bảo ngươi đi.", complete: false }
  );
});

test("includes project-specific address words", () => {
  const rules = [{ self_word: "bổn cung", target_word: "điện hạ" }];
  const protectedInput = protectPronouns("Bổn cung gặp điện hạ.", rules);
  assert.equal(protectedInput.text, "⟦XH1⟧ gặp ⟦XH2⟧.");
});
