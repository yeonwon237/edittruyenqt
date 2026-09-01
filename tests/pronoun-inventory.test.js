import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanPronounInventory } from '../src/lib/pronounInventory.js';
import { runQualityCheck } from '../src/lib/qualityCheck.js';

const rules = [
  { speaker: 'Kỳ Khê', listener: 'Trình Nặc', self_word: 'Tôi', target_word: 'Em' },
  { speaker: 'Trình Nặc', listener: 'Kỳ Khê', self_word: 'Em', target_word: 'Chị' },
];

test('whole-story inventory reports terms outside an existing pair without mutating rules', () => {
  const original = structuredClone(rules);
  const report = scanPronounInventory([{ id: 'c1', title: 'Chương 1', chapter_order: 1, edited: 'Kỳ Khê nói với Trình Nặc: “Tôi hiểu rồi, nhưng cậu đừng đi.”' }], rules);
  const group = report.groups.find(item => item.speaker === 'Kỳ Khê' && item.listener === 'Trình Nặc');
  assert.ok(group);
  assert.equal(group.terms.tôi, 1);
  assert.equal(group.terms.cậu, 1);
  assert.equal(group.unexpected, 1);
  assert.deepEqual(rules, original);
});

test('QA recognizes direct-address structure instead of suggesting the self word', () => {
  const issues = runQualityCheck('Kỳ Khê nói với Trình Nặc: “Cậu là đồ thiếu năng.”', { pronounRules: rules });
  const issue = issues.find(item => item.type === 'pronoun' && item.value.toLocaleLowerCase('vi') === 'cậu');
  assert.equal(issue?.replacement, 'Em');
});
