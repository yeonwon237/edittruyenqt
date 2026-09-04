import test from "node:test";
import assert from "node:assert/strict";
import { findTextMatches } from "../src/lib/textSearch.js";

test("finds every non-overlapping occurrence without case sensitivity", () => {
  assert.deepEqual(findTextMatches("Cô nói. CÔ cười. cô đi.", "cô"), [
    { start: 0, end: 2 },
    { start: 8, end: 10 },
    { start: 17, end: 19 },
  ]);
});

test("supports phrases and empty queries", () => {
  assert.deepEqual(findTextMatches("một câu sai, một câu đúng", "một câu"), [
    { start: 0, end: 7 },
    { start: 13, end: 20 },
  ]);
  assert.deepEqual(findTextMatches("abc", ""), []);
});
