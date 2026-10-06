Các tệp trong thư mục này chỉ ghi bằng chứng thực sự đã thu được:

- `test-run.txt`: kết quả test tự động và kiểm thử Calendar API trên Atlas.
- `direct-chat-2026-10-05.txt`: kết quả thật của test/typecheck/lint/build cho chat 1:1, lần đọc `GET /contacts` trên MongoDB đang cấu hình và kiểm tra UI bằng ADB.
- `mobile-direct-chat-2026-10-05.png`: màn hình hội thoại riêng trên Pixel 7 emulator với An đang offline; ảnh xác nhận UI và chính sách khóa gửi offline, không chứng minh gửi/ACK/DIRECT/RELAY với peer thứ hai.
- `benchmark.txt`: phép đo relay localhost đã chạy.
- `mobile-login-2026-09-27.png`: development build mới mở trên Android emulator tới màn hình đăng nhập. Ảnh này không chứng minh màn hình lịch sau đăng nhập hoặc notification.
- `calendar-event-create-modal-2026-09-28.png`: modal tạo sự kiện gần toàn màn hình trên Android emulator.
- `calendar-event-picker-2026-09-28.png`: native date spinner mở phía trên modal tạo sự kiện.
- `calendar-event-time-picker-2026-09-28.png`: native time spinner 24 giờ sau bước chọn ngày.
- `calendar-event-edit-modal-2026-09-28.png`: modal sửa sự kiện với footer `Hủy` / `Lưu thay đổi`.
- `task-range-fields-2026-09-28.png`: form tạo task trên Android có hai trường `Bắt đầu` và `Kết thúc (deadline)`.
- `task-start-picker-2026-09-28.png` và `task-start-time-picker-2026-09-28.png`: popup ngày và popup giờ 24 giờ của trường bắt đầu.
- `task-end-picker-2026-09-28.png` và `task-end-time-picker-2026-09-28.png`: popup ngày và popup giờ 24 giờ của trường kết thúc.
- `task-range-saved-2026-09-28.png`: task kiểm thử tạm xuất hiện lại trong danh sách với cả hai mốc sau khi API tải lại dự án. Bản ghi tạm đã được xóa ngay sau khi chụp và UI Automator xác nhận không còn trong danh sách.
- `calendar-scope-sticky-2026-09-28.png`: sau khi cuộn lịch chính, khối `Lịch của tôi / Hiển thị` vẫn cố định và chỉ có ba phạm vi `Tất cả`, `Cá nhân`, `Dự án`; ảnh cũng cho thấy `Tất cả` có `+ Thêm sự kiện` và mục dự án dùng `Xem / sửa`.
- `calendar-project-scope-2026-09-28.png`: phạm vi `Dự án` đang được chọn; lịch chỉ hiển thị mục thuộc dự án và không có nút thêm sự kiện hoặc task trong phần ngày đã chọn.
- `project-toolbar-sticky-2026-09-28.png`: danh sách task đã được cuộn nhưng thanh `← Danh sách`, tên dự án và hàng tab dự án vẫn cố định phía trên.
- `project-calendar-readonly-2026-09-28.png`: tab `Lịch` bên trong dự án hiển thị lịch và mục đã có, nhưng không cung cấp nút tạo sự kiện hoặc task.
- `project-event-navigation-2026-09-28.png`: sau khi chọn `Xem / sửa` trên sự kiện dự án ở lịch chính, app mở editor của đúng sự kiện và hiển thị `Thuộc lịch: Test` trong ngữ cảnh dự án.

Nhóm vẫn cần bổ sung ảnh/log DIRECT, RELAY hai mạng, notification thực tế và Google OAuth sau khi tự chạy các kịch bản tương ứng.
