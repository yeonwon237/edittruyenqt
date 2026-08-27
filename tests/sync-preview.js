// Opt-in LOCAL QA harness: synthetic Supabase source, real LilyBeta API.
// Not included in production build and never exposes real account credentials.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { createLilyBetaSyncHandler } from '../server/lilybetaSync.js';
const userId = '33333333-3333-4333-8333-333333333333';
const chapters = Array.from({ length: 30 }, (_, i) => ({ id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`, title: `Chương thử ${i + 1}`, chapter_order: i, updated_date: '2026-01-01T00:00:00Z', edited: `Nội dung chương thử ${i + 1}.\nDòng thứ hai.` }));
let failOnce = process.env.QA_FAIL_ONCE === 'true';
const handler = createLilyBetaSyncHandler({ env: { NODE_ENV: 'test', LILYBETA_SYNC_SECRET: 'synthetic-phase55-ui-secret-for-local-test', LILYBETA_SYNC_USER_IDS: userId, SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', LILYBETA_API_URL: 'http://127.0.0.1:3416' }, fetchImpl: async (url, opts) => {
  if (url.startsWith('https://synthetic.invalid')) {
    const u = new URL(url);
    const ids = u.searchParams.get('id');
    const data = url.includes('/auth/') ? { id: userId } : url.includes('/projects?') ? [{ id: '11111111-1111-4111-8111-111111111111', title: 'Truyện kiểm thử UI' }] : ids ? chapters.filter(ch => ids.includes(ch.id)) : chapters;
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  }
  if (url.endsWith('/sync') && failOnce && opts.body.includes(chapters[29].id)) {
    failOnce = false;
    return new Response(JSON.stringify({ error: 'Lỗi mạng giả lập một lần. Thử lại batch lỗi.', code: 'SYNC_BUSY' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(url, opts);
} });
const root = process.cwd();
const vite = await createServer({ configFile: false, root, plugins: [react(), {
  name: 'sync-local-qa', configureServer(server) {
    server.middlewares.use('/api/lilybeta-sync', async (req, res) => {
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 10_000) throw Error('oversize'); }
        req.body = JSON.parse(body);
        res.status = n => { res.statusCode = n; return res; };
        res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
        await handler(req, res);
      } catch { res.statusCode = 400; res.end('{}'); }
    });
    server.middlewares.use('/sync-qa', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/sync-qa', '<html><body><div id="root"></div><script type="module" src="/tests/fixtures/sync-preview.jsx"></script></body></html>'));
    });
  },
}], resolve: { alias: [{ find: '@/api/supabaseClient', replacement: resolve(root, 'tests/fixtures/syncSupabase.js') }, { find: '@', replacement: resolve(root, 'src') }] }, server: { host: '127.0.0.1', port: 3417, strictPort: true } });
await vite.listen(); vite.printUrls();
