import test from "node:test";
import assert from "node:assert/strict";
import {
  addHanVietVocabulary,
  isInHanVietVocabulary,
  mergeHanVietVocabulary,
  removeHanVietVocabulary,
} from "../src/lib/hanvietVocabulary.js";

test("selected vocabulary overrides a project glossary collision", () => {
  const merged = mergeHanVietVocabulary(
    [{ source_term: "青山", translation: "Núi Xanh" }],
    [{ source_term: "青山", translation: "Thanh Sơn" }]
  );
  assert.deepEqual(merged.map(({ source_term, translation }) => ({ source_term, translation })), [
    { source_term: "青山", translation: "Thanh Sơn" },
  ]);
});

test("adding terms reports new, updated and invalid entries", () => {
  const result = addHanVietVocabulary(
    [{ source_term: "青山", translation: "Núi Xanh" }],
    [
      { source_term: "青山", translation: "Thanh Sơn" },
      { source_term: "陆空希", translation: "Lục Không Hi" },
      { source_term: "A Trì", translation: "A Trì" },
    ],
    "project-1"
  );
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.ignored, 1);
  assert.equal(isInHanVietVocabulary({ source_term: "青山", translation: "Thanh Sơn" }, result.terms), true);
});

test("selected source terms can be removed from personal vocabulary", () => {
  const remaining = removeHanVietVocabulary(
    [{ source_term: "青山", translation: "Thanh Sơn" }, { source_term: "西京", translation: "Tây Kinh" }],
    ["青山"]
  );
  assert.deepEqual(remaining.map((term) => term.source_term), ["西京"]);
});

