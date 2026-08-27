# Optional LilyBeta sync

Adds **Gửi sang LilyBeta** beside existing save/export controls. Existing editor, draft/autosave, TXT/DOCX/JSON export, and Supabase ownership policies are unchanged. Source is the saved **Bản edit** column; empty edited chapters are reported, never silently replaced by raw text.

## Server-only configuration (Vercel)

- `LILYBETA_SYNC_SECRET`: new random secret, at least 32 chars, matching LilyBeta's `EDITOR_SYNC_SECRET`. Never prefix it with `VITE_`.
- `LILYBETA_SYNC_USER_IDS`: comma-separated verified Supabase user UUID allowlist. Empty means disabled.
- `LILYBETA_API_URL`: `https://beta.lilyhub.top` (origin only).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: this Editor's own Supabase public configuration; existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are accepted server-side fallbacks.

No LilyBeta database URL, password, service role or Admin browser JWT is needed. The browser calls same-origin `/api/lilybeta-sync` with its existing Editor session. The function verifies the session at Supabase, checks allowlist and project/chapter ownership, and uses that same user JWT/RLS to read source rows. Only then does it call LilyBeta using the integration secret. Never put the secret in localStorage or frontend environment variables.

Before enabling, deploy LilyBeta's additive migrations/API and configure its active admin profile ID. Use the existing Vercel development environment for `/api` functions; plain Vite does not execute Vercel functions. Allow up to 30 seconds for upstream batch calls and 45 seconds in the browser.

## Behavior

- Current chapter: saves current changes explicitly and sends that UUID only.
- Changed: plans from server metadata/checkpoints; fetches full text only for selected candidate chapters.
- Whole: 25 chapter batches, with size splitting; does not download/upload a whole manuscript file.
- Failed batches can retry independently. Checkpoints are held by LilyBeta, so reload + changed resumes without duplicates. Business conflicts remain visible and do not count as successfully synced content.
- Source chapters have stable UUIDs; fractional `chapter_order` is converted to a source ordinal, never used as identity.
- LilyBeta preserves its existing dense chapter positions. First sending source chapter 13 creates one Beta chapter at position 1 with original title; later chapters append. Reorder does not move existing Beta anchors.
- Conservative v1 source safety: after a Beta book has ever been assigned, content changes return `SOURCE_CONFLICT`. New chapters may still append. No force overwrite or automatic merge exists.
- Existing source book metadata is not renamed over an Admin's edits; missing source chapters are not deleted.

## Verification

`npm run test:sync` tests server authentication, allowlist, owner RLS filters, batch limits, UUID mappings, source hash, checkpoints and secret non-disclosure with synthetic requests. `npm run build` verifies the production bundle. LilyBeta's `tests/editor-sync.test.ts` can load this server implementation via `EDITOR_SYNC_TEST_CHECKOUT` to test the real receiver path.

Local UI QA harness (synthetic Supabase data, real local LilyBeta integration API):

1. Start a disposable LilyBeta DB/backend at `127.0.0.1:3416`, with `EDITOR_SYNC_SECRET=synthetic-phase55-ui-secret-for-local-test`, `EDITOR_SYNC_ADMIN_ID=admin-root-id`, `NODE_ENV=test`, `DATABASE_PROVIDER=sqlite`.
2. Here run `QA_FAIL_ONCE=true node tests/sync-preview.js` and visit `http://127.0.0.1:3417/sync-qa`.
3. Current → changed → retry failed batch → changed (0 new) → whole (idempotent).

The harness is not loaded by production. Production authentication/networking and Vercel deployment still need environment-specific verification. No production secret/database data was changed during implementation.
