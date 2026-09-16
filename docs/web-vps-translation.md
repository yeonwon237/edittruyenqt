# Web translation through the Lily VPS

The web build sends **Dịch AI** jobs to the Lily Translation API through the
same-origin Vercel function at `/api/lily-translation`. The VPS Bearer key must
never use a `VITE_` prefix and must never be stored in browser localStorage.

Configure these server-side environment variables in Vercel:

- `LILY_TRANSLATION_API_URL`: `https://api.lilyhub.id.vn`
- `LILY_TRANSLATION_API_KEY`: the 32+ character key from the VPS
- `LILY_TRANSLATION_USER_IDS`: comma-separated Supabase user IDs allowed to use VPS compute. If omitted, the existing `LILYBETA_SYNC_USER_IDS` allowlist is used.
- `SUPABASE_URL`: the Editor Supabase project URL
- `SUPABASE_ANON_KEY`: the Editor publishable/anon key

Redeploy after changing environment variables. The existing web session is
used to authenticate every create/status request. Job IDs returned by the VPS
are wrapped in a short-lived, user-bound signed token before reaching the
browser.

The desktop path is unchanged: Tauri continues to call its local CTranslate2
sidecar at `127.0.0.1:8787`. Only the browser path uses the VPS.

Run the focused checks with:

```powershell
npm run test:translation-api
npm run build
```
