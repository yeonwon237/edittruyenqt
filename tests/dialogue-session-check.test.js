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
