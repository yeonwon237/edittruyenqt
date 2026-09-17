import test from "node:test";
import assert from "node:assert/strict";
import { composeEditPrompt, DEFAULT_POLISH_PROMPT, DEFAULT_TRANSLATE_PROMPT } from "../src/lib/editPrompts.js";

test("uses the chosen prompt verbatim and appends only the source text", () => {
  assert.equal(composeEditPrompt("Chỉ làm mượt, giữ xưng hô.", "Ta đi."),
    "Chỉ làm mượt, giữ xưng hô.\n\nVĂN BẢN CẦN XỬ LÝ:\nTa đi.");
});

test("replaces explicit text and glossary placeholders", () => {
  assert.equal(composeEditPrompt("{{GLOSSARY}}\n{{TEXT}}", "你好", "- 你 → ngươi"),
    "- 你 → ngươi\n你好");
});

test("defaults remain separate for polishing and translation", () => {
  assert.match(DEFAULT_POLISH_PROMPT, /giữ nguyên xưng hô gốc/);
  assert.match(DEFAULT_TRANSLATE_PROMPT, /Dịch toàn bộ văn bản tiếng Trung/);
});
