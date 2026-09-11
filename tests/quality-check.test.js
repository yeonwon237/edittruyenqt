import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityCheck } from '../src/lib/qualityCheck.js';
const rule = { speaker: 'Thu Sương', listener: 'A Trì', self_word: 'ta', target_word: 'đại nhân' };
test('the Vietnamese word "run" (tremble) is not flagged as English', () => {
  // Real false positive: "run" is a plain Vietnamese word ("run rẩy", "run
  // lên", "run sợ") that also happens to spell an English word, and kept
  // getting flagged every time it appeared.
  const text = 'Liếc thấy những ngón tay đang run rẩy nhè nhẹ của đối phương, Trịnh Nặc khẽ thở dài.';
  assert.deepEqual(runQualityCheck(text).filter((i) => i.type === 'english'), []);
});
test('does not confuse different names sharing a title', () => {
  assert.deepEqual(runQualityCheck('Ôn Đại Nhân nói chuyện với Hà Quý phi.', { glossaryTerms: [{ category: 'Tên người', source_term: '陶大人', translation: 'Tô đại nhân' }] }), []);
});
test('nearby characters do not establish dialogue participants', () => {
  const text = 'A Trì nhìn giỏ đồ Thu Sương mang đến, không khỏi bật cười: “Thu Sương luôn là người của ta mà! Nương nương ngay cả nàng cũng tra xét sao?”\nCuối cùng, Đỗ Chiêu Ly mới gật đầu, nói: “Ta tin tưởng ngươi.”';
  assert.deepEqual(runQualityCheck(text, { pronounRules: [rule] }), []);
});
test('a lone configured listener is not treated as evidence that they are in the scene', () => {
  const issues = runQualityCheck('Thu Sương nói: “Tôi hiểu rồi.”', { pronounRules: [rule] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].replacement, '');
  assert.equal(issues[0].confidence, 'thấp');
  assert.match(issues[0].detail, /chưa xác định được người nghe/);
});
test('correct self reference after possessive cue is preserved', () => {
  assert.deepEqual(runQualityCheck('Thu Sương nói với A Trì: “Đó là người của ta.”', { pronounRules: [rule] }), []);
});
test('a self_word repeated for emphasis (self-address in the third person, a common real dialogue pattern) is not mistaken for addressing the listener', () => {
  // "Chị, chị đỉnh vãi chưởng!" ("Sis, sis you're awesome!" said BY someone
  // ELSE addressing Kỷ Khê) and "Em, em suýt chút nữa bị xe tông chết rồi"
  // (a character invoking her OWN self_word for emphasis) are the same
  // clause-initial-plus-comma shape as a genuine vocative. A "swap" detector
  // keyed on that shape was tried and checked against the full 178-chapter
  // real story: the large majority of its real matches were this emphasis
  // pattern, not an actual self/target mix-up — reverted rather than shipped
  // noisy. A self_word or target_word found anywhere is trusted outright.
  assert.deepEqual(runQualityCheck('Thu Sương nói với A Trì: “Ta, ta không ngờ chuyện lại thành ra thế này.”', { pronounRules: [rule] }), []);
});
test('explicit self mismatch remains actionable with exact offsets', () => {
  const text = 'Thu Sương nói với A Trì: “Tôi hiểu rồi.”';
  const issues = runQualityCheck(text, { pronounRules: [rule] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].replacement, 'ta');
  assert.equal(text.slice(issues[0].start, issues[0].end), 'Tôi');
});
test('a glossary character missing from the pronoun matrix is surfaced for review', () => {
  const text = 'Tiểu Mai nói: “Tôi đã chuẩn bị xong.”';
  const issues = runQualityCheck(text, {
    glossaryTerms: [{ category: 'Tên người', source_term: '小梅', translation: 'Tiểu Mai' }],
    pronounRules: [rule],
  }).filter((issue) => issue.label === 'Thiếu quy tắc xưng hô');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Tôi');
  assert.equal(issues[0].replacement, '');
  assert.equal(issues[0].confidence, 'thấp');
});
test('an unconfigured glossary character action beat blocks a stale two-person session', () => {
  const reverse = { speaker: 'A Trì', listener: 'Thu Sương', self_word: 'tại hạ', target_word: 'cô nương' };
  const text = [
    'Thu Sương nói với A Trì: “Ta hiểu rồi.”',
    '',
    'Thượng Quan Văn Trúc buông tay ra, khóe môi cong lên một độ cong cực nhạt,',
    '',
    '“Vậy có lẽ là tôi nhớ nhầm rồi.”',
  ].join('\n');
  const issues = runQualityCheck(text, {
    pronounRules: [rule, reverse],
    glossaryTerms: [{ category: 'Tên người', source_term: '上官文竹', translation: 'Thượng Quan Văn Trúc' }],
  }).filter((issue) => issue.type === 'pronoun');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'Thiếu quy tắc xưng hô');
  assert.match(issues[0].detail, /Thượng Quan Văn Trúc/);
  assert.match(issues[0].detail, /người nghe có khả năng là Thu Sương/);
  assert.doesNotMatch(issues[0].detail, /Thu Sương nên|A Trì nên/);
});
test('an unregistered action-beat speaker is discovered even before being added to Glossary', () => {
  const text = [
    'Trình Nặc nở nụ cười đúng mực, “Chào chị Thượng Quan.”',
    '',
    'Thượng Quan Văn Trúc buông tay ra, khóe môi cong lên một độ cong cực nhạt,',
    '',
    '“Vậy có lẽ là tôi nhớ nhầm rồi.”',
  ].join('\n');
  const issues = runQualityCheck(text, {
    pronounRules: [{ speaker: 'Trình Nặc', listener: 'Kỷ Khê', self_word: 'em', target_word: 'chị' }],
    glossaryTerms: [{ category: 'Tên người', source_term: '程诺', translation: 'Trình Nặc' }],
  }).filter((issue) => issue.type === 'pronoun' && issue.value.toLowerCase() === 'tôi');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'Thiếu quy tắc xưng hô');
  assert.match(issues[0].detail, /người nói là Thượng Quan Văn Trúc/);
  assert.match(issues[0].detail, /người nghe có khả năng là Trình Nặc/);
  assert.doesNotMatch(issues[0].detail, /Kỷ Khê nên/);
});
test('the immediately previous speaker overrides a known speaker default listener', () => {
  const text = [
    'Tô Thịnh châm chọc: “Tiền cũng không thèm kiếm nữa rồi à?”',
    '',
    'Trình Nặc nhếch môi cười khẽ, “Ừ, lỗ bao nhiêu cứ ghi vào tài khoản của tôi, tôi đi tìm chị ấy đòi.”',
  ].join('\n');
  const issues = runQualityCheck(text, {
    pronounRules: [{ speaker: 'Trình Nặc', listener: 'Kỷ Khê', self_word: 'em', target_word: 'chị' }],
    glossaryTerms: [{ category: 'Tên người', source_term: '苏盛', translation: 'Tô Thịnh' }],
  }).filter((issue) => issue.type === 'pronoun' && issue.value.toLowerCase() === 'tôi');
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.replacement === ''));
  assert.ok(issues.every((issue) => /người nói là Trình Nặc, người nghe là Tô Thịnh/.test(issue.detail)));
  assert.ok(issues.every((issue) => !/Kỷ Khê/.test(issue.detail)));
});

