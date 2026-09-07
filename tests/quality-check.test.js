import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityCheck } from '../src/lib/qualityCheck.js';
const rule = { speaker: 'Thu Sương', listener: 'A Trì', self_word: 'ta', target_word: 'đại nhân' };
test('does not confuse different names sharing a title', () => {
  assert.deepEqual(runQualityCheck('Ôn Đại Nhân nói chuyện với Hà Quý phi.', { glossaryTerms: [{ category: 'Tên người', source_term: '陶大人', translation: 'Tô đại nhân' }] }), []);
});
test('nearby characters do not establish dialogue participants', () => {
  const text = 'A Trì nhìn giỏ đồ Thu Sương mang đến, không khỏi bật cười: “Thu Sương luôn là người của ta mà! Nương nương ngay cả nàng cũng tra xét sao?”\nCuối cùng, Đỗ Chiêu Ly mới gật đầu, nói: “Ta tin tưởng ngươi.”';
  assert.deepEqual(runQualityCheck(text, { pronounRules: [rule] }), []);
});
test('a lone speaker rule with no explicit listener still resolves, but only at low confidence', () => {
  // Was strictly "requires explicit listener" — real Vietnamese web-novel
  // dialogue almost never tags "với <listener>" explicitly, so that left
  // the story-wide QA scanner unable to seed a session from a huge share of
  // real chapters. Since Thu Sương has exactly one rule in the whole
  // matrix, "Thu Sương nói:" is still usable evidence — just weak evidence
  // (she could in principle be addressing someone outside the matrix
  // entirely), so it resolves at "thấp" rather than being silently dropped.
  const issues = runQualityCheck('Thu Sương nói: “Tôi hiểu rồi.”', { pronounRules: [rule] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].replacement, 'ta');
  assert.equal(issues[0].confidence, 'thấp');
});
test('correct self reference after possessive cue is preserved', () => {
  assert.deepEqual(runQualityCheck('Thu Sương nói với A Trì: “Đó là người của ta.”', { pronounRules: [rule] }), []);
});
test('explicit self mismatch remains actionable with exact offsets', () => {
  const text = 'Thu Sương nói với A Trì: “Tôi hiểu rồi.”';
  const issues = runQualityCheck(text, { pronounRules: [rule] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].replacement, 'ta');
  assert.equal(text.slice(issues[0].start, issues[0].end), 'Tôi');
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
