import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTER_HEADING_PRESETS, splitByHeadingRegex } from "../src/lib/importChapters.js";

const split = (text) => splitByHeadingRegex(text, CHAPTER_HEADING_PRESETS.vi.source);

test("gộp tiêu đề lặp trong khung phân cách, giữ ngày và nội dung", () => {
  const chapters = [
    { title: "Chương 1 chương 1: Nhân Hình Ức Chế Tề", content: "2026/6/22\n\nNội dung một." },
    { title: "Chương 2 chương 2: Cố Minh Lan", content: "Nội dung hai." },
  ];
  for (const newline of ["\n", "\r\n"]) {
    const text = chapters.map(({ title, content }) =>
      ["==========", title, "==========", "", title, "", content].join("\n")
    ).join("\n\n").replaceAll("\n", newline);
    assert.deepEqual(split(text), chapters);
  }
});

test("gộp nhiều tiêu đề rỗng liên tiếp dù khác khoảng trắng và hoa thường", () => {
  assert.deepEqual(split("Chương 1: A\n\nchương  1: A\n=====\nChương 1: A\nNội dung"), [
    { title: "Chương 1: A", content: "Nội dung" },
  ]);
});

test("giữ chương rỗng có tiêu đề khác, kể cả cùng số chương", () => {
  assert.deepEqual(split("Chương 1: A\n=====\nChương 1: B\nNội dung\nChương 2"), [
    { title: "Chương 1: A", content: "" },
    { title: "Chương 1: B", content: "Nội dung" },
    { title: "Chương 2", content: "" },
  ]);
});

test("giữ các chương trùng tên khi có nội dung ở giữa", () => {
  assert.deepEqual(split("Chương 1: A\nNội dung một\nChương 1: A\nNội dung hai"), [
    { title: "Chương 1: A", content: "Nội dung một" },
    { title: "Chương 1: A", content: "Nội dung hai" },
  ]);
});
