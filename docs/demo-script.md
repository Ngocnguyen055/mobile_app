# Kịch bản demo Mobile

## Chuẩn bị

- MongoDB truy cập được, API chạy ở cổng 4000.
- Development build đã cài trên ít nhất một emulator. Phần chat offline nên có hai emulator/điện thoại.
- `.env` dùng đúng URL: emulator là `10.0.2.2`, điện thoại thật là IP LAN hoặc HTTPS public.
- Đã chạy `npm.cmd run seed`.
- Tài khoản An, Bình, Chi dùng mật khẩu `StudentDemo123!`.
- Xóa/ghi chú rõ dữ liệu thử cũ để demo có kết quả dễ quan sát.

Không cần signaling, relay, web peer hoặc server DS01 cho demo repository này.

## Phần 1 — đăng nhập và lịch cá nhân

1. Đăng nhập Bình; xác nhận màn hình mở đầu là **Lịch của tôi**.
2. Chuyển Ngày/Tuần/Tháng; chỉ ra thứ `T2...CN`, định dạng `dd/MM/yyyy` và nhãn Hôm nay chỉ xuất hiện đúng ngày hiện tại.
3. Chọn một ngày khác, bấm **Thêm sự kiện**.
4. Nhập Nội dung sự kiện, dùng date/time picker cho bắt đầu/kết thúc, chọn mốc nhắc rồi lưu.
5. Mở lại để sửa, sau đó xóa; giải thích reminder cũ được cập nhật/hủy.
6. Chuyển bộ lọc Tất cả/Cá nhân/Dự án và giải thích lịch dự án chỉ đọc từ màn hình lịch tổng.

## Phần 2 — dự án và phân quyền

1. An tạo một dự án phân cấp và trở thành Giám đốc.
2. Trong Thành viên, thêm Bình và Chi bằng email; chỉ ra thứ tự Giám đốc → Trưởng phòng → Nhân viên.
3. Tạo dự án con, tìm Bình trong dropdown và bổ nhiệm Trưởng phòng.
4. Vào dự án con, thêm Chi từ danh sách thành viên dự án tổng.
5. Bình tạo task có ngày giờ bắt đầu/kết thúc, phân công Chi.
6. Chi đăng nhập: xem task và chỉ cập nhật task của mình; thử thao tác quản lý không được phép để chứng minh API từ chối.
7. Mở Tiến độ, bung danh sách task từng người; chỉ ra chưa làm/đang làm/hoàn thành/quá hạn.
8. An lưu trữ dự án; xác nhận chỉ đọc. Khôi phục và chọn chính sách dự án con.

## Phần 3 — thảo luận và thông báo

1. Đăng bài trong dự án kèm ảnh/tệp nhỏ.
2. User khác bình luận; tạo đủ bình luận để chứng minh vùng comment có thanh cuộn riêng.
3. Tác giả sửa nội dung của mình; manager thử ẩn/xóa nội dung vi phạm nhưng không sửa nội dung người khác.
4. Mở 🔔 Thông báo, đánh dấu đã đọc và mở dự án liên quan.

## Phần 4 — chat 1:1 giao offline

1. Trên thiết bị A, Bình mở **Tin nhắn**, tìm `an@example.test` và mở hội thoại.
2. Giữ thiết bị B/An chưa mở app. Bình gửi text và một tệp nhỏ.
3. Chỉ ra trạng thái `Đã gửi`; đây là tin đã được lưu để giao, không phải online P2P.
4. Mở app trên thiết bị B và đăng nhập An. Chờ đồng bộ; tin phải xuất hiện.
5. An mở hội thoại; thiết bị A làm mới/đồng bộ và thấy trạng thái Đã nhận/Đã xem.
6. Nhấn nút thông tin để xem ảnh/tệp đã gửi.
7. Chặn Bình từ An; thử gửi mới và ghi lại lỗi. Bỏ chặn để tiếp tục.
8. Nhấn giữ hội thoại ở danh sách để thử Xóa hoặc Chặn; giải thích xóa chỉ áp dụng phía hiện tại.

## Phần 5 — chat nhóm và thay đổi thành viên

1. Mở tab Chat của dự án có An/Bình/Chi, gửi text và tệp.
2. Tắt app của Chi, gửi thêm một tin, sau đó mở lại Chi để kiểm tra sync.
3. Giám đốc loại Chi khỏi dự án.
4. Gửi tin nhóm mới; Chi không được sync tin mới hoặc tải tệp mới, nhưng SQLite cũ trên máy vẫn giữ lịch sử trước đó.

## Phần 6 — lỗi và phục hồi

1. Dừng API trong khi app còn mở.
2. Gửi một tin text 1:1. Bubble phải được giữ trong SQLite/outbox và giao diện báo đồng bộ tạm gián đoạn.
3. Khởi động lại API; trong vài giây outbox tự retry.
4. Khởi động lại Mobile; lịch sử SQLite và cursor phải được phục hồi, không tạo bubble trùng.

## Bằng chứng cần nhóm tự thu

- Ảnh hai thiết bị của chat offline trước/sau khi người nhận mở app.
- Log API/Mongo cho cùng Message ID và trạng thái queued → delivered → read.
- Ảnh block, xóa hội thoại, ảnh/tệp và chat nhóm sau thay membership.
- Ảnh quyền của ba vai trò, task picker, tiến độ, archive và notification.
- Kết quả `typecheck`, `lint`, `test`, Android export/build và thời gian phép đo hiệu năng.

Chỉ đưa ảnh/log thật vào báo cáo. Android JavaScript export không chứng minh APK đã cài được; emulator đơn không chứng minh chat hai thiết bị.
