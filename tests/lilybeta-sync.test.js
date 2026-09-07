import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLilyBetaSyncHandler, canonicalParagraphs, chapterHash } from '../server/lilybetaSync.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const chapterId = '33333333-3333-4333-8333-333333333333';
const env = { NODE_ENV: 'test', LILYBETA_SYNC_SECRET: 'synthetic-server-side-integration-token', LILYBETA_SYNC_USER_IDS: userId, SUPABASE_URL: 'https://source.invalid', SUPABASE_ANON_KEY: 'public-anon' };
const updatedAt = '2026-01-01T00:00:00.000Z';
function fixture(overrides = {}) {
  const calls = [];
  const handler = createLilyBetaSyncHandler({ env: { ...env, ...overrides.env }, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (overrides.respond) { const result = overrides.respond(url, options); if (result !== undefined) return result; }
    const data = url.includes('/auth/') ? { id: userId } : url.includes('/projects?') ? [{ id: projectId, title: 'Project', pronoun_rules: [{ name: 'Đổi ngôi', from_words: ['Ta'], to_words: ['Tôi'] }], contextual_pronoun_rules: [{ speaker: 'A', listener: 'B', self_word: 'ta', target_word: 'ngươi', note: 'khi riêng tư' }] }] : url.includes('/chapters?') ? [{ id: chapterId, title: 'Chương 1', chapter_order: 0.5, updated_date: updatedAt, edited: 'Một dòng.\r\n\r\nDòng hai.' }] : url.includes('/books/') ? { betaBookId: 'beta-book', chapters: [{ editorChapterId: chapterId, updatedAt, sourceChapterIndex: 1, syncStatus: 'SYNCED' }] } : { betaBookId: 'beta-book', results: [{ editorChapterId: chapterId, status: 'CREATED' }] };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } });
  async function request(body = { projectId, action: 'plan' }, headers = { authorization: 'Bearer synthetic-editor-session' }) {
    let status = 200, data;
    const res = { setHeader() {}, status(n) { status = n; return this; }, json(value) { data = value; return this; } };
    await handler({ method: 'POST', headers, body }, res);
    return { status, data };
  }
  return { request, calls };
}

