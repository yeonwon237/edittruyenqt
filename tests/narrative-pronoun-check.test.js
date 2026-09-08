import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityCheck } from '../src/lib/qualityCheck.js';

const rules = [
  { character: 'Kỷ Khê', pronoun: 'cô' },
  { character: 'Trịnh Nặc', pronoun: 'nàng' },
];

function narrativeIssues(text) {
  return runQualityCheck(text, { narrativeRules: rules }).filter((i) => i.type === 'narrative');
}

test('correct possessive-anchor usage produces no issue', () => {
  const text = 'Kỷ Khê ngồi im lặng, ánh mắt cô nhìn xa xăm.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('swapped possessive-anchor pronoun is caught with the right replacement', () => {
  const text = 'Kỷ Khê ngồi im lặng, ánh mắt nàng nhìn xa xăm.';
  const issues = narrativeIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'nàng');
  assert.equal(issues[0].replacement, 'cô');
  assert.equal(issues[0].confidence, 'cao');
  assert.equal(text.slice(issues[0].start, issues[0].end), 'nàng');
});

test('correct comma-resumptive usage produces no issue', () => {
  const text = 'Trịnh Nặc quay lưng bước đi, nàng không muốn nhìn thêm nữa.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('swapped comma-resumptive pronoun is caught', () => {
  const text = 'Trịnh Nặc quay lưng bước đi, cô không muốn nhìn thêm nữa.';
  const issues = narrativeIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'cô');
  assert.equal(issues[0].replacement, 'nàng');
});

test('swapped sentence-initial resumptive pronoun is caught across a full stop', () => {
  const text = 'Kỷ Khê mỉm cười nhẹ. Nàng bước đến gần cửa sổ.';
  const issues = narrativeIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Nàng');
  assert.equal(issues[0].replacement, 'cô');
});

test('correct sentence-initial resumptive usage produces no issue', () => {
  const text = 'Kỷ Khê mỉm cười nhẹ. Cô bước đến gần cửa sổ.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('a sentence naming both characters is ambiguous and abstains rather than guessing', () => {
  const text = 'Kỷ Khê nhìn Trịnh Nặc, cô khẽ mỉm cười.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('dialogue pronouns inside quotes are never touched by the narrative scanner', () => {
  const text = 'Kỷ Khê nói: “Cô sẽ không tha thứ cho ngươi đâu.”';
  assert.deepEqual(narrativeIssues(text), []);
});

test('a pronoun with no anchor at all (loose narration) abstains', () => {
  const text = 'Gió thổi nhẹ. Cô đứng đó rất lâu, không nói gì.';
  // No registered name anywhere nearby to anchor "Cô" to — must abstain.
  assert.deepEqual(narrativeIssues(text), []);
});

test('needs at least two characters with distinct pronouns to check anything', () => {
  const text = 'Kỷ Khê ngồi im lặng, ánh mắt nàng nhìn xa xăm.';
  assert.deepEqual(runQualityCheck(text, { narrativeRules: [{ character: 'Kỷ Khê', pronoun: 'cô' }] }).filter((i) => i.type === 'narrative'), []);
});

test('a second registered name earlier in the sentence still gets flagged, but only at low confidence', () => {
  // The anchor here binds to the NEAREST name (Kỷ Khê), skipping the earlier
  // unrelated one (Trịnh Nặc) — real-chapter testing found this guesses
  // wrong often enough (a transitive verb's object can introduce the
  // anchor's real possessor from elsewhere in the clause) that it must never
  // be reported as certain. Flagged anyway per the user's request to see
  // more, but tagged "thấp" so it reads as "worth a glance", not "trust me".
  const text = 'Trịnh Nặc chạy tới cửa, Kỷ Khê mỉm cười, ánh mắt nàng dịu dàng.';
  const issues = narrativeIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'nàng');
  assert.equal(issues[0].replacement, 'cô');
  assert.equal(issues[0].confidence, 'thấp');
});

