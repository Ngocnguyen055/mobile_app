# Bằng chứng kiểm thử

Thư mục này chỉ giữ bằng chứng của ứng dụng Mobile hiện tại. Log cũ thuộc repository DS01/signaling/relay đã được loại bỏ để không dùng nhầm trong báo cáo.

## Ảnh đã có

- `mobile-cleanup-2026-11-01.txt`: typecheck, lint, 82 test, Android JavaScript export, Gradle debug APK và audit dependency sau khi tách Mobile-only; chưa chứng minh cài/chạy emulator hoặc Atlas.

- `mobile-login-2026-09-27.png`: development build mở trên Android emulator tới màn hình đăng nhập.
- `calendar-event-create-modal-2026-09-28.png`: modal tạo sự kiện gần toàn màn hình.
- `calendar-event-picker-2026-09-28.png`: popup chọn ngày native.
- `calendar-event-time-picker-2026-09-28.png`: popup chọn giờ 24 giờ.
- `calendar-event-edit-modal-2026-09-28.png`: modal sửa sự kiện.
- `task-range-fields-2026-09-28.png`: task có Bắt đầu và Kết thúc.
- `task-start-picker-2026-09-28.png`, `task-start-time-picker-2026-09-28.png`: picker bắt đầu.
- `task-end-picker-2026-09-28.png`, `task-end-time-picker-2026-09-28.png`: picker kết thúc.
- `task-range-saved-2026-09-28.png`: task đã lưu hiển thị lại hai mốc thời gian.
- `calendar-scope-sticky-2026-09-28.png`: toolbar lịch cố định và ba phạm vi.
- `calendar-project-scope-2026-09-28.png`: phạm vi Dự án không có nút tạo.
- `project-toolbar-sticky-2026-09-28.png`: toolbar dự án cố định khi cuộn.
- `project-calendar-readonly-2026-09-28.png`: lịch trong dự án chỉ đọc/tương tác với mục có sẵn.
- `project-event-navigation-2026-09-28.png`: mở đúng editor sự kiện dự án.
- `mobile-direct-chat-2026-10-05.png`: giao diện hội thoại 1:1 cũ trên emulator; chỉ dùng làm bằng chứng UI lịch sử, không chứng minh store-and-forward hiện tại.

## Quy tắc bổ sung bằng chứng

- Tên file có ngày chạy thật.
- File text ghi command, exit code, môi trường và giới hạn của kết quả.
- Ảnh không được dùng để suy ra chức năng ở ngoài khung hình.
- Export JavaScript không được ghi thành build/cài APK thành công.
- Test mock không được ghi thành Atlas/transaction thật.
- Chat offline cần ảnh/log của hai tài khoản trên hai thiết bị/emulator.
- Google Calendar chỉ là hướng phát triển; không cần và không được tạo bằng chứng giả cho tính năng chưa có.

Các bằng chứng còn thiếu được liệt kê trong [test-plan.md](../test-plan.md) và [demo-script.md](../demo-script.md).
