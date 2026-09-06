import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectGlossaryCandidates, discoverGlossary, parseDiscoveryResponse, splitDiscoveryText } from '../src/lib/glossaryDiscovery.js';

test('machine retains single-use titles, feminine/masculine pronouns, repeated names and known-name aliases', () => {
  const text = '陆空希进入天剑宗。陆空希说：“她和他都修炼《九天神诀》。”空希回头。';
  const rows = collectGlossaryCandidates(text, [{ source_term: '陆空希' }]);
  const keys = rows.map(r => r.source_term);
  for (const word of ['天剑宗', '九天神诀', '她', '他', '空希']) assert.ok(keys.includes(word), word);
  assert.ok(!keys.includes('陆空希'));
  assert.ok(rows.every(r => r.contexts.length && r.status === 'unreviewed' && !r.translation));
});

test('chunk overlap preserves names at boundaries and reaches final character', () => {
  const text = '甲'.repeat(5998) + '陆空希' + '乙'.repeat(6200) + '《最后神诀》';
  const chunks = splitDiscoveryText(text);
  assert.ok(chunks.every(c => c.length <= 6000));
  assert.ok(chunks.some(c => c.includes('陆空希')));
  assert.ok(chunks.at(-1).endsWith('《最后神诀》'));
});

test('AI cannot invent source terms or lose declined/untranslated candidates', () => {
  const rows = parseDiscoveryResponse(JSON.stringify([
    { source_term: '天剑宗', translation: 'Thiên Kiếm Tông', keep: true },
    { source_term: '不存在', translation: 'Bịa' },
    { source_term: '长老', keep: false },
    { source_term: '她' },
  ]), '天剑宗长老看着她');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].status, 'rejected');
  assert.equal(rows[2].status, 'unreviewed');
});

test('AI independently adds missing terms and retains conflicting translations for review', async () => {
  let calls = 0;
  const text = `${'甲'.repeat(5900)}天剑宗。${'乙'.repeat(300)}天剑宗。`;
  const result = await discoverGlossary({ text, callAI: async () => {
    calls += 1;
    return JSON.stringify([{ source_term: '天剑宗', translation: calls === 1 ? 'Thiên Kiếm Tông' : 'Thiên Kiếm tông', confidence: 0.9, keep: true }]);
  } });
  assert.equal(calls, 2);
  const term = result.candidates.find(r => r.source_term === '天剑宗');
  assert.equal(term.count, 2);
  assert.equal(term.conflict, true);
  assert.equal(term.alternatives.length, 2);
  assert.ok(result.unreviewed > 0, 'unanswered candidates must not vanish');
});

test('one failed request preserves candidates and continues independent AI scan', async () => {
  let calls = 0;
  const text = `他见到天剑宗。${'甲'.repeat(6100)}她见到天剑宗。`;
  const result = await discoverGlossary({ text, callAI: async () => {
    if (++calls === 1) throw new Error('offline');
    return '[]';
  } });
  assert.equal(result.warnings.length, 1);
  assert.ok(result.candidates.length > 0);
  assert.ok(calls > 1);
});

test('stop prevents further paid calls', async () => {
  let stopped = false;
  let calls = 0;
  const result = await discoverGlossary({ text: '她来到天剑宗。', shouldStop: () => stopped,
    callAI: async () => { calls += 1; stopped = true; return '[]'; } });
  assert.equal(calls, 1);
  assert.equal(result.stopped, true);
  assert.ok(result.unreviewed > 0);
});

test('QT suspect fragments are prioritised but must exist in Chinese source', () => {
  const rows = collectGlossaryCandidates('陆未晞来了。', [], [{ source: '陆未晞', kind: 'guessed-name' }, { source: '伪造' }]);
  assert.ok(rows.find(r => r.source_term === '陆未晞').reasons.includes('QT đoán đây là tên'));
  assert.ok(!rows.some(r => r.source_term === '伪造'));
});