test('a nearest name that is the object of a preceding verb still abstains', () => {
  // "Trịnh Nặc" is nearest to the anchor but is the object of "nhìn" — not
  // enough evidence to bind "cô" to her, so this must not guess either way.
  const text = 'Kỷ Khê nhìn Trịnh Nặc, ánh mắt cô đầy nghi hoặc.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('sentence-initial resumptive picks the subject when the previous sentence names both characters', () => {
  const text = 'Kỷ Khê ôm lấy Trịnh Nặc. Nàng mỉm cười dịu dàng.';
  // "Trịnh Nặc" is the object of "ôm lấy" in the previous sentence, so the
  // continued topic (Centering theory) is the subject, Kỷ Khê.
  const issues = narrativeIssues(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'Nàng');
  assert.equal(issues[0].replacement, 'cô');
  assert.equal(issues[0].confidence, 'trung bình');
});

test('sentence-initial resumptive abstains when both previous-sentence names look equally like subjects', () => {
  const text = 'Kỷ Khê và Trịnh Nặc cùng bước vào. Nàng mỉm cười dịu dàng.';
  assert.deepEqual(narrativeIssues(text), []);
});

test('a registered multi-word pronoun is not shadowed by a shorter registered pronoun that is its prefix', () => {
  // Real bug found against a live story: "Lộc Linh" is registered as "cô
  // nàng" while another character is registered as plain "cô". The regex
  // alternation used to try "cô" first and match it inside the correctly
  // written "cô nàng", flagging already-correct text as wrong.
  const withCompoundPronoun = [
    { character: 'Kỷ Khê', pronoun: 'cô' },
    { character: 'Lộc Linh', pronoun: 'cô nàng' },
  ];
  const text = 'Lộc Linh cười, cô nàng thấy vui.';
  assert.deepEqual(runQualityCheck(text, { narrativeRules: withCompoundPronoun }).filter((i) => i.type === 'narrative'), []);
});

test('an unrelated compound word starting with a registered pronoun syllable is not flagged', () => {
  // Real bug found against a live story: "cô bé" (an affectionate way to say
  // "the girl", unrelated to any registered pronoun) was misread as the bare
  // pronoun "cô" and — at "cao" confidence — proposed rewriting it into the
  // nonsense "cô nàng bé".
  const withCompoundPronoun = [
    { character: 'Kỷ Khê', pronoun: 'cô' },
    { character: 'Lộc Linh', pronoun: 'cô nàng' },
  ];
  const text = 'Lộc Linh cười, cô bé thấy vui.';
  assert.deepEqual(runQualityCheck(text, { narrativeRules: withCompoundPronoun }).filter((i) => i.type === 'narrative'), []);
});

test('two characters sharing the same pronoun elsewhere in the story does not block detection for either', () => {
  // Real-world case that broke v1: many female characters legitimately share
  // "cô"/"nàng" as their narrative pronoun. The anchor still resolves a
  // single governor per occurrence, so a global word collision must not
  // suppress checking — only an ambiguous LOCAL anchor should.
  const shared = [
    { character: 'Kỷ Khê', pronoun: 'cô' },
    { character: 'Thịnh Thanh Sơn', pronoun: 'cô' },
    { character: 'Trịnh Nặc', pronoun: 'nàng' },
    { character: 'Thịnh Vân Thư', pronoun: 'nàng' },
  ];
  assert.deepEqual(runQualityCheck('Kỷ Khê ngồi im lặng, ánh mắt cô nhìn xa xăm.', { narrativeRules: shared }).filter((i) => i.type === 'narrative'), []);
  const issues = runQualityCheck('Kỷ Khê ngồi im lặng, ánh mắt nàng nhìn xa xăm.', { narrativeRules: shared }).filter((i) => i.type === 'narrative');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].value, 'nàng');
  assert.equal(issues[0].replacement, 'cô');
});
