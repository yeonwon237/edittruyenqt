import { createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canonicalParagraphs = text => String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
export const chapterHash = (title, paragraphs) => createHash('sha256').update(JSON.stringify({ title, paragraphs })).digest('hex');
const fail = (status, message, code = 'SYNC_FAILED') => Object.assign(new Error(message), { status, code });

export function createLilyBetaSyncHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
    try {
      const secret = env.LILYBETA_SYNC_SECRET;
      const allowed = new Set(String(env.LILYBETA_SYNC_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
      if (!secret || secret.length < 32 || !allowed.size) throw fail(503, 'Chức năng gửi LilyBeta chưa được quản trị viên cấu hình', 'SYNC_DISABLED');
      const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
      const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anon) throw fail(503, 'Thiếu cấu hình Supabase cho API Editor', 'SYNC_DISABLED');
      const betaUrl = new URL(env.LILYBETA_API_URL || 'https://beta.lilyhub.top');
      if (betaUrl.protocol !== 'https:' && !(env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(betaUrl.hostname))) throw fail(503, 'LilyBeta API phải dùng HTTPS');
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) throw fail(401, 'Vui lòng đăng nhập Editor', 'UNAUTHENTICATED');
      const supaHeaders = { apikey: anon, Authorization: authorization };
      async function jsonFetch(url, options, timeout = 20_000) {
        const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeout) });
        let data;
        try { data = await response.json(); } catch { throw fail(502, 'Máy chủ trả dữ liệu không hợp lệ'); }
        if (!response.ok) throw fail(response.status, typeof data.error === 'string' ? data.error : 'Không thể xử lý yêu cầu', data.code);
        return data;
      }
      const user = await jsonFetch(`${supabaseUrl}/auth/v1/user`, { headers: supaHeaders });
      if (!user?.id || !allowed.has(user.id)) throw fail(403, 'Tài khoản này chưa được cấp quyền gửi sang LilyBeta', 'SYNC_FORBIDDEN');
      const { projectId, action, chapterIds, overwriteExisting = false, includePronounRules = true, includeContextualPronounRules = true } = req.body || {};
      if (!uuid.test(projectId || '') || !['plan', 'batch', 'rules'].includes(action)) throw fail(400, 'Yêu cầu sync không hợp lệ', 'INVALID_PAYLOAD');
      if (typeof overwriteExisting !== 'boolean') throw fail(400, 'Tùy chọn ghi đè không hợp lệ', 'INVALID_PAYLOAD');
      if (typeof includePronounRules !== 'boolean' || typeof includeContextualPronounRules !== 'boolean') throw fail(400, 'Tùy chọn gửi quy tắc xưng hô không hợp lệ', 'INVALID_PAYLOAD');
      if (action === 'batch' && (!Array.isArray(chapterIds) || chapterIds.length < 1 || chapterIds.length > 25 || chapterIds.some(id => !uuid.test(id)) || new Set(chapterIds).size !== chapterIds.length)) throw fail(400, 'Batch cần 1–25 ID chương khác nhau', 'INVALID_BATCH');
      const projects = await jsonFetch(`${supabaseUrl}/rest/v1/projects?select=id,title,pronoun_rules,contextual_pronoun_rules&${new URLSearchParams({ id: `eq.${projectId}`, user_id: `eq.${user.id}` })}`, { headers: supaHeaders });
      if (!projects.length) throw fail(404, 'Không tìm thấy truyện thuộc tài khoản của bạn', 'PROJECT_NOT_FOUND');
      const project = projects[0];
      const betaHeaders = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
      const integrationBase = `${betaUrl.origin}/api/integrations/editor`;
      const ruleBook = { title: project.title };
      if (includePronounRules) ruleBook.pronounRules = Array.isArray(project.pronoun_rules) ? project.pronoun_rules : [];
      if (includeContextualPronounRules) ruleBook.contextualPronounRules = Array.isArray(project.contextual_pronoun_rules) ? project.contextual_pronoun_rules : [];
      if (action === 'rules') {
        const payload = JSON.stringify({ editorBookId: projectId, rulesOnly: true, book: ruleBook, chapters: [] });
        if (Buffer.byteLength(payload) > 1_900_000) throw fail(413, 'Bảng quy tắc quá lớn để gửi', 'RULES_TOO_LARGE');
        const result = await jsonFetch(`${integrationBase}/sync`, { method: 'POST', headers: betaHeaders, body: payload }, 30_000);
        return res.status(200).json(result);
      }
      // RLS uses the caller's JWT, not a service role. Explicit owner filters are defense in depth.
      const metadata = [];
      for (let offset = 0; offset < 100_000; offset += 500) {
        const query = new URLSearchParams({ select: 'id,title,chapter_order,updated_date', project_id: `eq.${projectId}`, user_id: `eq.${user.id}`, order: 'chapter_order.asc,id.asc', limit: '500', offset: String(offset) });
        const rows = await jsonFetch(`${supabaseUrl}/rest/v1/chapters?${query}`, { headers: supaHeaders });
        metadata.push(...rows);
        if (rows.length < 500) break;
        if (offset === 99_500) throw fail(400, 'Truyện vượt giới hạn đồng bộ');
      }
      if (action === 'plan') {
        const state = await jsonFetch(`${integrationBase}/books/${encodeURIComponent(projectId)}`, { headers: betaHeaders });
        const synced = new Map(state.chapters.map(ch => [ch.editorChapterId, ch]));
        return res.status(200).json({
          betaBookId: state.betaBookId, syncState: state.syncState, totalChapters: metadata.length,
          chapters: metadata.map((ch, index) => ({ id: ch.id, title: ch.title, synced: synced.has(ch.id), syncStatus: synced.get(ch.id)?.syncStatus || 'NOT_SYNCED', changed: !synced.has(ch.id) || synced.get(ch.id).syncStatus !== 'SYNCED' || new Date(ch.updated_date).toISOString() !== synced.get(ch.id).updatedAt || index + 1 !== synced.get(ch.id).sourceChapterIndex })),
        });
      }
      const positions = new Map(metadata.map((ch, index) => [ch.id, index + 1]));
      if (chapterIds.some(id => !positions.has(id))) throw fail(404, 'Chương không thuộc truyện hoặc đã bị xóa', 'CHAPTER_NOT_FOUND');
      const query = new URLSearchParams({ select: 'id,title,edited,updated_date', project_id: `eq.${projectId}`, user_id: `eq.${user.id}`, id: `in.(${chapterIds.join(',')})` });
      const rows = await jsonFetch(`${supabaseUrl}/rest/v1/chapters?${query}`, { headers: supaHeaders });
      if (rows.length !== chapterIds.length) throw fail(409, 'Danh sách chương vừa thay đổi. Hãy tải lại kế hoạch gửi.', 'SOURCE_CHANGED');
      const chapters = rows.map(ch => {
        const paragraphs = canonicalParagraphs(ch.edited);
        if (!paragraphs.length) throw fail(400, `Chương “${ch.title}” chưa có Bản edit để gửi`, 'EMPTY_EDITED_CHAPTER');
        const title = ch.title.trim();
        return { editorChapterId: ch.id, chapterIndex: positions.get(ch.id), title, paragraphs, updatedAt: ch.updated_date, contentHash: chapterHash(title, paragraphs) };
      });
      const book = { ...ruleBook, totalChapters: metadata.length };
      const payload = JSON.stringify({ editorBookId: projectId, overwriteExisting, book, chapters });
      if (Buffer.byteLength(payload) > 1_900_000) throw fail(413, 'Batch quá lớn. Hãy chia nhỏ batch.', 'BATCH_TOO_LARGE');
      const result = await jsonFetch(`${integrationBase}/sync`, { method: 'POST', headers: betaHeaders, body: payload }, 30_000);
      return res.status(200).json(result);
    } catch (error) {
      const timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
      // Never echo upstream URLs, request headers, secrets or raw database errors.
      return res.status(timedOut ? 504 : (error.status || 502)).json({ error: timedOut ? 'Đồng bộ quá thời gian chờ. Có thể thử lại batch an toàn.' : (error.status ? error.message : 'Không kết nối được dịch vụ đồng bộ'), code: timedOut ? 'SYNC_TIMEOUT' : (error.code || 'SYNC_FAILED') });
    }
  };
}