test('an action-beat subject wins when they place the other character down', () => {
  const text = [
    'Kỷ Khê nói với Trình Nặc: “Chị sẽ bế em.”',
    '',
    'Kỷ Khê lập tức dừng lại, cẩn thận từng li từng tí đặt Trình Nặc xuống đất, lại còn nịnh nọt chỉnh lại vạt áo khoác cho nàng, nhưng cái miệng vẫn không chịu thua:',
    '',
    '“Quá đáng lắm nhé, em mà còn áp bức tôi như thế nữa là tôi sẽ vùng lên khởi nghĩa đấy!”',
  ].join('\n');
  const issues = runQualityCheck(text, {
    pronounRules: [
      { speaker: 'Kỷ Khê', listener: 'Trình Nặc', self_word: 'chị', target_word: 'em' },
      { speaker: 'Trình Nặc', listener: 'Kỷ Khê', self_word: 'em', target_word: 'chị' },
    ],
    glossaryTerms: [
      { category: 'Tên người', translation: 'Kỷ Khê' },
      { category: 'Tên người', translation: 'Trình Nặc' },
    ],
  }).filter((issue) => issue.value === 'tôi');
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.replacement === 'chị'));
  assert.ok(issues.every((issue) => /Kỷ Khê nên tự xưng là "chị" khi nói với Trình Nặc/.test(issue.detail)));
});

