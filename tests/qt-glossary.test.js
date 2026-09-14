import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { glossarySpans } from '../src/lib/qtGlossary.js';

// Bundle the actual production engine with its real JSON dictionaries for Node.
const bundled = await build({ entryPoints: ['src/lib/hanviet.js'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { translateHanViet } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('longest approved name wins over short approved aliases', () => {
  const spans = glossarySpans('陆空希看着空希', [
    { source_term: '陆', translation: 'Lục' }, { source_term: '陆空希', translation: 'Lục Không Hi' },
    { source_term: '空希', translation: 'Không Hi' },
  ]);
  assert.deepEqual([...spans.keys()], [0, 5]);
  assert.equal(spans.get(0).source, '陆空希');
});

test('approved glossary overrides longer builtin words at same position', async () => {
  const result = await translateHanViet('天剑', [{ source_term: '天', translation: 'ThiênĐãKhóa' }]);
  assert.ok(result.text.includes('ThiênĐãKhóa'), result.text);
  assert.equal(result.diagnostics.glossaryChars, 1);
});

test('dictionary cannot swallow beginning of a locked name later in a phrase', async () => {
  const result = await translateHanViet('今天剑宗来了。', [{ source_term: '天剑宗', translation: 'Thiên Kiếm Tông' }]);
  assert.ok(result.text.includes('Thiên Kiếm Tông'), result.text);
  assert.equal(result.diagnostics.glossaryChars, 3);
  assert.ok(result.coverage >= 0 && result.coverage <= 1);
});

test('grammar reordering cannot split a glossary phrase containing 的', async () => {
  const result = await translateHanViet('我的世界。', [{ source_term: '我的世界', translation: 'Thế Giới Của Ta' }]);
  assert.ok(result.text.includes('Thế Giới Của Ta'), result.text);
  assert.equal(result.diagnostics.glossaryChars, 4);
});

test('distinct source pronouns remain distinct and approved names preserve formal readings', async () => {
  const result = await translateHanViet('陆未晞看着他和她。', [
    { source_term: '陆未晞', translation: 'Lục Vị Hi' },
    { source_term: '他', translation: 'hắn' }, { source_term: '她', translation: 'nàng' },
  ]);
  assert.ok(result.text.includes('Lục Vị Hi'), result.text);
  assert.ok(result.text.includes('hắn'), result.text);
  assert.ok(result.text.includes('nàng'), result.text);
});

test('single pronoun defaults do not split plural dictionary compounds', async () => {
  const baseline = await translateHanViet('我们。');
  const result = await translateHanViet('我们。', [{ source_term: '我', translation: 'bổn tọa', category: 'Xưng hô' }]);
  assert.equal(result.text, baseline.text);
  const singular = await translateHanViet('我。', [{ source_term: '我', translation: 'bổn tọa', category: 'Xưng hô' }]);
  assert.match(singular.text, /Bổn tọa/);
});

test('fallback diagnostics carry original spans for glossary discovery', async () => {
  const result = await translateHanViet('龘靐。');
  assert.ok(result.diagnostics.fallbackSpans.some(span => span.source.includes('龘')));
});

test('把-construction moves the fronted object after the verb phrase', async () => {
  const result = await translateHanViet('她把书递给我。');
  assert.ok(!result.text.includes('把'), result.text);
  // "sách" (book, the object) must land after "đưa" (the verb), not before it.
  assert.ok(result.text.indexOf('đưa') < result.text.indexOf('sách'), result.text);
});

test('把-construction bails and leaves order untouched when the object contains 的', async () => {
  const result = await translateHanViet('他将那皱起的书页翻过去。');
  assert.ok(!result.text.includes('tướng'), result.text);
  assert.ok(!result.text.includes('将'), result.text);
});

// The reorder pass runs per-gap between glossary locks (see translateHanViet)
// and can't see across a locked name to find the verb on the other side, so
// a 把-object that IS a locked name doesn't get reordered — known limitation,
// not covered by this pass. What must still hold: the name survives intact
// (not split/corrupted by the reorder heuristic) and 把 itself is dropped
// rather than mistranslated.
test('把-construction leaves a locked glossary object unreordered but intact', async () => {
  const result = await translateHanViet('她把陆未晞带走了。', [
    { source_term: '陆未晞', translation: 'Lục Vị Hi' },
  ]);
  assert.ok(result.text.includes('Lục Vị Hi'), result.text);
  assert.ok(!result.text.includes('把'), result.text);
});

test('adverbial 地 particle is dropped, but a locative compound keeps "địa"', async () => {
  const noParticle = await translateHanViet('他慢慢地走了过去。');
  assert.ok(!noParticle.text.includes('địa'), noParticle.text);
  const locative = await translateHanViet('他站在原地。');
  assert.match(locative.text, /địa|chỗ/i);
});

test('看 and 却 default to modern-prose readings, not archaic Hán-Việt', async () => {
  const result = await translateHanViet('他看书, 却不知道。');
  assert.ok(!result.text.includes('khán'), result.text);
  assert.ok(!result.text.includes('khước'), result.text);
});

// Real chapter bug: "温锦没点评她的狂妄发言" (Ôn Cẩm didn't comment on her
// wild remarks) has "的" splitting it into "温锦没点评她" | "狂妄发言" — the
// pre-的 span slips under MAX_MODIFIER_LEN and has no guard char on the NOUN
// side, but it's a whole subject+negation+verb+object clause, not an
// attributive modifier (it contains 没, a verb-guard char). Swapping it used
// to produce "cuồng vọng lên tiếng Ôn Cẩm không lời bình nàng" — reading as
// if the object's meaning modifies the subject.
test('把/的 reorder does not swap a full subject-verb-object clause parked before 的', async () => {
  const result = await translateHanViet('温锦没点评她的狂妄发言。');
  const idxSubject = result.text.toLowerCase().indexOf('không');
  const idxNoun = result.text.toLowerCase().indexOf('cuồng vọng');
  assert.ok(idxSubject >= 0 && idxNoun >= 0, result.text);
  assert.ok(idxSubject < idxNoun, result.text);
});

test('legitimate modifier-noun 的 clauses still reorder (no regression from the fix above)', async () => {
  const result = await translateHanViet('美丽的姑娘。');
  assert.match(result.text, /^Cô nương xinh đẹp/i);
});
