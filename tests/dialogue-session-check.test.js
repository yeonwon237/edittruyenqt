import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityCheck } from '../src/lib/qualityCheck.js';

const rules = [
  { speaker: 'Kỷ Khê', listener: 'Trịnh Nặc', self_word: 'chị', target_word: 'em' },
  { speaker: 'Trịnh Nặc', listener: 'Kỷ Khê', self_word: 'em', target_word: 'chị' },
];

function pronounIssues(text) {
  return runQualityCheck(text, { pronounRules: rules }).filter((i) => i.type === 'pronoun');
}

test('the original bug report: a back-and-forth exchange with only the first line tagged', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc đáp: “Dạ em ăn rồi ạ.”',
    '“Tôi có mua cho em ít trái cây, để trên bàn.”',
    'Trịnh Nặc cười: “Em cảm ơn chị.”',
  ].join('\n');
  const issues = pronounIssues(text);
  // Line 3 has no tag at all and is the planted bug: Kỷ Khê says "Tôi" where
  // the matrix says she should say "chị" when speaking to Trịnh Nặc.
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Tôi');
  assert.equal(issues[0].replacement, 'chị');
  assert.equal(issues[0].confidence, 'thấp');
});

test('a loose tag (name + verb, no "với") continuing the session resolves at medium confidence', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc đáp: “Dạ tôi ăn rồi ạ.”',
  ].join('\n');
  const issues = pronounIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'tôi');
  assert.equal(issues[0].replacement, 'em');
  assert.equal(issues[0].confidence, 'trung bình');
});

test('correct usage across all three tiers produces no issues', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc đáp: “Dạ em ăn rồi ạ.”',
    '“Chị có mua cho em ít trái cây, để trên bàn.”',
    'Trịnh Nặc cười: “Em cảm ơn chị.”',
  ].join('\n');
  assert.deepEqual(pronounIssues(text), []);
});

test('confidence never heals going forward: a chain built on a medium-confidence turn stays capped there', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc đáp: “Dạ em ăn rồi ạ.”', // cao (explicit)
    'Kỷ Khê nói: “Tôi mua cho em ít trái cây.”', // loose tag (no "với") -> trung bình, and the bug
    '“Tôi cảm ơn chị đã mua.”', // bare quote riding the trung-bình session -> must cap at thấp, not upgrade
  ].join('\n');
  const issues = pronounIssues(text);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].value, 'Tôi');
  assert.equal(issues[0].replacement, 'chị');
  assert.equal(issues[0].confidence, 'trung bình');
  assert.equal(issues[1].value, 'Tôi');
  assert.equal(issues[1].replacement, 'em');
  assert.equal(issues[1].confidence, 'thấp');
});

test('the session resets across a paragraph break — a bare quote after a scene gap abstains', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc đáp: “Dạ em ăn rồi ạ.”',
    '',
    '',
    'Nắng chiều rọi qua khung cửa sổ, gió khẽ lay động rèm cửa.',
    '',
    '',
    '“Tôi thấy lạnh quá.”',
  ].join('\n');
  assert.deepEqual(pronounIssues(text), []);
});

test('an action beat (no tag, just narration about the same two people) still resolves the turn at low confidence', () => {
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc ngước khuôn mặt nhỏ lên, cười tít mắt đầy đắc ý, “Tôi ăn rồi ạ.”',
  ].join('\n');
  const issues = pronounIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Tôi');
  assert.equal(issues[0].replacement, 'em');
  assert.equal(issues[0].confidence, 'thấp');
});

test('an action beat that mentions a third registered character still abstains', () => {
  const extraRules = [
    ...rules,
    { speaker: 'Nhạc Bảo', listener: 'Kỷ Khê', self_word: 'cháu', target_word: 'dì' },
  ];
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Trịnh Nặc bế Nhạc Bảo lên, cười, “Tôi ăn rồi ạ.”',
  ].join('\n');
  const issues = runQualityCheck(text, { pronounRules: extraRules }).filter((i) => i.type === 'pronoun');
  assert.deepEqual(issues, []);
});

