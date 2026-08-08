// Rule-based "QT thô -> Bản Edit" smoothing — a from-scratch, zero-AI
// alternative to the buildEditPrompt() AI Auto-Edit step in Workspace.jsx.
// Unlike hanviet.js (which translates Chinese -> Vietnamese), this module
// takes text that is ALREADY Vietnamese but awkward/literal — QT thô sourced
// from any convert tool, not just this app's own translator — and smooths
// it toward the user's own editing style using rules, not AI.
//
// Every rule here was derived by diffing the user's own real QT-thô/Bản-Edit
// chapter pairs (200 chapters) rather than guessed, and checked against the
// full corpus before being added. See per-rule comments for the numbers.
// JS's built-in \b only recognizes ASCII [A-Za-z0-9_] as "word" characters,
// so it misfires on Vietnamese diacritics — same fix as textReplace.js's
// WORD_CHAR (kept local here rather than imported to avoid coupling two
// otherwise-independent post-processing modules).
const WORD_CHAR = "A-Za-z0-9_\\u00C0-\\u1EFF";

// --- Strip meaningless sentence-final filler particles ---
// Some raw QT/Convert sources transliterate Chinese mood particles (啦, 呐 —
// pure tone-softeners with no dictionary meaning of their own, roughly like
// English "you know") literally into their bare Hán-Việt reading ("lạp",
// "nột") instead of dropping them, leaving nonsense like "có thể động tác
// lạp!". Checked against the user's own 200-chapter corpus: "lạp" appears
// 134 times in QT thô vs. only 4 times in their own Bản Edit (all 4 remaining
// are real words/ambiguous, not the filler — see guards below); "nột"
// appears 21 times raw vs. 2 in edit (both are one real reduplicated word).
//
// Two guards keep this conservative:
// - Reduplication ("nột nột" = "lắp bắp/stammering", a real word) is left
//   untouched.
// - Only stripped when sitting right at a clause boundary (followed by
//   punctuation, a closing quote, "~", or end of line/text) — mid-clause
//   occurrences ("lạp xưởng" = sausage, a real word) are left alone since
//   there is no reliable way to tell filler from content there.
const FILLER_WORDS = new Set(["lạp", "nột"]);
const FILLER_WORD_RE = new RegExp(`(?<![${WORD_CHAR}])(lạp|nột)(?![${WORD_CHAR}])`, "giu");
const CLAUSE_BOUNDARY_AFTER_RE = /^(?:[!?.,;:…~"'“”‘’»]|$)/;

function isReduplicatedNot(before, after) {
  return /nột\s*$/i.test(before) || /^\s*nột(?![A-Za-z0-9_À-ỿ])/i.test(after);
}

export function stripFillerParticles(text) {
  if (!text) return text;
  const result = text.replace(FILLER_WORD_RE, (match, word, offset, full) => {
    const lower = word.toLowerCase();
    if (!FILLER_WORDS.has(lower)) return match;

    const before = full.slice(Math.max(0, offset - 8), offset);
    const afterRaw = full.slice(offset + match.length, offset + match.length + 8);
    if (lower === "nột" && isReduplicatedNot(before, afterRaw)) return match;

    const restOfLine = full.slice(offset + match.length, indexOfLineEnd(full, offset + match.length));
    const trimmedRest = restOfLine.replace(/^[ \t]+/, "");
    if (!CLAUSE_BOUNDARY_AFTER_RE.test(trimmedRest)) return match;

    return "";
  });
  // Collapse the leftover space left behind where a filler word used to sit:
  // no space before standard punctuation ("động tác !" -> "động tác!"),
  // exactly one space before a trailing "~", none at end of line/text.
  return result
    .replace(/[ \t]+(?=[!?.,;:…])/g, "")
    .replace(/[ \t]+(?=~)/g, " ")
    .replace(/[ \t]+(?=\n|$)/g, "");
}

function indexOfLineEnd(text, from) {
  const idx = text.indexOf("\n", from);
  return idx === -1 ? text.length : idx;
}

// --- "có điểm" -> "có chút" ---
// Both mean "a bit/somewhat", but "có điểm" (literal reading of 有点) reads
// stiffly in Vietnamese — the user's own edits consistently reach for "có
// chút" instead. Checked against the 200-chapter corpus: "có điểm" appears
// 154 times in QT thô and is replaced 100% of the time — "có chút" in the
// user's own Bản Edit is up by almost exactly that many occurrences (627 ->
// ~725), with no leftover "có điểm" anywhere. No false positives found
// either ("địa điểm" etc. don't match — the two words must be adjacent).
const CO_DIEM_RE = new RegExp(`(?<![${WORD_CHAR}])(C|c)ó[ \\t]+điểm(?![${WORD_CHAR}])`, "gu");

export function normalizeCoDiem(text) {
  if (!text) return text;
  return text.replace(CO_DIEM_RE, (_match, capLetter) => `${capLetter}ó chút`);
}

// --- "không cấm" -> "không khỏi" ---
// Literal reading of 不禁 ("couldn't help but ..."), where 禁 was translated
// as its "forbid/ban" sense ("cấm") instead of its "restrain" sense — always
// sitting directly before a verb, e.g. "không cấm cảm thán" ("couldn't help
// but sigh"). Checked against the 200-chapter corpus: 159/159 occurrences in
// QT thô are gone from the user's own Bản Edit, replaced across the corpus
// by a mix of "không khỏi" (11 -> 79) and "không kìm được" (0 -> 64) in
// roughly the matching amount. This rule standardizes on "không khỏi" (both
// are correct Vietnamese; a rule-based pass can't guess which of two valid
// synonyms the user would have picked chapter to chapter). One garbled
// non-idiom collision found in 159 real occurrences ("vùng cấm không cấm khu
// vấn đề" — already-broken source text) — accepted as negligible.
const KHONG_CAM_RE = new RegExp(`(?<![${WORD_CHAR}])(K|k)hông cấm(?![${WORD_CHAR}])`, "gu");

export function normalizeKhongCam(text) {
  if (!text) return text;
  return text.replace(KHONG_CAM_RE, (_match, capLetter) => `${capLetter}hông khỏi`);
}

// --- "[clause] thời điểm," -> "Lúc [clause]," ---
// Chinese puts a temporal clause marker (的时候/时) AFTER the clause it
// modifies; QT thô sources translate that marker literally as trailing
// "thời điểm" ("point in time"), e.g. "Hạ đến lầu hai thời điểm, Đinh Kỳ
// Vũ..." Vietnamese puts the marker first: "Lúc hạ đến lầu hai, Đinh Kỳ
// Vũ...". Checked against the 200-chapter corpus: "thời điểm" occurs 291
// times raw vs. only 23 in the user's own Bản Edit (falls almost entirely
// on "lúc"/"lúc này" instead, 932 -> 1001). This pass only handles the
// (very common, ~150/291) case immediately followed by a comma, where the
// clause boundary is unambiguous — the other ~half run straight into the
// main clause with no punctuation and are left alone as too risky to guess.
//
// "thời điểm," is NOT always this marker, though — three guards, each found
// by testing against every real occurrence in the corpus and fixing what
// broke:
// - A comma immediately after a digit ("ta 3, 4 tuổi thời điểm,") is a
//   numeric list separator, not a clause boundary — skip past it when
//   scanning backward for where the clause starts.
// - A clause starting with "Ở "/"ở " (a leftover Chinese 在 locative marker)
//   would double up with the "Lúc" we're about to add ("Lúc Ở trúc y...") —
//   strip that leading word first.
// - "thời điểm" is also used as a plain copula/quantifier ("là thời điểm,
//   nên dùng..." = "is the time to use it"; "rất nhiều thời điểm," = "often-
//   times"; "mỗi lần ... thời điểm," = "every time..."), not the postposed
//   marker — these clauses are recognized by their own leading word and
//   skipped outright rather than guessed at.
const THOI_DIEM_BOUNDARY_CHARS = new Set([...`,.!?;:…\n"'“”‘’»`]);
const THOI_DIEM_HARD_START_CHARS = new Set([...`.!?…\n"“‘»`]);
const THOI_DIEM_SKIP_CLAUSES = new Set([
  "là", "chính là", "cũng là", "vẫn là", "rất nhiều", "nhiều", "mỗi",
  "mỗi một", "bất luận cái gì", "không ít",
]);
const THOI_DIEM_SKIP_PREFIXES = [
  "là ", "chính là ", "cũng là ", "vẫn là ", "mỗi lần", "mỗi ngày",
  "mỗi khi", "mỗi một", "rất nhiều", "nhiều lúc", "không ít", "bất luận",
  "bất cứ", "phàm là",
];

function findThoiDiemBoundaryIdx(text, pos) {
  let i = pos - 1;
  while (i >= 0) {
    const ch = text[i];
    if (THOI_DIEM_BOUNDARY_CHARS.has(ch)) {
      if (ch === "," && i > 0 && /[0-9]/.test(text[i - 1])) {
        i -= 1;
        continue;
      }
      return i;
    }
    i -= 1;
  }
  return -1;
}

export function reorderThoiDiemClauses(text) {
  if (!text) return text;
  const THOI_DIEM_RE = /thời điểm,/giu;
  let out = "";
  let lastEnd = 0;
  let match;
  while ((match = THOI_DIEM_RE.exec(text)) !== null) {
    const start = match.index;
    if (start < lastEnd) continue;

    const boundaryIdx = findThoiDiemBoundaryIdx(text, start);
    const clauseRaw = text.slice(boundaryIdx + 1, start);
    let clause = clauseRaw.trim();
    if (!clause || clause.length > 120) continue;

    const oMatch = clause.match(/^[Ởở]\s+([\s\S]*)$/);
    if (oMatch) {
      clause = oMatch[1];
      if (!clause) continue;
    }
    const lowerClause = clause.toLowerCase();
    if (THOI_DIEM_SKIP_CLAUSES.has(lowerClause)) continue;
    if (THOI_DIEM_SKIP_PREFIXES.some((p) => lowerClause.startsWith(p))) continue;

    const boundaryChar = boundaryIdx >= 0 ? text[boundaryIdx] : null;
    const hardStart = boundaryIdx < 0 || THOI_DIEM_HARD_START_CHARS.has(boundaryChar);
    const lucWord = hardStart ? "Lúc" : "lúc";

    out += text.slice(lastEnd, boundaryIdx + 1);
    const leadingWs = clauseRaw.slice(0, clauseRaw.length - clauseRaw.trimStart().length);
    out += leadingWs;
    out += `${lucWord} ${clause},`;
    lastEnd = THOI_DIEM_RE.lastIndex;
  }
  out += text.slice(lastEnd);
  return out;
}

// --- Dictionary-derived literal-reading corrections ---
// Same underlying idea as normalizeCoDiem/normalizeKhongCam above (a naive
// char-by-char Hán-Việt reading of a Chinese word/idiom, left untranslated
// by whatever QT/convert tool produced the source text, reads as nonsense
// or misleads), but generated from this app's own Hán-Việt dictionary
// (hanviet.js/hanvietData.js + the CVDICT/hanviet-pinyin-words data merged
// into it — see src/data/cvdict-extra.json and hanviet-chars-extra.json)
// rather than hand-derived one at a time from a diffed corpus.
//
// **Different provenance from the 4 rules above, deliberately kept smaller
// and more conservative**: each entry here is included only because its
// literal reading is a token sequence with essentially no plausible
// alternate meaning as real Vietnamese (either a 4+ character idiom, whose
// literal per-character reading is syntactic nonsense no one would ever
// write on purpose - "sóng quyệt vân quỷ", "mắt trừng khẩu ngốc" - or a
// short mechanical duplication/trailing-particle artifact - "không có có",
// "cuối cùng tại"). Candidates whose literal reading happens to double as a
// real, independently-valid Vietnamese word or phrase with a *different*
// meaning were deliberately left out even though the dictionary technically
// flagged them as "different from the curated translation" - e.g. 大家's
// literal reading "đại gia" is dropped because that's also the very common
// real word for "wealthy person/tycoon", 不用's "không dùng" is dropped
// because it's valid Vietnamese for "don't use" (a different meaning from
// the intended "don't need"), 十分's "thập phân" is dropped because that's
// the real word for "decimal". Applying this pass to those would risk
// silently corrupting already-correct text - the exact failure mode this
// file's own top-of-file rule ("checked against the full corpus before
// being added") exists to prevent, and unlike the 4 rules above, these were
// screened by hand against plausibility rather than against a real
// diffed corpus (no such corpus was available when this table was built).
// If a future session gets access to real QT-thô/Bản-Edit chapter pairs,
// re-deriving/expanding this table against that corpus (the same way the
// rules above were built) would be higher-confidence than adding more
// dictionary-cross-reference entries by hand.
const WORD_CHAR_RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function escapeRegExp(s) {
  return s.replace(WORD_CHAR_RE_ESCAPE, "\\$&");
}

const DICTIONARY_CORRECTIONS = [
  ["không có có", "không có"],
  ["cuối cùng tại", "cuối cùng"],
  ["dần dần dần dần", "dần dần"],
  ["đang tại", "đang"],
  ["đào hoa không thiểu", "vận đào hoa không ít"],
  ["từ gia phu nhân", "phu nhân nhà mình"],
  ["cái kia một vãn thượng", "đêm hôm đó"],
  ["sóng quyệt vân quỷ", "biến ảo khôn lường"],
  ["một kiến chuông tình", "vừa gặp đã yêu"],
  ["thiên lật địa che", "trời long đất lở"],
  ["vô có thể nại hà", "đành bó tay"],
  ["không do từ chủ", "không tự chủ được"],
  ["tâm hoa phẫn nộ phóng", "mừng như mở cờ trong bụng"],
  ["hoảng nhưng đại ngộ", "chợt bừng tỉnh hiểu ra"],
  ["đại ăn một kinh", "giật mình kinh hãi"],
  ["mắt trừng khẩu ngốc", "trợn mắt há hốc mồm"],
  ["khốc tiếu không được", "dở khóc dở cười"],
  ["diện diện đối với dò xét", "nhìn nhau ngơ ngác"],
  ["không tri chỗ xử chí", "luống cuống không biết làm sao"],
  ["một nói không phát", "không nói một lời"],
  ["tâm không tại yên", "tâm trí để đâu đâu"],
  ["toàn thần quan rót", "dồn hết tâm trí"],
  ["toàn lực dùng phó", "dốc hết toàn lực"],
  ["thiên quân một phát", "nghìn cân treo sợi tóc"],
  ["một khuôn đúc một dạng", "giống hệt nhau"],
  ["vô địa từ dung", "xấu hổ không biết chui vào đâu"],
  ["không hàn mà lật", "rùng mình ớn lạnh"],
  ["tâm kinh nhục nhảy", "giật mình thon thót"],
  ["nhãn tật thủ khoái", "nhanh mắt nhanh tay"],
  ["thủ bề bộn cước loạn", "tay chân rối bời"],
  ["như vô kỳ sự tình", "thản nhiên như không có chuyện gì"],
  ["để ý chỗ làm nhưng", "lẽ dĩ nhiên"],
  ["không ai tên kỳ diệu", "chẳng hiểu vì sao"],
  ["không giả tư tác", "không cần suy nghĩ"],
  ["đột như kỳ lai", "đột nhiên ập đến"],
  ["xử chí thủ không cùng", "trở tay không kịp"],
  ["thâm không có thể trắc", "thâm sâu khó lường"],
  ["xa không có thể cùng", "xa vời khó với tới"],
  ["bách không cùng đợi", "nóng lòng không đợi được"],
  ["tình không từ cấm", "không kìm được lòng mình"],
  ["chịu đựng vô có thể chịu đựng", "nhẫn không nổi nữa"],
  ["vô bên cạnh vô tế", "mênh mông vô tận"],
  ["đỉnh thiên lập địa", "đội trời đạp đất"],
  ["sinh tử du quan", "quan hệ đến sinh tử"],
  ["thế không có thể ngăn cản", "thế không thể cản"],
  ["lực kéo điên cuồng lan", "xoay chuyển cục diện"],
  ["một dạ thiên kim", "một lời hứa đáng nghìn vàng"],
  ["thiên nhưỡng chi đừng", "khác một trời một vực"],
  ["cùng chúng không cùng", "khác hẳn mọi người"],
  ["xuất hồ ý liệu", "ngoài dự đoán"],
  ["một như đã vãng", "vẫn như trước nay"],
  ["vô độc có ngẫu", "không chỉ một mà còn có"],
  ["ân tướng cừu báo", "lấy oán trả ơn"],
  ["cắn răng cắt răng", "nghiến răng nghiến lợi"],
  ["nước mắt chảy đầy diện", "nước mắt đầm đìa"],
  ["phẫn nộ hỏa trung thiêu", "lửa giận bốc lên"],
];

// Longest-phrase-first so a shorter entry can never shadow/truncate a
// longer one that starts with the same words.
const SORTED_CORRECTIONS = [...DICTIONARY_CORRECTIONS].sort((a, b) => b[0].length - a[0].length);
const CORRECTION_MAP = new Map(SORTED_CORRECTIONS.map(([literal, fix]) => [literal, fix]));
const DICTIONARY_CORRECTION_RE = new RegExp(
  `(?<![${WORD_CHAR}])(${SORTED_CORRECTIONS.map(([literal]) => escapeRegExp(literal)).join("|")})(?![${WORD_CHAR}])`,
  "giu"
);

function capitalizeLike(sample, replacement) {
  if (!replacement) return replacement;
  return /^\p{Lu}/u.test(sample) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

export function applyDictionaryCorrections(text) {
  if (!text) return text;
  return text.replace(DICTIONARY_CORRECTION_RE, (match) => {
    const fix = CORRECTION_MAP.get(match.toLowerCase());
    return fix === undefined ? match : capitalizeLike(match, fix);
  });
}

/**
 * Rule-based smoothing pipeline: QT thô (rough, already-Vietnamese) -> a
 * cleaner draft, no AI involved. More passes get added here as more
 * patterns are confirmed against real chapter data.
 * @param {string} qtRawText
 * @returns {string}
 */
export function applyRuleEdit(qtRawText) {
  if (!qtRawText) return qtRawText;
  let text = qtRawText;
  text = stripFillerParticles(text);
  text = normalizeCoDiem(text);
  text = normalizeKhongCam(text);
  text = reorderThoiDiemClauses(text);
  text = applyDictionaryCorrections(text);
  return text;
}
