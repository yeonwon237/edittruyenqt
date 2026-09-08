// Đo precision/recall/tỷ lệ sửa sai của QA xưng hô, dựa trên fixture "vàng"
// trong tests/fixtures/pronoun-gold/ (xem README.md trong thư mục đó).
//
// Cách chấm điểm theo từng span đã đánh dấu trong fixture:
//   - TP: span đánh dấu sai (correct:false) và QA có báo lỗi đúng vị trí.
//   - FN: span đánh dấu sai nhưng QA im lặng (bỏ sót).
//   - FP: span đánh dấu đúng (correct:true) mà QA lại báo lỗi, HOẶC QA báo
//         lỗi ở một vị trí không có trong danh sách đã đánh dấu.
//   - Wrong-fix: nằm trong nhóm TP, nhưng replacement QA đề xuất khác với
//     "expected" đã ghi trong fixture — đếm riêng, không cộng vào FP/FN.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runQualityCheck } from "../src/lib/qualityCheck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "..", "tests", "fixtures", "pronoun-gold");

function parseAnnotated(annotated) {
  const spans = [];
  let edited = "";
  let cursor = 0;
  const markerRegex = /\{\{([^{}]+?)\}\}/g;
  let match;
  while ((match = markerRegex.exec(annotated))) {
    edited += annotated.slice(cursor, match.index);
    const [wordPart, expectedPart] = match[1].split("=>");
    const word = wordPart.trim();
    const start = edited.length;
    edited += word;
    const end = edited.length;
    if (expectedPart !== undefined) {
      spans.push({ start, end, word, correct: false, expected: expectedPart.trim() });
    } else {
      spans.push({ start, end, word, correct: true });
    }
    cursor = match.index + match[0].length;
  }
  edited += annotated.slice(cursor);
  return { edited, spans };
}

function loadFixture(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (raw.annotated) {
    const { edited, spans } = parseAnnotated(raw.annotated);
    return { ...raw, edited, spans };
  }
  return raw;
}

function scoreFixture(fixture) {
  const issues = runQualityCheck(fixture.edited, { pronounRules: fixture.rules || [] })
    .filter((issue) => issue.type === "pronoun");
  const issuesByKey = new Map(issues.map((issue) => [`${issue.start}:${issue.end}`, issue]));
  const spanKeys = new Set((fixture.spans || []).map((span) => `${span.start}:${span.end}`));

  let tp = 0, fp = 0, fn = 0, wrongFix = 0;
  for (const span of fixture.spans || []) {
    const key = `${span.start}:${span.end}`;
    const issue = issuesByKey.get(key);
    if (span.correct === false) {
      if (issue) {
        tp++;
        if (issue.replacement !== span.expected) wrongFix++;
      } else {
        fn++;
      }
    } else if (issue) {
      fp++;
    }
  }
  for (const issue of issues) {
    const key = `${issue.start}:${issue.end}`;
    if (!spanKeys.has(key)) fp++;
  }
  return { tp, fp, fn, wrongFix };
}

function pct(n, d) {
  return d === 0 ? "N/A" : `${((n / d) * 100).toFixed(1)}%`;
}

const files = fs.existsSync(fixtureDir)
  ? fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".json"))
  : [];

if (!files.length) {
  console.log("Không có fixture nào trong tests/fixtures/pronoun-gold/. Xem README.md để biết cách thêm.");
  process.exit(0);
}

const rows = [];
const total = { tp: 0, fp: 0, fn: 0, wrongFix: 0 };
for (const file of files) {
  const fixture = loadFixture(path.join(fixtureDir, file));
  const { tp, fp, fn, wrongFix } = scoreFixture(fixture);
  total.tp += tp; total.fp += fp; total.fn += fn; total.wrongFix += wrongFix;
  rows.push({
    chapter: fixture.chapter || file,
    precision: pct(tp, tp + fp),
    recall: pct(tp, tp + fn),
    wrongFix: pct(wrongFix, tp),
    tp, fp, fn,
  });
}

console.table(rows);
console.log("TỔNG:", {
  precision: pct(total.tp, total.tp + total.fp),
  recall: pct(total.tp, total.tp + total.fn),
  wrongFix: pct(total.wrongFix, total.tp),
  tp: total.tp, fp: total.fp, fn: total.fn,
});
