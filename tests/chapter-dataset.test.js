import test from "node:test";
import assert from "node:assert/strict";
import { buildAlignedChapterDataset, buildChapterDataset, splitDatasetSegments } from "../src/lib/exportUtils.js";

const chapters = [
  { project_id: "p1", id: "c1", chapter_order: 1, title: "Một", raw_original: " 中文一 ", qt_raw: " QT một ", edited: " Edit một " },
  { project_id: "p1", id: "c2", chapter_order: 2, title: "Hai", raw_original: "中文二", qt_raw: "", edited: "Edit hai" },
  { project_id: "p1", id: "c3", chapter_order: 3, title: "Ba", raw_original: "中文三", qt_raw: "QT ba", edited: "" },
];

test("ghép Trung raw và Edit từ đúng cùng chapter record", () => {
  const rows = buildChapterDataset(chapters, "raw");
  assert.deepEqual(rows.map(({ chapter_id, pair_id, input, output }) => ({ chapter_id, pair_id, input, output })), [
    { chapter_id: "c1", pair_id: "c1:zh_raw:paragraph:1", input: "中文一", output: "Edit một" },
    { chapter_id: "c2", pair_id: "c2:zh_raw:paragraph:1", input: "中文二", output: "Edit hai" },
  ]);
});

test("QT → Edit loại chương thiếu một vế và không nhân đôi chapter id", () => {
  const rows = buildChapterDataset([...chapters, { ...chapters[0], title: "Bản trùng" }], "qt");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chapter_id, "c1");
  assert.equal(rows[0].pair_id, "c1:qt:paragraph:1");
  assert.equal(rows[0].input, "QT một");
  assert.equal(rows[0].output, "Edit một");
});

test("mỗi dòng nội dung trở thành một cặp đoạn riêng", () => {
  const rows = buildChapterDataset([{
    project_id: "p1", id: "c4", chapter_order: 4, title: "Bốn",
    raw_original: "第一段\n第二段", qt_raw: "Đoạn một\nĐoạn hai", edited: "Bản sửa một\nBản sửa hai",
  }], "raw", "paragraph");
  assert.deepEqual(rows.map((row) => [row.segment_id, row.input, row.output]), [
    ["c4:p0001", "第一段", "Bản sửa một"],
    ["c4:p0002", "第二段", "Bản sửa hai"],
  ]);
});

test("không ghép khi số đoạn nguồn, QT hoặc Edit lệch nhau", () => {
  const result = buildAlignedChapterDataset([{
    project_id: "p1", id: "c5", raw_original: "一\n二", qt_raw: "Một\nHai", edited: "Gộp thành một đoạn",
  }], "raw", "paragraph");
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.skipped[0], {
    chapter_id: "c5", title: "", source_segments: 2, qt_segments: 2, edited_segments: 1,
  });
});

test("tách câu giữ dấu câu ở đúng segment", () => {
  assert.deepEqual(splitDatasetSegments("师傅饶命！跑还是没有跑？\n咳咳……咳~", "sentence"), [
    "师傅饶命！", "跑还是没有跑？", "咳咳……", "咳~",
  ]);
});
