import test from "node:test";
import assert from "node:assert/strict";
import { spaceParagraphs } from "../src/lib/paragraphSpacing.js";

test("giãn đoạn đơn, giữ nội dung và khoảng cách có sẵn", () => {
  const input = '  Đoạn một.\n“Lời thoại.”\n\nĐoạn hai.\n\n\n***\n\nKết.';
  const expected = '  Đoạn một.\n\n“Lời thoại.”\n\nĐoạn hai.\n\n\n***\n\nKết.';
  assert.equal(spaceParagraphs(input), expected);
  assert.equal(spaceParagraphs(expected), expected);
});

test("giữ dòng trống có khoảng trắng và ký tự xuống dòng Windows", () => {
  assert.equal(spaceParagraphs('Một\r\nHai\r\n  \r\nBa'), 'Một\r\n\r\nHai\r\n  \r\nBa');
});

test("bỏ qua nội dung trống và không tự tách câu trong đoạn", () => {
  for (const text of ['', '  ', '\n\n', 'Một. Hai! Ba?', '\nĐoạn.\n']) {
    assert.equal(spaceParagraphs(text), text);
  }
  assert.equal(spaceParagraphs(null), '');
});
