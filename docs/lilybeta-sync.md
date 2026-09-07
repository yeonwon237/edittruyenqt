# Optional LilyBeta sync

Adds **Gửi sang LilyBeta** beside existing save/export controls. Existing editor, draft/autosave, TXT/DOCX/JSON export, and Supabase ownership policies are unchanged. Source is the saved **Bản edit** column; empty edited chapters are reported, never silently replaced by raw text.

The sync dialog can also include the story's general `pronoun_rules` table and the contextual A→B `contextual_pronoun_rules` matrix. Both are enabled by default and are sent as `book.pronounRules` and `book.contextualPronounRules` so LilyBeta can use them as beta-reading context. The server reads them from the caller-owned project via RLS; the browser never supplies rule contents directly.

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
- Ghi đè là tùy chọn chủ động: batch chỉ gửi `overwriteExisting: true` khi người dùng bật **Cho phép ghi đè chương đã gửi**. Mặc định, nội dung đã có trên Beta vẫn được bảo vệ và có thể trả về `SOURCE_CONFLICT`.
- Existing source book metadata is not renamed over an Admin's edits; missing source chapters are not deleted.

## Verification

`npm run test:sync` tests server authentication, allowlist, owner RLS filters, batch limits, UUID mappings, source hash, checkpoints and secret non-disclosure with synthetic requests. `npm run build` verifies the production bundle. LilyBeta's `tests/editor-sync.test.ts` can load this server implementation via `EDITOR_SYNC_TEST_CHECKOUT` to test the real receiver path.

Local UI QA harness (synthetic Supabase data, real local LilyBeta integration API):

1. Start a disposable LilyBeta DB/backend at `127.0.0.1:3416`, with `EDITOR_SYNC_SECRET=synthetic-phase55-ui-secret-for-local-test`, `EDITOR_SYNC_ADMIN_ID=admin-root-id`, `NODE_ENV=test`, `DATABASE_PROVIDER=sqlite`.
2. Here run `QA_FAIL_ONCE=true node tests/sync-preview.js` and visit `http://127.0.0.1:3417/sync-qa`.
3. Current → changed → retry failed batch → changed (0 new) → whole (idempotent).

The harness is not loaded by production. Production authentication/networking and Vercel deployment still need environment-specific verification. No production secret/database data was changed during implementation.

### Chọn chương theo ý muốn

Trong hộp gửi, chọn **Chọn chương để gửi** để tải trạng thái từ LilyBeta. Đánh dấu từng chương hoặc nhập khoảng/vị trí như `1-20, 25, 30-35`, bấm **Chọn theo khoảng**, rồi **Gửi N chương đã chọn**. Chọn theo khoảng thay thế lựa chọn trước; có thể sửa từng checkbox sau đó. Danh sách chia trang 100 dòng để không treo truyện dài; lựa chọn giữ nguyên khi đổi trang. Số thứ tự là vị trí trong Editor; ID gửi đi vẫn là UUID, không phụ thuộc tên hay thứ tự chương.

**Gửi chương chưa gửi** chỉ gửi những chương chưa có mapping. **Gửi các chương đã thay đổi** bao gồm cả chương mới và chương đã gửi nhưng sửa lại. Gửi lại một chương có cùng ID không tạo bản trùng: kết quả phân biệt Tạo mới / Cập nhật / Không đổi và hiển thị xung đột riêng. Ví dụ gửi 1–20 rồi 15–25: chỉ thêm 21–25, bỏ qua 15–20 nếu nội dung không đổi. Khi cần thay nội dung chương 15 đã gửi, bật **Cho phép ghi đè chương đã gửi** rồi gửi chương đó; LilyBeta phải hỗ trợ cờ batch `overwriteExisting` trên integration API.
