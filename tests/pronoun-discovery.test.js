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