test('disabled by default; no calls made without server configuration', async () => {
  const f = fixture({ env: { LILYBETA_SYNC_SECRET: '' } });
  assert.equal((await f.request()).status, 503); assert.equal(f.calls.length, 0);
});
test('reject missing JWT and do not decode unverified JWT as authentication', async () => {
  const f = fixture(); assert.equal((await f.request(undefined, {})).status, 401); assert.equal(f.calls.length, 0);
  const invalid = fixture({ respond: url => url.includes('/auth/') ? new Response('{}', { status: 401 }) : undefined });
  assert.equal((await invalid.request()).status, 401); assert.equal(invalid.calls.length, 1);
});
test('deny authenticated users outside allowlist', async () => {
  const f = fixture({ env: { LILYBETA_SYNC_USER_IDS: 'someone-else' } });
  assert.equal((await f.request()).status, 403); assert.equal(f.calls.length, 1);
});
test('deny project not owned by caller before any LilyBeta call', async () => {
  const f = fixture({ respond: url => url.includes('/projects?') ? new Response('[]') : undefined });
  assert.equal((await f.request()).status, 404);
  assert.ok(f.calls.every(c => c.url.startsWith(env.SUPABASE_URL)));
  assert.ok(f.calls.find(c => c.url.includes('/projects?')).url.includes(`user_id=eq.${userId}`));
});
test('changed plan uses server checkpoints and never downloads chapter bodies', async () => {
  const f = fixture(); const result = await f.request();
  assert.equal(result.status, 200); assert.equal(result.data.chapters[0].changed, false);
  assert.ok(!f.calls.some(c => c.url.includes('select=id%2Ctitle%2Cedited')));
});
test('batch reads only selected owned chapters and forwards original UUID identity', async () => {
  const f = fixture(); assert.equal((await f.request({ projectId, action: 'batch', chapterIds: [chapterId], url: 'https://evil.invalid' })).status, 200);
  const out = f.calls.find(c => c.url.endsWith('/sync'));
  const payload = JSON.parse(out.options.body);
  assert.equal(payload.editorBookId, projectId); assert.equal(payload.chapters[0].editorChapterId, chapterId);
  assert.equal(payload.chapters[0].chapterIndex, 1); // Fractional chapter_order is not an ID/index.
  assert.equal(payload.overwriteExisting, false);
  assert.deepEqual(payload.book.pronounRules, [{ name: 'Đổi ngôi', from_words: ['Ta'], to_words: ['Tôi'] }]);
  assert.deepEqual(payload.book.contextualPronounRules, [{ speaker: 'A', listener: 'B', self_word: 'ta', target_word: 'ngươi', note: 'khi riêng tư' }]);
  assert.deepEqual(payload.chapters[0].paragraphs, ['Một dòng.', 'Dòng hai.']);
  assert.equal(payload.chapters[0].contentHash, chapterHash('Chương 1', ['Một dòng.', 'Dòng hai.']));
  assert.equal(out.options.headers.Authorization, `Bearer ${env.LILYBETA_SYNC_SECRET}`);
  assert.ok(!out.options.body.includes('synthetic-editor-session'));
  assert.ok(f.calls.filter(c => c.url.startsWith(env.SUPABASE_URL)).every(c => c.options.headers.Authorization === 'Bearer synthetic-editor-session'));
  assert.ok(!f.calls.some(c => c.url.includes('evil.invalid')));
});
test('pronoun context can be omitted independently and option types are validated', async () => {
  const f = fixture();
  assert.equal((await f.request({ projectId, action: 'batch', chapterIds: [chapterId], includePronounRules: false, includeContextualPronounRules: true })).status, 200);
  const book = JSON.parse(f.calls.find(c => c.url.endsWith('/sync')).options.body).book;
  assert.equal('pronounRules' in book, false);
  assert.equal(book.contextualPronounRules[0].speaker, 'A');

  const invalid = fixture();
  assert.equal((await invalid.request({ projectId, action: 'batch', chapterIds: [chapterId], includePronounRules: 'yes' })).status, 400);
  assert.ok(!invalid.calls.some(c => c.url.endsWith('/sync')));
});
test('rules-only action sends no chapter bodies and does not require overwrite', async () => {
  const f = fixture();
  assert.equal((await f.request({ projectId, action: 'rules', includePronounRules: true, includeContextualPronounRules: true })).status, 200);
  const payload = JSON.parse(f.calls.find(c => c.url.endsWith('/sync')).options.body);
  assert.equal(payload.rulesOnly, true);
  assert.deepEqual(payload.chapters, []);
  assert.equal(payload.overwriteExisting, undefined);
  assert.ok(!f.calls.some(c => c.url.includes('/chapters?')));
});
test('explicit overwrite option is validated and forwarded to LilyBeta', async () => {
  const f = fixture();
  assert.equal((await f.request({ projectId, action: 'batch', chapterIds: [chapterId], overwriteExisting: true })).status, 200);
  assert.equal(JSON.parse(f.calls.find(c => c.url.endsWith('/sync')).options.body).overwriteExisting, true);

  const invalid = fixture();
  assert.equal((await invalid.request({ projectId, action: 'batch', chapterIds: [chapterId], overwriteExisting: 'yes' })).status, 400);
  assert.ok(!invalid.calls.some(c => c.url.endsWith('/sync')));
});
test('foreign chapter IDs and oversized batches are rejected', async () => {
  const f = fixture(); assert.equal((await f.request({ projectId, action: 'batch', chapterIds: [userId] })).status, 404);
  assert.equal((await f.request({ projectId, action: 'batch', chapterIds: Array(26).fill(chapterId) })).status, 400);
  assert.ok(!f.calls.some(c => c.url.endsWith('/sync')));
});
test('no fallback to untranslated raw text when edited column is empty', async () => {
  const f = fixture({ respond: url => url.includes('select=id%2Ctitle%2Cedited') ? new Response(JSON.stringify([{ id: chapterId, title: 'Empty', edited: '', qt_raw: 'Do not send raw', updated_date: updatedAt }])) : undefined });
  const r = await f.request({ projectId, action: 'batch', chapterIds: [chapterId] });
  assert.equal(r.status, 400); assert.equal(r.data.code, 'EMPTY_EDITED_CHAPTER'); assert.ok(!f.calls.some(c => c.url.endsWith('/sync')));
});
test('normalization preserves paragraph text and hash is deterministic', () => {
  assert.deepEqual(canonicalParagraphs('  A  \r\n\nB'), ['  A  ', 'B']);
  assert.equal(chapterHash('Title', ['A']), chapterHash('Title', ['A']));
  assert.notEqual(chapterHash('Title', ['A']), chapterHash('Changed', ['A']));
});
test('network errors do not leak server secret or internal URLs', async () => {
  const f = fixture({ respond: () => { throw new Error(`secret ${env.LILYBETA_SYNC_SECRET}`); } });
  const result = await f.request(); assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result).includes(env.LILYBETA_SYNC_SECRET));
});

