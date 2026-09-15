# Đóng gói app desktop (LilyNovel)

Pipeline biến source code thành file cài đặt thật (`.dmg` cho macOS, `.msi`/`.exe`
cho Windows) — chạy tự động qua GitHub Actions (`.github/workflows/desktop-release.yml`),
hoặc thủ công trên máy mình để test.

## Vì sao cần bước riêng (khác với `tauri dev`)

`tauri dev` (dùng suốt quá trình phát triển) spawn sidecar dịch AI bằng cách gọi thẳng
`tools/nmt/.venv/bin/python3` — chỉ chạy được trên máy đã cài venv đó. Bản đóng gói cho
người khác tải về cần:

1. **Đóng băng Python thành 1 file chạy độc lập** (không cần cài Python/venv gì cả) — dùng
   PyInstaller, `--onefile` để khớp đúng quy ước "sidecar" 1-file của Tauri.
2. **Model dịch AI** (`ct2_models/`, `pronoun_clf/`, ~424MB) đi kèm app dưới dạng
   Tauri "resources" (copy vào bundle, không nhúng vào file .exe/binary).
3. Rust (`src-tauri/src/lib.rs`) tách 2 nhánh: `tauri dev` vẫn dùng venv như cũ (không đổi
   gì thói quen phát triển hiện tại), bản release dùng sidecar đã đóng băng + đường dẫn
   resources qua biến môi trường `NMT_MODELS_DIR`/`NMT_PRONOUN_CLF_DIR`.

## Chạy thủ công trên máy mình (macOS)

```bash
cd tools/nmt
.venv/bin/pip install -r requirements-convert.txt pyinstaller
.venv/bin/pip install torch  # cần cho convert_ct2.py, xem requirements-convert.txt
.venv/bin/python3 prepare_models.py        # tải/convert toàn bộ model
.venv/bin/pyinstaller --name nmt-server --onefile --noconfirm server.py

cd ..
mkdir -p src-tauri/binaries src-tauri/resources
cp tools/nmt/dist/nmt-server src-tauri/binaries/nmt-server-aarch64-apple-darwin
cp -R tools/nmt/ct2_models src-tauri/resources/ct2_models
cp -R tools/nmt/pronoun_clf src-tauri/resources/pronoun_clf

npx tauri build
```

Kết quả: `src-tauri/target/release/bundle/macos/LilyNovel.app` +
`src-tauri/target/release/bundle/dmg/LilyNovel_<version>_aarch64.dmg`.

**Đã test end-to-end trên máy này (macOS, Apple Silicon)**: mở `.app` đóng gói, sidecar tự
khởi động (không cần venv), dịch AI + QA xưng hô đều chạy đúng.

## GitHub Actions (macOS + Windows tự động)

`.github/workflows/desktop-release.yml` chạy đúng các bước trên, trên 2 runner riêng
(`macos-latest` = Apple Silicon thật, `windows-latest` = Windows thật — không phải
cross-compile, mỗi OS build trên chính OS đó).

- Push tag `v*` (ví dụ `git tag v0.1.0 && git push origin v0.1.0`) → build cả 2 nền tảng,
  tạo **draft GitHub Release** đính kèm cả 2 file cài đặt.
- Chạy tay qua "Run workflow" (workflow_dispatch) → chỉ build + upload artifact để test,
  không tạo release.

**Chưa test được trên Windows thật** (không có máy Windows) — pipeline được thiết kế đúng
theo tài liệu PyInstaller/Tauri, nhưng lần chạy CI đầu tiên nên được coi là một lần kiểm
thử thật, không giả định chắc chắn thành công 100%. Nếu lỗi, khả năng cao nằm ở
`ctranslate2`/`sentencepiece` (thư viện C++ extension) khi bị PyInstaller đóng băng trên
Windows — cần xem log CI cụ thể.

## Trang tải về trên web

Xem `src/pages/Download.jsx` (route `/download`) — đọc danh sách release mới nhất từ GitHub
Releases API, hiện nút tải đúng file theo hệ điều hành.
