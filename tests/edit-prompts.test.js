import test from "node:test";
import assert from "node:assert/strict";
import { composeEditPrompt, composeTranslationPrompt, DEFAULT_POLISH_PROMPT, DEFAULT_TRANSLATE_PROMPT, filterTermsForPolish } from "../src/lib/editPrompts.js";

test("polish always receives glossary, pronoun matrix, and source text", () => {
  const result = composeEditPrompt("Chỉ làm mượt.", "Mạnh Lệnh Ô nói với cô.", "- Mạnh Lệnh Ô → Mạnh Lệnh Vu", "◆ Quý Khuynh Thời: xưng tôi");
  assert.match(result, /^Chỉ làm mượt\./);
  assert.match(result, /GLOSSARY \(TÊN VÀ THUẬT NGỮ CHUẨN\):\n- Mạnh Lệnh Ô → Mạnh Lệnh Vu/);
  assert.match(result, /MA TRẬN XƯNG HÔ VÀ NGÔI LỜI DẪN:\n◆ Quý Khuynh Thời: xưng tôi/);
  assert.match(result, /VĂN BẢN CẦN XỬ LÝ:\nMạnh Lệnh Ô nói với cô\.$/);
});

test("polish placeholders insert project data without duplicate sections", () => {
  const result = composeEditPrompt("{{GLOSSARY}}\n{{PRONOUN_MATRIX}}\n{{TEXT}}", "Ta đi.", "tên", "xưng hô");
  assert.match(result, /^tên\nxưng hô\nTa đi\./);
  assert.doesNotMatch(result, /GLOSSARY \(TÊN VÀ THUẬT NGỮ CHUẨN\)/);
  assert.doesNotMatch(result, /MA TRẬN XƯNG HÔ VÀ NGÔI LỜI DẪN:/);
});

test("defaults remain separate for polishing and translation", () => {
  assert.match(DEFAULT_POLISH_PROMPT, /tuân thủ Glossary và Ma trận xưng hô/);
  assert.match(DEFAULT_TRANSLATE_PROMPT, /Dịch toàn bộ văn bản tiếng Trung/);
});

test("QT glossary filtering keeps aliases and canonical forms but drops unrelated names", () => {
  const terms = [
    { source_term: "Mạnh Lệnh Ô", translation: "Mạnh Lệnh Vu" },
    { source_term: "季倾时", translation: "Quý Khuynh Thời" },
    { source_term: "顾明澜", translation: "Cố Minh Lan" },
  ];
  assert.deepEqual(
    filterTermsForPolish(terms, "Mạnh Lệnh Ô nhìn Quý Khuynh Thời."),
    terms.slice(0, 2)
  );
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
  assert.match(result, /^tên\nxưng hô\n你好/);
  assert.doesNotMatch(result, /\nGLOSSARY:\n/);
  assert.doesNotMatch(result, /\nMA TRẬN XƯNG HÔ:\n/);
});