test('plan distinguishes never-sent chapters from already-synced chapters', async () => {
  const f = fixture();
  const existing = (await f.request()).data.chapters[0];
  assert.equal(existing.synced, true);
  assert.equal(existing.syncStatus, 'SYNCED');
  const fresh = fixture({ respond: url => url.includes('/books/') ? new Response(JSON.stringify({ betaBookId: null, chapters: [] })) : undefined });
  const chapter = (await fresh.request()).data.chapters[0];
  assert.equal(chapter.synced, false);
  assert.equal(chapter.changed, true);
  assert.equal(chapter.syncStatus, 'NOT_SYNCED');
});

import { selectChapterRange, chapterIdsForMode } from '../src/components/workspace/lilybetaSelection.js';
const selectionChapters = Array.from({ length: 40 }, (_, i) => ({ id: `chapter-${i + 1}`, synced: i < 20, changed: i >= 20 || i === 1 }));
test('custom range selects exact IDs, deduplicates overlaps, and retains source order', () => {
  assert.deepEqual(selectChapterRange(selectionChapters, '25, 1-3, 2-4, 30-31'), ['chapter-1','chapter-2','chapter-3','chapter-4','chapter-25','chapter-30','chapter-31']);
  assert.equal(selectChapterRange(selectionChapters, '1-20').length, 20);
  for (const invalid of ['', '0', '4-2', '1-41', '1,,2', '1.2', '-1', '1-999999999999999999999']) assert.throws(() => selectChapterRange(selectionChapters, invalid));
});
test('after 20 sent, never-sent mode selects only 21–40; changed still includes edited old chapters', () => {
  assert.deepEqual(chapterIdsForMode(selectionChapters, 'new'), selectionChapters.slice(20).map(ch => ch.id));
  assert.equal(chapterIdsForMode(selectionChapters, 'changed').length, 21);
  assert.equal(chapterIdsForMode(selectionChapters, 'all').length, 40);
  assert.deepEqual(chapterIdsForMode(selectionChapters, 'current', 'chapter-5'), ['chapter-5']);
});
test('manual choices are stable IDs across reordering and deleted selections require refresh', () => {
  assert.deepEqual(chapterIdsForMode([...selectionChapters].reverse(), 'selected', null, ['chapter-2','chapter-5','chapter-2']), ['chapter-5','chapter-2']);
  assert.throws(() => chapterIdsForMode(selectionChapters, 'selected', null, ['removed-id']));
  assert.deepEqual(chapterIdsForMode(selectionChapters, 'selected', null, []), []);
});
