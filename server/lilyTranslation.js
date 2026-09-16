import { createHmac, timingSafeEqual } from 'node:crypto';

const JOB_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SOURCE_CHARS = 100_000;
const MAX_GLOSSARY_ROWS = 2_000;
const ALLOWED_ACTIONS = new Set(['models', 'create', 'status']);
const MODEL_ID = /^[A-Za-z0-9._/-]{1,100}$/;
const JOB_ID = /^[0-9a-f]{32}$/i;

const fail = (status, message, code = 'TRANSLATION_FAILED') =>
  Object.assign(new Error(message), { status, code });

function encodeJobToken(jobId, userId, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ jobId, userId, exp: now + JOB_TTL_MS })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeJobToken(token, userId, secret, now = Date.now()) {
  const [payload, suppliedSignature, extra] = String(token || '').split('.');
  if (!payload || !suppliedSignature || extra) throw fail(400, 'Mã tác vụ dịch không hợp lệ', 'INVALID_JOB_TOKEN');
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw fail(403, 'Không có quyền xem tác vụ dịch này', 'INVALID_JOB_TOKEN');
  }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw fail(400, 'Mã tác vụ dịch không hợp lệ', 'INVALID_JOB_TOKEN'); }
  if (!JOB_ID.test(data.jobId || '') || data.userId !== userId || !Number.isFinite(data.exp) || data.exp < now) {
    throw fail(data.exp < now ? 410 : 403, data.exp < now ? 'Tác vụ dịch đã hết hạn' : 'Không có quyền xem tác vụ dịch này', 'INVALID_JOB_TOKEN');
  }
  return data.jobId;
}

function cleanGlossary(rows) {
  if (!Array.isArray(rows)) return [];
  if (rows.length > MAX_GLOSSARY_ROWS) throw fail(413, `Glossary vượt quá ${MAX_GLOSSARY_ROWS} mục`, 'GLOSSARY_TOO_LARGE');
  return rows.map(row => ({
    source_term: String(row?.source_term || row?.source || '').trim(),
    translation: String(row?.translation || row?.target || '').trim(),
    category: String(row?.category || 'Khác').trim(),
  })).filter(row => row.source_term && row.translation);
}

export function createLilyTranslationHandler({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST', code: 'METHOD_NOT_ALLOWED' });
    try {
      const secret = String(env.LILY_TRANSLATION_API_KEY || '');
      const allowed = new Set(String(env.LILY_TRANSLATION_USER_IDS || env.LILYBETA_SYNC_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
      const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
      const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
      if (secret.length < 32 || !allowed.size || !supabaseUrl || !anon) {
        throw fail(503, 'Dịch AI VPS chưa được quản trị viên cấu hình', 'TRANSLATION_DISABLED');
      }
      const apiUrl = new URL(env.LILY_TRANSLATION_API_URL || 'https://api.lilyhub.id.vn');
      if (apiUrl.protocol !== 'https:' && !(env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(apiUrl.hostname))) {
        throw fail(503, 'API dịch phải sử dụng HTTPS', 'TRANSLATION_DISABLED');
      }
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) throw fail(401, 'Vui lòng đăng nhập lại Editor', 'UNAUTHENTICATED');

      async function jsonFetch(url, options, timeout = 20_000) {
        const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeout) });
        let data;
        try { data = await response.json(); }
        catch { throw fail(502, 'Máy chủ dịch trả dữ liệu không hợp lệ', 'INVALID_UPSTREAM_RESPONSE'); }
        if (!response.ok) {
          const detail = typeof data?.detail === 'string' ? data.detail : typeof data?.error === 'string' ? data.error : 'Máy chủ dịch không xử lý được yêu cầu';
          throw fail(response.status === 401 ? 502 : response.status, detail, 'UPSTREAM_ERROR');
        }
        return data;
      }

      const user = await jsonFetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anon, Authorization: authorization },
      });
      if (!user?.id || !allowed.has(user.id)) throw fail(403, 'Tài khoản này chưa được cấp quyền dùng dịch AI VPS', 'TRANSLATION_FORBIDDEN');

      const action = req.body?.action;
      if (!ALLOWED_ACTIONS.has(action)) throw fail(400, 'Yêu cầu dịch không hợp lệ', 'INVALID_PAYLOAD');
      const upstreamHeaders = {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'User-Agent': 'EditTruyenQT/1.0',
      };

      if (action === 'models') {
        const data = await jsonFetch(new URL('/v1/models', apiUrl), { headers: upstreamHeaders });
        return res.status(200).json(data);
      }

      if (action === 'create') {
        const source = String(req.body?.source || '');
        const modelKey = String(req.body?.model_key || '');
        if (!source.trim()) throw fail(400, 'Văn bản nguồn đang trống', 'EMPTY_SOURCE');
        if (source.length > MAX_SOURCE_CHARS) throw fail(413, `Mỗi lượt dịch tối đa ${MAX_SOURCE_CHARS.toLocaleString('vi-VN')} ký tự`, 'SOURCE_TOO_LARGE');
        if (!MODEL_ID.test(modelKey)) throw fail(400, 'Model dịch không hợp lệ', 'INVALID_MODEL');
        const payload = {
          source,
          model_key: modelKey,
          backend: 'ct2',
          beam_size: 1,
          batch_size: 32,
          chunk_mode: 'câu',
          normalize_mode: 'auto',
          honorific_kinship: true,
          honorific_pronouns: true,
          pronoun_harmonizer_v9: false,
          glossary_rows: cleanGlossary(req.body?.glossary_rows),
        };
        const data = await jsonFetch(new URL('/v1/translate/jobs', apiUrl), {
          method: 'POST', headers: upstreamHeaders, body: JSON.stringify(payload),
        }, 30_000);
        if (!JOB_ID.test(data?.job_id || '')) throw fail(502, 'Máy chủ dịch không trả mã tác vụ hợp lệ', 'INVALID_UPSTREAM_RESPONSE');
        return res.status(202).json({ status: data.status, job_token: encodeJobToken(data.job_id, user.id, secret, now()) });
      }

      const jobId = decodeJobToken(req.body?.job_token, user.id, secret, now());
      const data = await jsonFetch(new URL(`/v1/translate/jobs/${jobId}`, apiUrl), { headers: upstreamHeaders });
      return res.status(200).json(data);
    } catch (error) {
      const timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
      return res.status(timedOut ? 504 : (error.status || 502)).json({
        error: timedOut ? 'Máy chủ dịch phản hồi quá thời gian chờ' : (error.status ? error.message : 'Không kết nối được máy chủ dịch'),
        code: timedOut ? 'TRANSLATION_TIMEOUT' : (error.code || 'TRANSLATION_FAILED'),
      });
    }
  };
}

export const lilyTranslationInternals = { encodeJobToken, decodeJobToken, cleanGlossary };
