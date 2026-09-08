import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignParagraphs, extractQtEvidence,
  QT_SELF_MARKERS_HAN, QT_SELF_MARKERS_VI,
  QT_SECOND_PERSON_MARKERS_HAN, QT_SECOND_PERSON_MARKERS_VI,
} from '../src/lib/qtPronounEvidence.js';

test('alignParagraphs pairs paragraphs 1:1 by non-empty-line count and reports each edited offset', () => {
  const qtRaw = '纪溪笑道。\n\nNgươi đi lầm phòng rồi.';
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

test('a real untranslated qt_raw paragraph (literal Chinese) is still readable', () => {
  // Real qt_raw data checked against a live project: this app's own "Tự
  // dịch" Hán-Việt pass leaves a real share of paragraphs as literal
  // Chinese — the module must still find evidence there, not just in the
  // glossed Vietnamese form.
  const evidence = extractQtEvidence('程诺轻轻碰了下她的胳膊，小声道：“我很难受。”');
  assert.deepEqual(evidence.selfMarkers, ['我']);
});

test('a real translated (Vietnamese-glossed) qt_raw paragraph is readable', () => {
  // Real sample from a live project's qt_raw: this app's dictionary pass
  // glosses 你/我/姐姐 into natural Vietnamese, not literal Chinese — the
  // original plan's marker list (literal 你/我/...) would never match this.
  const evidence = extractQtEvidence('"Cách nào alpha không thể giúp ngươi xử lý? Cách ta xa một chút."');
  assert.deepEqual(evidence.selfMarkers, ['ta']);
  assert.deepEqual(evidence.secondPerson, ['ngươi']);
});

test('extractQtEvidence finds the bare "Name:" speech tag — the dominant real pattern', () => {
  // Real sample: "Kỷ suối: "..."" — this book's qt_raw almost never tags a
  // verb at all, matching the same style already known from `edited`.
  const evidence = extractQtEvidence('Kỷ suối: "Dấu hiệu thanh trừ đều làm."');
  assert.equal(evidence.speaker, 'Kỷ suối');
});

test('extractQtEvidence finds a Vietnamese-glossed speech verb', () => {
  assert.equal(extractQtEvidence('Trình Nặc nói: "Được."').speaker, 'Trình Nặc');
  assert.equal(extractQtEvidence('Kỷ Khê hỏi: "Sao?"').speaker, 'Kỷ Khê');
  assert.equal(extractQtEvidence('Trình Nặc đáp: "Vâng."').speaker, 'Trình Nặc');
  assert.equal(extractQtEvidence('Kỷ Khê cười nói: "Tốt lắm."').speaker, 'Kỷ Khê');
});

test('extractQtEvidence finds a speech-tag speaker even with a compound Chinese verb', () => {
  // Regression case for the extraction regex: a greedy name-capture would
  // backtrack onto the bare "道" and swallow "笑" into the speaker's name.
  const evidence = extractQtEvidence('纪溪笑道：“你走错房间了。”');
  assert.equal(evidence.speaker, '纪溪');
});

test('every Chinese self-marker group has at least one detected case', () => {
  assert.deepEqual(extractQtEvidence('朕今日心情不错。').selfMarkers, ['朕']);
  assert.equal(extractQtEvidence('朕今日心情不错。').register, 'imperial');
  assert.equal(extractQtEvidence('属下这就去办。').register, 'humble');
  QT_SELF_MARKERS_HAN.forEach((marker) => {
    assert.ok(extractQtEvidence(`${marker}不知道。`).selfMarkers.includes(marker), `expected "${marker}" to be detected`);
  });
});

test('every Chinese second-person marker is detected', () => {
  QT_SECOND_PERSON_MARKERS_HAN.forEach((marker) => {
    assert.ok(extractQtEvidence(`${marker}是谁？`).secondPerson.includes(marker), `expected "${marker}" to be detected`);
  });
});

test('every Vietnamese-gloss self-marker is detected as a whole word', () => {
  QT_SELF_MARKERS_VI.forEach((marker) => {
    const evidence = extractQtEvidence(`${marker} không biết.`);
    assert.ok(evidence.selfMarkers.includes(marker), `expected "${marker}" to be detected`);
  });
  assert.equal(extractQtEvidence('trẫm đã quyết định.').register, 'imperial');
  assert.equal(extractQtEvidence('thuộc hạ xin tuân lệnh.').register, 'humble');
});

test('every Vietnamese-gloss second-person marker is detected as a whole word', () => {
  QT_SECOND_PERSON_MARKERS_VI.forEach((marker) => {
    const evidence = extractQtEvidence(`${marker} là ai?`);
    assert.ok(evidence.secondPerson.includes(marker), `expected "${marker}" to be detected`);
  });
});

test('a Vietnamese-gloss marker only matches as a whole word, not inside another word', () => {
  // "ta" must not fire inside an unrelated longer word.
  assert.deepEqual(extractQtEvidence('Con tako bơi trong nước.').selfMarkers, []);
});

test('"người" and "cô" are deliberately excluded — each is also the dictionary fallback for an unrelated common character (人, and several others)', () => {
  const evidence = extractQtEvidence('Có người ở ngoài cửa, cô ấy bước vào.');
  assert.deepEqual(evidence.secondPerson, []);
  assert.deepEqual(evidence.selfMarkers, []);
});

test('a paragraph with no markers returns empty arrays, not a guess', () => {
  const evidence = extractQtEvidence('窗外下起了雨。');
  assert.deepEqual(evidence.selfMarkers, []);
  assert.deepEqual(evidence.secondPerson, []);
  assert.equal(evidence.speaker, null);
  assert.equal(evidence.register, 'neutral');
});
