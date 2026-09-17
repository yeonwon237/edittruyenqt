import test from "node:test";
import assert from "node:assert/strict";
import { composeEditPrompt, composeTranslationPrompt, DEFAULT_POLISH_PROMPT, DEFAULT_TRANSLATE_PROMPT } from "../src/lib/editPrompts.js";

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

test("translation always receives the saved prompt, glossary, matrix, and source", () => {
  const result = composeTranslationPrompt("Dịch sát nghĩa.", "你好", "- 你好 → xin chào", "◆ A: xưng ta");
  assert.match(result, /^Dịch sát nghĩa\./);
  assert.match(result, /GLOSSARY:\n- 你好 → xin chào/);
  assert.match(result, /MA TRẬN XƯNG HÔ:\n◆ A: xưng ta/);
  assert.match(result, /VĂN BẢN CẦN DỊCH:\n你好$/);
});

test("translation placeholders insert data without duplicating sections", () => {
  const result = composeTranslationPrompt("{{GLOSSARY}}\n{{PRONOUN_MATRIX}}\n{{TEXT}}", "你好", "tên", "xưng hô");
  assert.equal(result, "tên\nxưng hô\n你好");
});
