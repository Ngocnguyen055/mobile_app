# Kế hoạch kiểm thử

## Phân biệt phạm vi

- **Tự động trên máy phát triển:** domain policy, API route/service với mock database, SQLite in-memory, typecheck, lint và Android JavaScript export.
- **Tích hợp Mongo thật:** các script `test:*` dùng URI trong `.env`; cần database test và quyền phù hợp.
- **Thủ công trên thiết bị:** UI/picker/notification, lifecycle Android, hai tài khoản/two-device chat, mạng yếu và APK.

Không xem unit test hoặc export là bằng chứng OAuth, notification hay build APK đã hoạt động trên thiết bị thật.

## Ma trận ca kiểm thử

| ID | Loại | Tình huống | Kỳ vọng | Bằng chứng |
| --- | --- | --- | --- | --- |
| F1 | Chức năng | Đăng ký, đăng nhập đúng/sai mật khẩu | JWT chỉ cấp cho credential hợp lệ | `api-auth.test.ts` + API thật |
| F2 | Chức năng | CRUD sự kiện cá nhân bằng picker | Lưu đúng start/end, sửa/xóa được, lịch Việt Nam | calendar tests + ảnh thiết bị |
| F3 | Chức năng | Tạo task có start/end và phân công | `startsAt <= dueAt`, lịch/progress cập nhật | API/task tests + ảnh |
| F4 | Chức năng | Reminder khi deadline đổi/hoàn thành | Hủy ID cũ, lập lại hoặc không còn notification | test policy + thiết bị |
| F5 | Chức năng | Dự án phân cấp và ba vai trò | Giám đốc/Trưởng phòng/Nhân viên đúng ACL | hierarchy tests + 3 login |
| F6 | Chức năng | Archive/restore tổng và dự án con | Archived chỉ đọc; cascade/restore đúng lựa chọn | hierarchy route test + API thật |
| F7 | Chức năng | Bài, bình luận, file và moderation | Tác giả sửa mình; manager chỉ ẩn/xóa đúng phạm vi | discussion tests + UI |
| F8 | Chức năng | Chat 1:1 khi người nhận chưa mở app | queued trong Mongo, sync sau, delivered/read | persistence tests + 2 thiết bị |
| F9 | Chức năng | Chat nhóm khi một user offline | Fan-out theo member; user sync sau | persistence test + 3 login |
| F10 | Chức năng | Tìm email, block và xóa hội thoại | Không tải danh bạ; block server-side; xóa một phía | direct-chat tests + UI |
| C1 | Đồng thời | Hai manager PATCH cùng version cũ | Một request thành công, request còn lại 409 | API test + Mongo replica set |
| C2 | Đồng thời | Outbox retry đồng thời cùng Message ID | Unique `(messageId, receiver)`, không bubble trùng | persistence test + DB query |
| R1 | Lỗi/phục hồi | Dừng API khi gửi text, sau đó mở lại | SQLite/outbox giữ tin và tự retry | thủ công 2 thiết bị |
| R2 | Lỗi/phục hồi | Force stop/restart app giữa lúc sync | Cursor phục hồi, upsert idempotent, không mất lịch sử | SQLite test + thiết bị |
| S1 | Dữ liệu sai/bảo mật | Giả sender/receiver/group hoặc ID sai | JWT quyết định sender; schema/ACL từ chối | API persistence/security tests |
| S2 | Dữ liệu sai/bảo mật | User ngoài dự án tải tệp/đọc group | 403/404, không lộ metadata/bytes | discussion/chat tests |
| S3 | Dữ liệu sai/bảo mật | File quá 5 MiB hoặc quá 3 file | 400, không tạo message nửa chừng | multipart API test |
| P1 | Hiệu năng | Sync 1.000 delivery, page/cursor | Ghi p50/p95/max và RAM thật; không đặt ngưỡng giả | script đo + file evidence |

## Lệnh tự động

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run export -w @student-planner/mobile
```

Tích hợp Mongo thật:

```powershell
npm.cmd run test:calendar-api
npm.cmd run test:contacts-api
npm.cmd run test:hierarchy-api
```

Luôn ghi ngày, commit, Node/JDK/Android version, database dùng local hay Atlas và toàn bộ output. Không chép số test cũ nếu vừa xóa/thêm test.

## Kiểm tra chat thủ công hai thiết bị

1. Dùng hai emulator hoặc một emulator + điện thoại, mỗi máy một tài khoản.
2. Người nhận đóng app; người gửi gửi text/tệp và chụp trạng thái queued.
3. Mở người nhận, đợi polling, chụp message và trạng thái phía gửi.
4. Tắt API, gửi text, kiểm tra outbox; mở API và kiểm tra retry.
5. Gửi lại cùng Message ID bằng công cụ HTTP ở môi trường test, đếm record Mongo.
6. Block, giả JWT/user target, thử file quá giới hạn và user ngoài group.
7. Tạo nhóm ba user, loại một user rồi gửi tin mới; xác nhận user bị loại không sync được.

## Phép đo hiệu năng

Repository hiện chưa có script benchmark sau khi tách mã DS01. Khi nhóm bổ sung, phép đo nên:

- tạo database test riêng;
- seed tối thiểu 1.000 delivery cho một user;
- gọi sync theo page như Mobile thực tế;
- đo từ client bằng `performance.now()` sau một lượt warm-up;
- báo p50/p95/max, page size, số record, cấu hình máy và Atlas/local;
- dọn đúng dữ liệu test ở cuối.

Không đưa con số vào báo cáo trước khi script được chạy và output được lưu trong `docs/evidence/`.

## Tiêu chí trước khi demo

- Typecheck/lint/test/export đều xanh ở commit demo.
- API `/health` và đăng nhập Atlas/local thành công.
- Có ít nhất một lần build/cài Android thành công sau khi gỡ các native dependency cũ.
- Hai thiết bị chứng minh chat offline, block và attachment.
- Ba tài khoản chứng minh ACL và thay đổi membership nhóm.
- Ảnh/log có timestamp, không dùng ảnh giả hoặc kết quả từ kiến trúc DS01 cũ để chứng minh Mobile hiện tại.
