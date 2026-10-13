import test from "node:test";
import assert from "node:assert/strict";
import { parseBatchTitleLines, planBatchChapterTitles } from "../src/lib/batchChapterTitles.js";

const chapters = Array.from({ length: 4 }, (_, index) => ({
  id: `c${index + 1}`,
  title: `Chương ${index + 1}`,
  chapter_order: index,
}));

test("parses plain titles and strips an optional existing chapter prefix", () => {
  assert.deepEqual(
    parseBatchTitleLines(" Mở đầu \n\nChương 2: Gặp gỡ\nChapter 3 - Chia xa "),
    ["Mở đầu", "Gặp gỡ", "Chia xa"]
  );
});

test("maps each pasted line to the requested numbered chapter", () => {
  const result = planBatchChapterTitles(chapters, {
    start: 2,
    end: 4,
    text: "Gặp gỡ\nHiểu lầm\nĐoàn tụ",
  });
  assert.equal(result.error, "");
  assert.deepEqual(result.plan.map(({ id, title }) => ({ id, title })), [
    { id: "c2", title: "Chương 2: Gặp gỡ" },
    { id: "c3", title: "Chương 3: Hiểu lầm" },
    { id: "c4", title: "Chương 4: Đoàn tụ" },
  ]);
});

test("rejects a line count mismatch before any rename is planned", () => {
  const result = planBatchChapterTitles(chapters, { start: 2, end: 4, text: "Một\nHai" });
  assert.equal(result.plan.length, 0);
  assert.match(result.error, /Cần đúng 3 tiêu đề/u);
});

test("rejects missing and duplicate chapter numbers", () => {
  const missing = planBatchChapterTitles(chapters, { start: 4, end: 5, text: "Bốn\nNăm" });
  assert.match(missing.error, /Không tìm thấy Chương 5/u);

  const duplicate = planBatchChapterTitles(
    [...chapters, { id: "duplicate", title: "Chương 2: Khác", chapter_order: 5 }],
    { start: 2, end: 2, text: "Hai" }
  );
  assert.match(duplicate.error, /nhiều chương cùng mang số 2/u);
});
