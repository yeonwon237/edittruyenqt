import test from "node:test";
import assert from "node:assert/strict";
import { mergeStoryLearning, parseStoryLearningResult } from "../src/lib/storyLearning.js";

test("parses fenced JSON responses", () => {
  const parsed = parseStoryLearningResult(`\`\`\`json
{"summary":"Tóm tắt.","pronounRules":[],"terms":[]}
\`\`\``);
  assert.equal(parsed.summary, "Tóm tắt.");
});

test("accepts only high-confidence, evidenced, non-conflicting knowledge", () => {
  const result = mergeStoryLearning({
    existingRules: [{ speaker: "A", listener: "B", self_word: "ta", target_word: "ngươi" }],
    existingTerms: [{ source_term: "青山", translation: "Thanh Sơn" }],
    chapter: { id: "c1", title: "Chương 1" },
    learned: {
      pronounRules: [
        { speaker: "C", listener: "D", self_word: "vi sư", target_word: "đồ nhi", evidence: "Vi sư đã dặn đồ nhi.", confidence: 0.96 },
        { speaker: "A", listener: "B", self_word: "tôi", target_word: "bạn", evidence: "Tôi gọi bạn.", confidence: 0.99 },
        { speaker: "E", listener: "F", self_word: "ta", target_word: "nàng", evidence: "", confidence: 0.99 },
      ],
      terms: [
        { source_term: "灵剑", translation: "Linh Kiếm", category: "Vật phẩm", evidence: "Linh Kiếm rung lên.", confidence: 0.95 },
        { source_term: "青山", translation: "Núi Xanh", category: "Địa danh", evidence: "Núi Xanh.", confidence: 0.99 },
      ],
    },
  });
  assert.equal(result.acceptedRules.length, 1);
  assert.equal(result.acceptedTerms.length, 1);
  assert.equal(result.candidates.filter((item) => item.status === "conflict").length, 2);
});
