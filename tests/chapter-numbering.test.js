import test from "node:test";
import assert from "node:assert/strict";
import { findRepeatedLines, formatChapterName, headingRegexForTemplate, numberChapters, parseTitleNumber, planChapterDelete, planChapterInsert, planRenumberAll } from "../src/lib/chapterNumbering.js";
import { splitByHeadingRegex } from "../src/lib/importChapters.js";
import { EPUB_CHAPTER_REGEX_SOURCE } from "../src/lib/documentImport.js";

const raw = ["师傅饶命GL", "", "第一回 初见", "正文一", "", "师傅饶命GL", "", "正文二", "", "师傅饶命GL", "", "第三回 离别", "正文三"].join("\n");

test("tìm dòng lặp làm dấu đầu chương", () => {
  assert.deepEqual(findRepeatedLines(raw)[0], { line: "师傅饶命GL", count: 3 });
  assert.deepEqual(findRepeatedLines("a\nb\na"), []);
});

test("đánh số theo mẫu, bắt đầu từ số tùy chọn", () => {
  const { text, count } = numberChapters(raw, { marker: "师傅饶命GL", template: "Chương {n}", start: 5 });
  assert.equal(count, 3);
  assert.deepEqual(text.split("\n").filter((l) => l.startsWith("Chương")), ["Chương 5", "Chương 6", "Chương 7"]);
});

test("{dong} lấy dòng kế tiếp, bỏ dấu phân cách khi trống", () => {
  assert.equal(formatChapterName("Chương {n}: {dong}", 2, ""), "Chương 2");
  assert.equal(formatChapterName("{nnn}", 7), "007");
  const { text } = numberChapters(raw, { marker: "师傅饶命GL", template: "Chương {n}: {dong}" });
  assert.deepEqual(text.split("\n").filter((l) => l.startsWith("Chương")), ["Chương 1: 第一回 初见", "Chương 2: 正文二", "Chương 3: 第三回 离别"]);
});

test("regex từ mẫu tách đúng các chương đã đánh số", () => {
  for (const template of ["Chương {n}", "Chương {n}: {dong}", "第{n}章", "{nnn}"]) {
    const { text } = numberChapters(raw, { marker: "师傅饶命GL", template });
    const chapters = splitByHeadingRegex(text, headingRegexForTemplate(template));
    assert.equal(chapters.length, 3, template);
    assert.match(chapters[2].content, /正文三/);
  }
});

test("văn bản EPUB giữ dấu ⟦CHUONG⟧ và vẫn tách bằng regex EPUB", () => {
  const epub = ["⟦CHUONG⟧ 师傅饶命GL", "", "một", "", "⟦CHUONG⟧ 师傅饶命GL", "", "hai", "", "⟦CHUONG⟧ 师傅饶命GL", "", "ba"].join("\n");
  assert.equal(findRepeatedLines(epub)[0].line, "师傅饶命GL");
  const { text } = numberChapters(epub, { marker: "师傅饶命GL" });
  const chapters = splitByHeadingRegex(text, EPUB_CHAPTER_REGEX_SOURCE);
  assert.deepEqual(chapters.map((c) => c.title), ["Chương 1", "Chương 2", "Chương 3"]);
});

test("giữ kiểu xuống dòng CRLF", () => {
  const { text } = numberChapters(raw.replace(/\n/g, "\r\n"), { marker: "师傅饶命GL" });
  assert.ok(text.includes("Chương 1\r\n"));
});

test("đọc số chương ở đầu tiêu đề", () => {
  assert.equal(parseTitleNumber("Chương 10: Gặp gỡ").shift(1), "Chương 11: Gặp gỡ");
  assert.equal(parseTitleNumber("第10章 重逢").shift(1), "第11章 重逢");
  assert.equal(parseTitleNumber("第10章 重逢").heading(1), "第11章");
  assert.equal(parseTitleNumber("009. Tên").shift(1), "010. Tên");
  assert.equal(parseTitleNumber("551. Chương 548 - A").shift(1), "552. Chương 549 - A");
  assert.equal(parseTitleNumber("chapter 3").heading(1), "chapter 4");
  assert.equal(parseTitleNumber("Phiên ngoại 1"), null);
  assert.equal(parseTitleNumber("2024 là năm"), null);
});

const list = (titles) => titles.map((title, i) => ({ id: `c${i}`, title, chapter_order: i }));

test("chèn sau chương 10 → chương mới là 11, các chương sau tăng 1", () => {
  const chapters = list(["Văn án", ...Array.from({ length: 12 }, (_, i) => `Chương ${i + 1}: T${i + 1}`)]);
  const plan = planChapterInsert(chapters, 10);
  assert.equal(plan.title, "Chương 11");
  assert.equal(plan.chapterOrder, 10.5);
  assert.deepEqual(plan.renames, [{ id: "c11", title: "Chương 12: T11" }, { id: "c12", title: "Chương 13: T12" }]);
});

test("bỏ qua chương không số, dừng khi quyển mới đánh lại từ 1", () => {
  const chapters = list(["Chương 1", "Chương 2", "Phiên ngoại", "Chương 3", "Chương 1", "Chương 2"]);
  const plan = planChapterInsert(chapters, 0);
  assert.equal(plan.title, "Chương 2");
  assert.deepEqual(plan.renames.map((r) => r.title), ["Chương 3", "Chương 4"]);
});

test("chèn sau chương không số lấy số của chương bên dưới", () => {
  const plan = planChapterInsert(list(["Văn án", "Chương 1", "Chương 2"]), 0);
  assert.equal(plan.title, "Chương 1");
  assert.deepEqual(plan.renames.map((r) => r.title), ["Chương 2", "Chương 3"]);
});

test("chèn ở cuối danh sách", () => {
  const plan = planChapterInsert(list(["Chương 1", "Chương 2"]), 1);
  assert.deepEqual([plan.title, plan.chapterOrder, plan.renames.length], ["Chương 3", 2, 0]);
});

test("chèn trước chương đầu tiên (vị trí 1)", () => {
  const plan = planChapterInsert(list(["Chương 1", "Chương 2"]), -1);
  assert.deepEqual([plan.title, plan.chapterOrder < 0], ["Chương 1", true]);
  assert.deepEqual(plan.renames.map((r) => r.title), ["Chương 2", "Chương 3"]);
});

test("xóa chương 2 → các chương sau lùi 1 số", () => {
  const chapters = list(["Chương 1", "Chương 2", "Phiên ngoại", "Chương 3: A", "Chương 1"]);
  assert.deepEqual(planChapterDelete(chapters, 1).renames, [{ id: "c3", title: "Chương 2: A" }]);
  assert.deepEqual(planChapterDelete(chapters, 2).renames, []);
});

test("đánh lại số cả truyện sửa chỗ bị lệch", () => {
  const chapters = list(["Văn án", "Chương 1", "Chương 4: A", "Chương 5", "Phiên ngoại", "Chương 4", "Chương 5"]);
  assert.deepEqual(planRenumberAll(chapters), [
    { id: "c2", title: "Chương 2: A" },
    { id: "c3", title: "Chương 3" },
  ]);
});

test("lùi số không đệm số 0 cho tiêu đề không đệm", () => {
  assert.equal(parseTitleNumber("Chương 10").shift(-2), "Chương 8");
  assert.equal(parseTitleNumber("Chương 100").shift(-1), "Chương 99");
  assert.equal(parseTitleNumber("010. A").shift(-1), "009. A");
});
