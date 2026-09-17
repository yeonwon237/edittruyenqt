import test from 'node:test';
import assert from 'node:assert/strict';
import { createLilyTranslationHandler } from '../server/lilyTranslation.js';

const env = {
  NODE_ENV: 'test',
  LILY_TRANSLATION_API_KEY: 'x'.repeat(40),
  LILY_TRANSLATION_USER_IDS: 'user-1',
  LILY_TRANSLATION_API_URL: 'http://127.0.0.1:8766',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
};

function response(status, data) {
  return { ok: status >= 200 && status < 300, status, async json() { return data; } };
}

function invoke(handler, body, authorization = 'Bearer editor-session') {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, data, headers: this.headers }); },
    };
    handler({ method: 'POST', headers: { authorization }, body }, res);
  });
}

test('creates a VPS job without exposing the upstream API key', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/auth/v1/user')) return response(200, { id: 'user-1' });
    return response(202, { job_id: 'a'.repeat(32), status: 'queued' });
  };
  const result = await invoke(createLilyTranslationHandler({ env, fetchImpl, now: () => 1000 }), {
    action: 'create', source: '你好。', model_key: 'HachimiMT-60',
    glossary_rows: [{ source_term: '张三', translation: 'Trương Tam', category: 'Tên người' }],
  });
  assert.equal(result.status, 202);
  assert.equal(result.data.status, 'queued');
  assert.ok(result.data.job_token);
  assert.equal(result.data.job_id, undefined);
  const upstream = calls.find(call => call.url.endsWith('/v1/translate/jobs'));
  assert.equal(upstream.options.headers.Authorization, `Bearer ${env.LILY_TRANSLATION_API_KEY}`);
  const payload = JSON.parse(upstream.options.body);
  assert.equal(payload.model_key, 'HachimiMT-60');
  assert.equal(payload.beam_size, 2);
  assert.equal(Object.hasOwn(payload, 'batch_size'), false);
  assert.deepEqual(payload.glossary_rows[0], { source_term: '张三', translation: 'Trương Tam', category: 'Tên người' });
});

test('polls only a signed job owned by the authenticated user', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/auth/v1/user')) return response(200, { id: 'user-1' });
    if (String(url).endsWith('/v1/translate/jobs')) return response(202, { job_id: 'b'.repeat(32), status: 'queued' });
    return response(200, { id: 'b'.repeat(32), status: 'completed', result: { result_text: 'Xin chào.' } });
  };
  const handler = createLilyTranslationHandler({ env, fetchImpl, now: () => 1000 });
  const created = await invoke(handler, { action: 'create', source: '你好。', model_key: 'HachimiMT-60' });
  const polled = await invoke(handler, { action: 'status', job_token: created.data.job_token });
  assert.equal(polled.status, 200);
  assert.equal(polled.data.result.result_text, 'Xin chào.');
  assert.ok(calls.some(call => call.url.endsWith(`/v1/translate/jobs/${'b'.repeat(32)}`)));
});

test('rejects users outside the translation allowlist', async () => {
  const fetchImpl = async () => response(200, { id: 'user-2' });
  const result = await invoke(createLilyTranslationHandler({ env, fetchImpl }), {
    action: 'create', source: '你好。', model_key: 'HachimiMT-60',
  });
  assert.equal(result.status, 403);
  assert.equal(result.data.code, 'TRANSLATION_FORBIDDEN');
});

test('rejects oversized source before calling the VPS', async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls += 1;
    if (String(url).includes('/auth/v1/user')) return response(200, { id: 'user-1' });
    throw new Error('VPS should not be called');
  };
  const result = await invoke(createLilyTranslationHandler({ env, fetchImpl }), {
    action: 'create', source: '中'.repeat(100_001), model_key: 'HachimiMT-60',
  });
  assert.equal(result.status, 413);
  assert.equal(calls, 1);
});