test('a hub speaker with several registered listeners resolves from scene context when exactly one other registered name was mentioned nearby', () => {
  // Real bug found against a live story: a speaker registered with several
  // different listeners (a "hub" character) could never resolve without an
  // already-active session, even when an action beat clearly named them as
  // speaker — because resolveListenerForSpeaker's own-rules fallback only
  // works for a speaker with exactly ONE listener in the whole matrix. This
  // blocked the vast majority of real turns for exactly the characters with
  // the most dialogue.
  const hubRules = [
    ...rules,
    { speaker: 'Kỷ Khê', listener: 'Thịnh Thanh Sơn', self_word: 'Tôi', target_word: 'Cậu' },
    { speaker: 'Thịnh Thanh Sơn', listener: 'Kỷ Khê', self_word: 'tôi', target_word: 'cậu' },
  ];
  const text = [
    'Trịnh Nặc ngồi thẫn thờ trên ghế, đợi mãi vẫn không thấy Kỷ Khê quay lại.',
    'Kỷ Khê đẩy cửa bước vào, ngồi xuống cạnh nàng, "Tôi xin lỗi vì đã để em đợi lâu."',
  ].join('\n');
  const issues = runQualityCheck(text, { pronounRules: hubRules }).filter((i) => i.type === 'pronoun');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Tôi');
  assert.equal(issues[0].replacement, 'chị');
  assert.equal(issues[0].confidence, 'thấp');
});

test('a hub speaker abstains when the recent scene mentions two other registered names, not one', () => {
  const hubRules = [
    ...rules,
    { speaker: 'Kỷ Khê', listener: 'Thịnh Thanh Sơn', self_word: 'Tôi', target_word: 'Cậu' },
    { speaker: 'Thịnh Thanh Sơn', listener: 'Kỷ Khê', self_word: 'tôi', target_word: 'cậu' },
  ];
  const text = [
    'Trịnh Nặc và Thịnh Thanh Sơn ngồi đợi trong phòng khách, không ai nói với ai câu nào.',
    'Kỷ Khê đẩy cửa bước vào, ngồi xuống, "Tôi xin lỗi vì đã để mọi người đợi lâu."',
  ].join('\n');
  const issues = runQualityCheck(text, { pronounRules: hubRules }).filter((i) => i.type === 'pronoun');
  assert.deepEqual(issues, []);
});

test('"ta" inside "cô ta"/"chúng ta" is not misread as the self-pronoun "ta"', () => {
  // Real bug found against a live story: "cô ta" ("her") and "chúng ta"
  // ("we") both end in the free-standing self-pronoun "ta" as their own
  // space-separated syllable, but neither is a self-reference at all.
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: "Em đã ăn cơm chưa?"',
    'Trịnh Nặc đáp: "Dạ em ăn rồi ạ. Em không thích cô ta, chúng ta nên tránh xa cô ta ra."',
  ].join('\n');
  assert.deepEqual(pronounIssues(text), []);
});

test('a third, unrelated registered speaker breaking in does not inherit the wrong session', () => {
  const extraRules = [
    ...rules,
    { speaker: 'Thịnh Thanh Sơn', listener: 'Kỷ Khê', self_word: 'tôi', target_word: 'cậu' },
  ];
  const text = [
    'Kỷ Khê nói với Trịnh Nặc: “Em đã ăn cơm chưa?”',
    'Thịnh Thanh Sơn xen vào, nói: “Cậu đừng lo cho nó nữa.”',
  ].join('\n');
  const issues = runQualityCheck(text, { pronounRules: extraRules }).filter((i) => i.type === 'pronoun');
  // "Cậu" here should be read as Thịnh Thanh Sơn addressing Kỷ Khê (his own
  // rule), not accidentally inherited from the Kỷ Khê/Trịnh Nặc session —
  // and it's correct per his own rule, so no issue either way.
  assert.deepEqual(issues, []);
});
