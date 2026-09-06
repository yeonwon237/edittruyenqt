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
