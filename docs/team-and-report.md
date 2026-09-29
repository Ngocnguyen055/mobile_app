# Phân công nhóm ba người

| Thành viên                | Trách nhiệm chính                                      | Phần giao và kiểm chứng chéo                                  |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Sinh viên 1 (trưởng nhóm) | Giao thức chung, signaling, relay, tích hợp PeerClient | Review Android chat, test DIRECT và log hai mạng              |
| Sinh viên 2               | Android Expo, SQLite, notification, Google Calendar    | Test API, demo task/lịch, bằng chứng OAuth thật               |
| Sinh viên 3               | REST API MongoDB, web peer, deploy/docs/test           | Test ACL, đồng thời/version, benchmark và tài liệu triển khai |

Tất cả thành viên cùng chạy demo ba peer, ghi log thật và review PR của người khác. Điền tên/MSSV thật trước khi nộp.

## Dàn ý báo cáo DS01

1. Bài toán, yêu cầu và phạm vi; phân biệt app Mobile với peer demo web.
2. Kiến trúc hệ thống và sơ đồ deployment: API/Mongo, signaling, relay, Android/web.
3. Thiết kế Peer ID, đăng ký, heartbeat, discovery, session, nhóm/version và offline.
4. NAT, ICE, STUN, TURN, lựa chọn WebRTC DataChannel và relay tầng ứng dụng; giới hạn khi không có TURN.
5. Envelope, Message ID, ACK ứng dụng, timeout/retry, dedupe, thứ tự, trạng thái per recipient, SQLite.
6. Luồng DIRECT và bằng chứng không qua relay; luồng RELAY và log `FORWARD` đối chiếu ID.
7. Xử lý lỗi: peer tắt, relay mất, restart, mất direct, xung đột nhóm.
8. Kiểm thử: môi trường, ca chức năng, đồng thời, bảo mật, hiệu năng; chỉ điền số đo/ảnh/log đã lấy.
9. Đánh giá giới hạn: nhóm/signaling RAM, không giao offline, không TURN, OAuth phụ thuộc cấu hình ngoài, quyền truy cập web demo.
10. Phân công, bài học và hướng phát triển.
