import test from "node:test";
import assert from "node:assert/strict";
import { assertChineseSourceReadable, findPrivateUseCharacters } from "../src/lib/chineseSourceCheck.js";

test("rejects obfuscated Chinese before translation", () => {
  const source = "苏南雪第一句‌‌说完。";
  assert.deepEqual(findPrivateUseCharacters(source), ["", ""]);
  assert.throws(() => assertChineseSourceReadable(source), /2 ký tự bị mã hóa/);
});

test("accepts readable Chinese source", () => {
  assert.doesNotThrow(() => assertChineseSourceReadable("苏南雪第一句话没说完。"));
});
