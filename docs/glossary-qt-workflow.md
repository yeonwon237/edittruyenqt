# Chuẩn bị glossary trước QT và AI Edit

1. Chọn chương có văn bản gốc tiếng Trung.
2. Trong bảng Glossary, bấm **Phát hiện Glossary (Máy + AI)**. Cũng có thể mở từ **Chuẩn bị & dịch toàn truyện**.
3. Máy tìm cụm lặp, từ xưng hô, hậu tố thuật ngữ, tên trong 《…》, cụm tách từ và những chỗ QT phải đọc rời/đoán tên.
4. AI kiểm tra ứng viên và tự đọc lại từng đoạn để tìm thêm trong cùng một yêu cầu. Khoảng 6.000 chữ gọi AI một lần, tương đương nhịp gọi của cách cũ; có tiến độ và nút dừng sau lượt hiện tại.
5. Duyệt bản Việt, loại từ và câu gốc. Các bản dịch mâu thuẫn được đánh dấu. Nhóm **Cần xem lại / AI loại** giữ cả ứng viên chưa được kiểm tra hoặc AI đề nghị bỏ; có thể nhập bản Việt và chọn lại. Không mục nào tự được chọn hoặc lưu.
6. Lưu mục đã chọn, rồi bấm **Tự dịch** để tạo lại QT. Glossary mới cũng áp dụng cho lần tạo QT hàng loạt tiếp theo.
7. Sau khi kiểm tra QT, dùng **AI Edit**. Tên/thuật ngữ được giữ theo glossary; xưng hô áp dụng ma trận quan hệ và ngôi lời dẫn.

## Giới hạn và cách đọc kết quả

- Quét kỹ hiện chạy trên chương đang chọn. Glossary đã lưu dùng chung toàn truyện. Bộ quy ước từ chương mẫu vẫn là chức năng riêng; chưa phải quét kỹ toàn bộ truyện.
- Các đoạn tối đa 6.000 ký tự, chồng nhau 120 ký tự để hạn chế mất thuật ngữ ở ranh giới.
- Mỗi đoạn gửi tối đa 50 gợi ý máy có tín hiệu tốt trong cùng yêu cầu đọc nguồn. Chỉ các gợi ý mạnh được đưa ra duyệt để tránh hàng trăm cụm thường và cụm chồng lấn; AI vẫn tự đọc toàn bộ đoạn nguồn để bổ sung.
- Nếu một lượt API lỗi, kết quả trước đó và ứng viên máy được giữ lại, cùng cảnh báo phần chưa hoàn tất. Dừng không hủy yêu cầu API đã gửi.
- Tỷ lệ phần trăm trên hàng thuật ngữ là AI tự đánh giá, không phải xác suất đã được kiểm chứng.
- Tỷ lệ ký tự có cách đọc của QT không phải độ chính xác bản dịch. QT còn báo số chữ phải đọc rời, chữ trong tên máy đoán và chữ chưa biết.
- Tên/cụm đã khóa được bảo vệ trước từ điển và bước đảo câu. Đại từ một chữ thuộc loại Xưng hô là mặc định: không làm vỡ cụm số nhiều như 我们. Glossary không thay thế việc nhận biết người nói/người nghe.
- Kết quả chưa lưu chỉ nằm trong phiên mở hộp thoại. Chưa có kho ứng viên chưa duyệt bền vững qua các phiên hoặc thống kê tần suất toàn truyện.

## Kiểm thử

`npm run test:glossary` kiểm tra việc lấy ứng viên, ranh giới đoạn, chống thuật ngữ không có trong nguồn, xung đột phản hồi, dừng/lỗi API và thứ tự ưu tiên glossary với từ điển QT thật. Phần AI dùng phản hồi giả lập; cần đối chiếu các chương thực tế để đo số mục đúng và số mục bị bỏ sót.
