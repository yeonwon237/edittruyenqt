import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPronounRules } from '../src/lib/pronounDiscovery.js';

function makeChapters(count) {
  const chapters = [];
  for (let i = 1; i <= count; i++) {
    chapters.push({
      id: `c${i}`,
      title: `Chương ${i}`,
      chapter_order: i,
      edited: [
        'Kỳ Khê nói với Trình Nặc: "Tôi hiểu rồi. Em đừng lo."',
        'Nàng im lặng một lúc lâu rồi mới quay sang phía đối phương, chậm rãi cất tiếng.',
        'Trình Nặc đáp: "Em biết rồi. Chị đừng lo lắng nữa."',
      ].join('\n'),
    });
  }
  return chapters;
}

test('discovers speaker/listener names and self/target words with no rules given', () => {
  const report = discoverPronounRules(makeChapters(4));
  assert.equal(report.chapterCount, 4);
  assert.ok(report.candidateNames.includes('Kỳ Khê'));
  assert.ok(report.candidateNames.includes('Trình Nặc'));

  const kyToTrinh = report.rules.find((r) => r.speaker === 'Kỳ Khê' && r.listener === 'Trình Nặc');
  assert.ok(kyToTrinh, 'expected a Kỳ Khê -> Trình Nặc rule');
  assert.equal(kyToTrinh.self_word, 'tôi');
  assert.equal(kyToTrinh.target_word, 'em');
  assert.equal(kyToTrinh.selfConfidence, 1);
  assert.equal(kyToTrinh.targetConfidence, 1);

  const trinhToKy = report.rules.find((r) => r.speaker === 'Trình Nặc' && r.listener === 'Kỳ Khê');
  assert.ok(trinhToKy, 'expected a Trình Nặc -> Kỳ Khê rule');
  assert.equal(trinhToKy.self_word, 'em');
  assert.equal(trinhToKy.target_word, 'chị');
});

test('drops a pair below the minimum sample size', () => {
  const report = discoverPronounRules(makeChapters(1));
  assert.equal(report.rules.length, 0);
});

test('merges in knownNames even if the mined text alone would not surface them', () => {
  const report = discoverPronounRules(makeChapters(4), { knownNames: ['Diệp Khinh Thần'] });
  assert.ok(report.candidateNames.includes('Diệp Khinh Thần'));
});

test('uses the previous directly tagged speaker as listener in a crowded scene', () => {
  const chapters = Array.from({ length: 3 }, (_, index) => ({
    id: `crowded-${index}`,
    title: `Cảnh đông người ${index + 1}`,
    chapter_order: index + 1,
    edited: [
      'Thịnh Thanh Sơn cười nói: “Tôi đã biết rồi, cậu đừng giấu nữa.”',
      'Thượng Quan Văn Trúc đứng cạnh cửa, Trình Nặc cũng có mặt trong phòng.',
      'Kỷ Khê đáp: “Tôi chỉ muốn tạo bất ngờ thôi, tôi vẫn luôn giấu không nói cho cậu.”',
    ].join('\n'),
  }));
  const report = discoverPronounRules(chapters, {
    knownNames: ['Thịnh Thanh Sơn', 'Thượng Quan Văn Trúc', 'Trình Nặc', 'Kỷ Khê'],
  });
  const rule = report.rules.find((item) => item.speaker === 'Kỷ Khê' && item.listener === 'Thịnh Thanh Sơn');
  assert.ok(rule);
  assert.equal(rule.self_word, 'tôi');
  assert.equal(rule.target_word, 'cậu');
  assert.ok(report.resolvedPairCount > 0);
});

test('does not invent a listener from the tail of a full Glossary name', () => {
  const chapters = Array.from({ length: 3 }, (_, index) => ({
    id: `partial-${index}`,
    title: `Chương ${index + 1}`,
    chapter_order: index + 1,
    edited: 'Thịnh Thanh Sơn nói: “Chị đã hiểu rồi.”',
  }));
  const report = discoverPronounRules(chapters, {
    knownNames: ['Thịnh Thanh Sơn', 'Thịnh Vân Thư'],
  });
  assert.ok(!report.candidateNames.includes('Thanh Sơn'));
  assert.ok(!report.rules.some((rule) => rule.speaker === 'Thịnh Thanh Sơn' && rule.listener === 'Thanh Sơn'));
});

test('folds accents when rejecting a likely truncated translation variant', () => {
  const chapters = Array.from({ length: 3 }, (_, index) => ({
    id: `variant-${index}`,
    title: `Chương ${index + 1}`,
    chapter_order: index + 1,
    edited: 'Văn Thư nói: “Chị biết rồi.”',
  }));
  const report = discoverPronounRules(chapters, { knownNames: ['Thịnh Vân Thư'] });
  assert.ok(!report.candidateNames.includes('Văn Thư'));
});

test('learns narrator pronouns outside dialogue without reading address words inside quotes', () => {
  const chapters = Array.from({ length: 3 }, (_, index) => ({
    id: `narrative-${index}`,
    title: `Chương ${index + 1}`,
    chapter_order: index + 1,
    edited: [
      'Thịnh Vân Thư khép cửa lại, cô chậm rãi bước về phía cửa sổ.',
      'Thịnh Vân Thư nói: “Chị đừng lo cho em.”',
    ].join('\n'),
  }));
  const report = discoverPronounRules(chapters, { knownNames: ['Thịnh Vân Thư'] });
  const narrative = report.narrativeRules.find((rule) => rule.character === 'Thịnh Vân Thư');
  assert.ok(narrative);
  assert.equal(narrative.pronoun, 'cô');
  assert.equal(narrative.confidence, 1);
});

test('deep scan keeps one-sample candidates for manual review', () => {
  const chapter = [{
    id: 'deep-1', title: 'Một chương', chapter_order: 1,
    edited: 'Kỷ Khê nói với Trình Nặc: “Tôi hiểu rồi.”',
  }];
  const knownNames = ['Kỷ Khê', 'Trình Nặc'];
  assert.equal(discoverPronounRules(chapter, { knownNames }).rules.length, 0);
  assert.equal(discoverPronounRules(chapter, { knownNames, deep: true }).rules.length, 1);
});
