# Fixture "vàng" cho đo precision/recall xưng hô

Mỗi file `.json` trong thư mục này là một chương đã được **người kiểm tra bằng
mắt** xác nhận: chỗ nào xưng hô đúng, chỗ nào sai và từ đúng phải là gì.

## Cách đánh dấu (định dạng `annotated`)

Thay vì tự đếm vị trí ký tự (dễ đếm sai), đánh dấu ngay trong văn bản bằng
`{{...}}`:

- `{{nàng}}` — từ này **đúng**, không được báo lỗi.
- `{{ta=>thiếp}}` — từ hiện tại trong bản edited là `ta`, nhưng **phải là**
  `thiếp` mới đúng. Script sẽ tự tính vị trí ký tự.

Chỉ cần đánh dấu những từ xưng hô/ngôi nhân vật mà bạn đã tự tay kiểm tra kỹ —
**đánh dấu càng đủ càng tốt**: nếu bộ QA báo lỗi ở một từ xưng hô mà bạn
chưa đánh dấu trong file, script sẽ tính đó là báo sai (FP), vì nó không biết
bạn có bỏ sót cố ý hay không.

## Cấu trúc file

```json
{
  "chapter": "c012",
  "annotated": "Nàng nhìn hắn, khẽ nói: “{{ta=>thiếp}} thật xin lỗi huynh.” Một lúc sau, {{chàng}} vẫn im lặng.",
  "qt_raw": "",
  "rules": [
    { "speaker": "...", "listener": "...", "self_word": "...", "target_word": "..." }
  ]
}
```

- `chapter`: tên/số chương, chỉ để hiện trong bảng kết quả.
- `annotated`: toàn văn chương (hoặc đoạn chương) kèm đánh dấu `{{...}}`.
- `qt_raw`: để trống cho Task 0, dùng ở Task 1 sau.
- `rules`: đúng ma trận xưng hô (`contextual_pronoun_rules`) áp dụng cho đoạn này.

## Chạy đo

```bash
npm run test:pronoun-qa
```

In ra precision / recall / tỷ lệ sửa sai theo từng fixture và tổng.
