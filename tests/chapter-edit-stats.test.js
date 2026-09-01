import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterLengthWarning, countVietnameseWords, summarizeChapterWordCounts } from '../src/lib/chapterEditStats.js';

test('word counts ignore surrounding and repeated whitespace', () => {
  assert.equal(countVietnameseWords('  Một   câu\n mới.  '), 3);
  assert.equal(countVietnameseWords(''), 0);
});

test('average uses only non-empty edited chapters', () => {
  assert.deepEqual(summarizeChapterWordCounts({ a: 1000, b: 1200, empty: 0 }), { sampleSize: 2, average: 1100 });
});

test('length warnings require a useful sample and flag large deviations', () => {
  assert.equal(chapterLengthWarning(300, 1000, 4), null);
  assert.equal(chapterLengthWarning(599, 1000, 5)?.type, 'short');
  assert.equal(chapterLengthWarning(1601, 1000, 5)?.type, 'long');
  assert.equal(chapterLengthWarning(1000, 1000, 20), null);
});
