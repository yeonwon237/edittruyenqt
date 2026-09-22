import test from "node:test";
import assert from "node:assert/strict";
import { buildChapterDataset } from "../src/lib/exportUtils.js";

const chapters = [
  { project_id: "p1", id: "c1", chapter_order: 1, title: "Một", raw_original: " 中文一 ", qt_raw: " QT một ", edited: " Edit một " },
  { project_id: "p1", id: "c2", chapter_order: 2, title: "Hai", raw_original: "中文二", qt_raw: "", edited: "Edit hai" },
  { project_id: "p1", id: "c3", chapter_order: 3, title: "Ba", raw_original: "中文三", qt_raw: "QT ba", edited: "" },
];

test("ghép Trung raw và Edit từ đúng cùng chapter record", () => {
  const rows = buildChapterDataset(chapters, "raw");
  assert.deepEqual(rows.map(({ chapter_id, pair_id, input, output }) => ({ chapter_id, pair_id, input, output })), [
    { chapter_id: "c1", pair_id: "c1:zh_raw", input: " 中文一 ", output: " Edit một " },
    { chapter_id: "c2", pair_id: "c2:zh_raw", input: "中文二", output: "Edit hai" },
  ]);
});

test("QT → Edit loại chương thiếu một vế và không nhân đôi chapter id", () => {
  const rows = buildChapterDataset([...chapters, { ...chapters[0], title: "Bản trùng" }], "qt");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chapter_id, "c1");
  assert.equal(rows[0].pair_id, "c1:qt");
  assert.equal(rows[0].input, " QT một ");
  assert.equal(rows[0].output, " Edit một ");
});
