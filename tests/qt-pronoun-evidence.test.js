import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignParagraphs, extractQtEvidence, QT_SELF_MARKERS, QT_SECOND_PERSON_MARKERS } from '../src/lib/qtPronounEvidence.js';

test('alignParagraphs pairs paragraphs 1:1 by non-empty-line count and reports each edited offset', () => {
  const qtRaw = '纪溪笑道。\n\n你走错房间了。';
  const edited = '  Kỷ Khê mỉm cười.\n\nEm đi nhầm phòng rồi.';
  const pairs = alignParagraphs(qtRaw, edited);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].qtText, '纪溪笑道。');
  assert.equal(pairs[0].editedText, 'Kỷ Khê mỉm cười.');
  assert.equal(edited.slice(pairs[0].editedOffset, pairs[0].editedOffset + pairs[0].editedText.length), 'Kỷ Khê mỉm cười.');
  assert.equal(pairs[1].editedText, 'Em đi nhầm phòng rồi.');
  assert.equal(edited.slice(pairs[1].editedOffset, pairs[1].editedOffset + pairs[1].editedText.length), 'Em đi nhầm phòng rồi.');
});

test('a mismatched paragraph count abstains completely instead of guessing an alignment', () => {
  const qtRaw = '第一段。\n\n第二段。\n\n第三段。';
  const edited = 'Đoạn một.\n\nĐoạn hai.';
  assert.deepEqual(alignParagraphs(qtRaw, edited), []);
});

test('empty input abstains rather than returning a spurious single pairing', () => {
  assert.deepEqual(alignParagraphs('', ''), []);
});

test('extractQtEvidence finds a speech-tag speaker even with a compound verb', () => {
  // Regression case for the extraction regex: a greedy name-capture would
  // backtrack onto the bare "道" and swallow "笑" into the speaker's name.
  const evidence = extractQtEvidence('纪溪笑道：“你走错房间了。”');
  assert.equal(evidence.speaker, '纪溪');
});

test('extractQtEvidence finds each speech-tag verb form', () => {
  assert.equal(extractQtEvidence('程诺道：“好。”').speaker, '程诺');
  assert.equal(extractQtEvidence('纪溪说：“好。”').speaker, '纪溪');
  assert.equal(extractQtEvidence('纪溪问：“好？”').speaker, '纪溪');
  assert.equal(extractQtEvidence('程诺答：“好。”').speaker, '程诺');
  assert.equal(extractQtEvidence('纪溪冷声道：“够了。”').speaker, '纪溪');
});

test('every self-marker group has at least one detected case', () => {
  // Imperial register markers.
  assert.deepEqual(extractQtEvidence('朕今日心情不错。').selfMarkers, ['朕']);
  assert.equal(extractQtEvidence('朕今日心情不错。').register, 'imperial');
  assert.deepEqual(extractQtEvidence('本宫乏了。').selfMarkers, ['本宫']);
  assert.equal(extractQtEvidence('臣妾遵旨。').register, 'imperial');
  assert.equal(extractQtEvidence('微臣告退。').register, 'imperial');
  // Humble register markers.
  assert.deepEqual(extractQtEvidence('属下这就去办。').selfMarkers, ['属下']);
  assert.equal(extractQtEvidence('属下这就去办。').register, 'humble');
  assert.equal(extractQtEvidence('奴婢遵命。').register, 'humble');
  assert.equal(extractQtEvidence('在下告辞。').register, 'humble');
  // Neutral-register self markers.
  assert.deepEqual(extractQtEvidence('我不知道。').selfMarkers, ['我']);
  assert.equal(extractQtEvidence('我不知道。').register, 'neutral');
  assert.deepEqual(extractQtEvidence('吾已知晓。').selfMarkers, ['吾']);
  assert.deepEqual(extractQtEvidence('孤意已决。').selfMarkers, ['孤']);
  assert.deepEqual(extractQtEvidence('寡人不悦。').selfMarkers, ['寡人']);
  assert.deepEqual(extractQtEvidence('老夫年事已高。').selfMarkers, ['老夫']);
  assert.deepEqual(extractQtEvidence('老身还能动。').selfMarkers, ['老身']);
  assert.deepEqual(extractQtEvidence('末将领命。').selfMarkers, ['末将']);
  assert.deepEqual(extractQtEvidence('本座不在意。').selfMarkers, ['本座']);
  assert.deepEqual(extractQtEvidence('本王自有主张。').selfMarkers, ['本王']);
  assert.deepEqual(extractQtEvidence('本官秉公办理。').selfMarkers, ['本官']);
  assert.deepEqual(extractQtEvidence('妾身告退。').selfMarkers, ['妾身']);
  assert.deepEqual(extractQtEvidence('奴才领旨。').selfMarkers, ['奴才']);
});

test('every second-person marker is detected', () => {
  QT_SECOND_PERSON_MARKERS.forEach((marker) => {
    const evidence = extractQtEvidence(`${marker}是谁？`);
    assert.ok(evidence.secondPerson.includes(marker), `expected "${marker}" to be detected`);
  });
});

test('a paragraph with no markers returns empty arrays, not a guess', () => {
  const evidence = extractQtEvidence('窗外下起了雨。');
  assert.deepEqual(evidence.selfMarkers, []);
  assert.deepEqual(evidence.secondPerson, []);
  assert.equal(evidence.speaker, null);
  assert.equal(evidence.register, 'neutral');
});

test('all self markers are covered by QT_SELF_MARKERS (sanity check on the fixture list above)', () => {
  assert.equal(QT_SELF_MARKERS.length, 19);
});