test('a unique target address word overrides a stale listener session', () => {
  const text = [
    'Trình Nặc nói với Kỷ Khê: “Em biết rồi.”',
    '',
    '“Bất ngờ không?” Kỷ Khê ấn Thịnh Thanh Sơn đang định ngồi dậy xuống, sau khi chào hỏi Thượng Quan Văn Trúc xong liền cười nói: “Chị Thượng Quan tuần trước đã về rồi, tôi vẫn luôn giấu không nói cho cậu. Thế nào, nhìn thấy chị ấy có thấy thân thiết không?”',
  ].join('\n');
  const issues = runQualityCheck(text, {
    pronounRules: [
      { speaker: 'Kỷ Khê', listener: 'Trình Nặc', self_word: 'chị', target_word: 'em' },
      { speaker: 'Kỷ Khê', listener: 'Thịnh Thanh Sơn', self_word: 'tôi', target_word: 'cậu' },
      { speaker: 'Trình Nặc', listener: 'Kỷ Khê', self_word: 'em', target_word: 'chị' },
    ],
    glossaryTerms: [
      { category: 'Tên người', translation: 'Kỷ Khê' },
      { category: 'Tên người', translation: 'Trình Nặc' },
      { category: 'Tên người', translation: 'Thịnh Thanh Sơn' },
      { category: 'Tên người', translation: 'Thượng Quan Văn Trúc' },
    ],
  });
  assert.ok(!issues.some((issue) => issue.value === 'cậu'));
  assert.ok(!issues.some((issue) => /Kỷ Khê nên gọi Trình Nặc/.test(issue.detail)));
});
test('QT evidence is attached to a dialogue mismatch without making it auto-fixable', () => {
  const text = 'Thu Sương nói với A Trì: “Tôi hiểu rồi.”';
  const issues = runQualityCheck(text, {
    pronounRules: [rule],
    qtRaw: 'Thu Sương nói: “我明白了。”',
  }).filter((issue) => issue.type === 'pronoun');
  assert.equal(issues.length, 1);
  assert.match(issues[0].detail, /Bằng chứng QT/);
  assert.match(issues[0].detail, /ngôi 1: 我/);
  assert.equal(issues[0].severity, 'review');
});
test('ambiguous contextual glossary does not default to replacement', () => {
  assert.deepEqual(runQualityCheck('Nàng nhìn ta.', { glossaryTerms: [{ source_term: 'ta', translation: 'đại nhân', category: 'Xưng hô' }] }), []);
});
test('exact glossary and untranslated CJK are still detected', () => {
  const issues = runQualityCheck('Lâm Cũ gặp 林新.', { glossaryTerms: [{ source_term: 'Lâm Cũ', translation: 'Lâm Tân', category: 'Tên người' }] });
  assert.ok(issues.some(i => i.value === 'Lâm Cũ' && i.replacement === 'Lâm Tân'));
  assert.ok(issues.some(i => i.type === 'cjk'));
});
test('ancient vocabulary scan works without dialogue attribution and offers no invented replacement', () => {
  const issues = runQualityCheck('Tôi gọi bạn, anh, chị, em, cậu, tớ và mình.', { qaSettings: { era: 'ancient' } });
  assert.equal(issues.length, 8);
  assert.ok(issues.every(i => i.type === 'style' && i.severity === 'review' && i.replacement === ''));
});

test('explicit forbidden words override matrix confirmation and remembered allowance', () => {
  const issues = runQualityCheck('Thu Sương nói với A Trì: “Ta hiểu rồi.”', { pronounRules: [rule], qaSettings: { forbiddenWords: [{find: 'ta', replace: 'thiếp'}], allowedWords: ['ta'] } });
  assert.equal(issues[0]?.replacement, 'thiếp');
  assert.equal(issues[0]?.type, 'style');
});
test('custom replacement wins over built-in era warning', () => {
  const issues = runQualityCheck('Tôi đi.', { qaSettings: { era: 'ancient', forbiddenWords: [{find: 'tôi', replace: 'ta'}] } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].replacement, 'ta');
});
test('modern setting and explicit era exceptions are respected', () => {
  assert.deepEqual(runQualityCheck('Tôi gọi bạn.', { qaSettings: { era: 'modern' } }), []);
  assert.deepEqual(runQualityCheck('Tôi gọi bạn.', { qaSettings: { era: 'ancient', allowedWords: ['tôi','bạn'] } }), []);
});
