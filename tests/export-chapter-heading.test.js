import test from "node:test";
import assert from "node:assert/strict";
import { chapterHeading } from "../src/lib/exportUtils.js";

test("export keeps an existing chapter number when sort order differs", () => {
  assert.equal(chapterHeading({ chapter_order: 2, title: "Chương 1: Mạo bảng" }, 0), "Chương 1: Mạo bảng");
  assert.equal(chapterHeading({ chapter_order: 3, title: "Chapter 2: Arrival" }, 1), "Chapter 2: Arrival");
});

test("export still labels unnumbered and empty titles", () => {
  assert.equal(chapterHeading({ chapter_order: 2, title: "Mạo bảng" }, 0), "Chương 2: Mạo bảng");
  assert.equal(chapterHeading({ chapter_order: 2, title: "" }, 0), "Chương 2");
});
