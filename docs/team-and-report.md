# Phân công nhóm ba người và dàn ý báo cáo

## Phân công đề xuất

| Thành viên | Phụ trách chính | Đầu ra cần bàn giao |
| --- | --- | --- |
| Thành viên 1 | Mobile lịch/task/reminder, UI và build Android | màn hình, picker, notification, APK/dev build, ảnh thiết bị |
| Thành viên 2 | API/MongoDB, auth, dự án phân cấp và phân quyền | schema, route/service, migration, log tích hợp Atlas/local |
| Thành viên 3 | Chat offline, thảo luận/file, test và tài liệu | SQLite/outbox/sync, multipart, test plan, demo/evidence |

Cả ba cùng review code và chạy kịch bản tích hợp. Người phụ trách không phải người duy nhất hiểu module: mỗi phần cần ít nhất một reviewer và một hướng dẫn chạy lại.

## Checklist phối hợp

- Thống nhất `.env.example`, không gửi secret qua Git.
- Mỗi pull request ghi schema/API/UI bị ảnh hưởng và migration nếu có.
- Không đổi trực tiếp database production để “sửa nhanh”.
- Sau thay dependency native, báo nhóm build lại development client.
- Trước demo, khóa commit/tag và chạy lại toàn bộ lệnh kiểm tra trên chính commit đó.
- Bằng chứng ghi rõ ai chạy, ngày giờ, thiết bị, database và mạng.

## Dàn ý báo cáo Mobile

1. Bài toán và người dùng mục tiêu.
2. Yêu cầu chức năng và phi chức năng.
3. Công nghệ và lý do chọn React Native/Expo development build, Express, MongoDB, SQLite.
4. Kiến trúc Mobile → REST API → MongoDB và dữ liệu cục bộ.
5. Mô hình dữ liệu và quan hệ dự án phân cấp.
6. Phân quyền Giám đốc/Trưởng phòng/Nhân viên; kiểm tra quyền ở server.
7. Luồng task, lịch Việt Nam và cập nhật reminder.
8. Thảo luận, bình luận, file và moderation.
9. Chat 1:1/nhóm store-and-forward, outbox, cursor, chống trùng và trạng thái giao/đọc.
10. Xử lý lỗi, conflict version, block và kiểm tra tệp.
11. Chiến lược kiểm thử: unit/API/SQLite/thiết bị và các giới hạn của từng loại bằng chứng.
12. Kết quả thực nghiệm thật: bảng test, ảnh emulator/điện thoại, log API/Mongo và phép đo hiệu năng.
13. Hạn chế: polling foreground, chưa E2EE, GridFS/Atlas có giới hạn tổng dung lượng, chưa push/background.
14. Hướng phát triển: Google Calendar OAuth, push notification, object storage, E2EE.
15. Phân công, bài học và kết luận.

## Nguyên tắc trình bày kết quả

- Chỉ ghi “đã chạy” khi có output/ảnh/log của lần chạy hiện tại.
- Typecheck, unit test và export JavaScript không chứng minh cùng một điều với cài APK.
- Mock database không chứng minh transaction thật; cần replica set local hoặc Atlas test.
- Một emulator không chứng minh luồng chat offline hai thiết bị.
- Google Calendar là hướng phát triển, không mô tả như tính năng đã tích hợp.

## Bằng chứng tối thiểu nên có

- Output `typecheck`, `lint`, `test`, Android export và Gradle build.
- Đăng ký/đăng nhập và CRUD lịch/task trên Android.
- Ba tài khoản với quyền khác nhau trong dự án phân cấp.
- Hai thiết bị cho queued → delivered → read, mất API → retry và khôi phục SQLite.
- Chat nhóm trước/sau khi loại thành viên.
- Multipart đúng/sai kích thước và kiểm tra quyền tải.
- Kết quả migration dry-run trên bản sao database nếu dùng dữ liệu cũ.
- Kết quả phép đo hiệu năng có môi trường và phương pháp đầy đủ.
