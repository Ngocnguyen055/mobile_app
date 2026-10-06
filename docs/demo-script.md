# Kịch bản demo DS01 và Mobile

## Chuẩn bị

1. Ghi commit, thời gian, máy, OS, IP/mạng. Chạy MongoDB, API, signaling, relay, web trong terminal riêng để thấy log. Seed ba tài khoản. Với web peer dùng ba profile riêng, ID `peer-a`, `peer-b`, `peer-c`.
2. Với Android, tạo development build và đăng nhập ba tài khoản mẫu hoặc tài khoản mới; Peer ID là `_id` của tài khoản. Cần ít nhất hai máy Android cho bằng chứng native. Kiểm tra ba endpoint `/health` và URL công khai qua điện thoại.
3. Bật ghi màn hình/log thực tế; lưu vào `docs/evidence/` và điền kết quả trong `test-plan.md`.

## Thứ tự trình diễn

1. **Discovery:** đăng ký A, B, C; xem online list và log signaling `REGISTER`. Đóng C đột ngột, chờ offline/timeout rồi mở lại C. Ghi thời gian phát hiện.
2. **DIRECT:** A chọn B, gửi Message ID được log peer `DIRECT SEND`; B hiển thị DIRECT và ACK, A hiển thị delivered. Tìm đúng ID ở log relay và xác nhận không có `FORWARD` cho ID đó. Nếu không mở DataChannel thì ghi thất bại; chưa được thay bằng ảnh relay.
3. **RELAY khác mạng:** đưa C sang 4G hoặc Wi-Fi khác, kết nối ba URL công khai. A chọn C, gửi. Nếu DIRECT vẫn mở, bật `Mô phỏng DIRECT thất bại (ép RELAY)` trên web hoặc nút ép RELAY trên Android. Đối chiếu `RELAY SEND` và relay `FORWARD` cùng ID, C ACK.
4. **Nhóm:** A tạo nhóm A/B/C, gửi tin; kiểm tra trạng thái per recipient. A thêm/xóa một thành viên bằng ô ID; B/C thấy version/member list cập nhật. Gửi gần đồng thời B→nhóm và C→nhóm, ghi thứ tự nhận.
5. **Chat 1:1 trên Mobile:** A mở `Tin nhắn`, chọn B từ danh bạ cùng dự án và gửi khi B online. Đối chiếu hai màn hình: đúng nội dung, trạng thái ACK và cùng nhãn DIRECT/RELAY. Gửi xen kẽ một tin ở tab Chat nhóm của dự án để chứng minh hai lịch sử không trộn. Force-stop rồi mở lại A để kiểm tra SQLite; đưa B offline và xác nhận composer bị khóa, không hứa giao lại tin cũ.
6. **Lỗi:** tắt B đột ngột, A gửi và chờ `failed`; B bật lại, thấy lịch sử đã lưu cục bộ, A gửi tin mới. Trong lúc DIRECT A–C đang hoạt động, tắt kết nối peer hoặc thay mạng để DataChannel mất; kiểm tra chuyển nhãn RELAY. Tắt hẳn relay, lặp gửi khi DIRECT cũng mất: tin phải failed, không giả báo delivered. Bật relay lại, gửi tin mới.
7. **Mobile:** tạo dự án, thêm hai thành viên, giao task; chọn `Bắt đầu` và `Kết thúc (deadline)` bằng hai popup native, tải lại để chứng minh hai mốc đã lưu. Thử kết thúc trước bắt đầu và ghi nhận API từ chối. Sau đó đổi status, xem tiến độ, thao tác lịch ngày/tuần/tháng, kiểm tra nhắc theo deadline `dueAt`, thảo luận, tài liệu và ngân sách. Nếu có Google credential, kết nối và đồng bộ hai lần rồi so sánh số event thật.

## Mô phỏng lỗi khả thi

- Checkbox web hoặc nút Android `ép RELAY` bỏ qua thử DIRECT cho tin mới; đây là mô phỏng đường DIRECT thất bại, không chứng minh NAT thực.
- Dừng terminal relay bằng Ctrl+C, kiểm tra tin báo failed; chạy lại `npm run dev:relay` để thử phục hồi.
- Đóng tab/force-stop Android để mô phỏng peer tắt đột ngột; theo dõi presence timeout tối đa 30 giây.
- Không xóa localStorage/SQLite trước bước restart, vì mục tiêu là chứng minh khôi phục lịch sử cục bộ.

## Phiếu bằng chứng

| Mục                                    | File do nhóm bổ sung                 | Kết quả thật                                |
| -------------------------------------- | ------------------------------------ | ------------------------------------------- |
| DIRECT Android, không relay FORWARD    | `docs/evidence/direct-android.*`     | Chưa có                                     |
| RELAY hai mạng, có FORWARD             | `docs/evidence/relay-two-networks.*` | Chưa có                                     |
| Ba peer/nhóm/ACK                       | `docs/evidence/three-peers.*`        | Chưa có                                     |
| SQLite sau restart                     | `docs/evidence/sqlite-restore.*`     | Chưa có                                     |
| UI chat 1:1 Android khi peer offline   | `docs/evidence/mobile-direct-chat-2026-10-05.png` | Có; chưa chứng minh gửi/ACK                 |
| Google Calendar trước/sau, không trùng | `docs/evidence/google-sync.*`        | Chưa có                                     |
| Benchmark đầu ra thực                  | `docs/evidence/benchmark.txt`        | Có, localhost 100 tin; cần đo thêm hai mạng |
