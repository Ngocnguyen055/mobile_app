# Phân công nhóm ba người

| Thành viên                | Trách nhiệm chính                                      | Phần giao và kiểm chứng chéo                                  |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Sinh viên 1 (trưởng nhóm) | Giao thức chung, signaling, relay, tích hợp PeerClient | Review Android chat, test DIRECT và log hai mạng              |
| Sinh viên 2               | Android Expo, SQLite, notification, Google Calendar    | Test API, demo task/lịch, bằng chứng OAuth thật               |
| Sinh viên 3               | REST API MongoDB, web peer, deploy/docs/test           | Test ACL, đồng thời/version, benchmark và tài liệu triển khai |

Tất cả thành viên cùng chạy demo ba peer, ghi log thật và review PR của người khác. Điền tên/MSSV thật trước khi nộp.

Với dự án phân cấp: sinh viên 1 kiểm tra tự đồng bộ/thu hồi nhóm và restart signaling; sinh viên 2 kiểm tra drawer, các màn hình theo vai trò, bình luận/tệp/inbox trên Android; sinh viên 3 chạy migration trên DB thử nghiệm, transaction/conflict và API bằng `test:hierarchy-api`. Đối chiếu quyền bằng ba tài khoản trước khi đưa vào báo cáo.

## Dàn ý báo cáo DS01

1. Bài toán, yêu cầu và phạm vi; phân biệt app Mobile với peer demo web.
2. Kiến trúc hệ thống và sơ đồ deployment: API/Mongo, signaling, relay, Android/web.
3. Thiết kế Peer ID, đăng ký, heartbeat, discovery, session, nhóm/version và offline.
4. NAT, ICE, STUN, TURN, lựa chọn WebRTC DataChannel và relay tầng ứng dụng; giới hạn khi không có TURN.
5. Envelope, Message ID, ACK ứng dụng, timeout/retry, dedupe, thứ tự, trạng thái per recipient, SQLite.
6. Luồng DIRECT và bằng chứng không qua relay; luồng RELAY và log `FORWARD` đối chiếu ID.
7. Xử lý lỗi: peer tắt, relay mất, restart, mất direct, xung đột nhóm.
8. Kiểm thử: môi trường, ca chức năng, đồng thời, bảo mật, hiệu năng; chỉ điền số đo/ảnh/log đã lấy.
9. Đánh giá giới hạn: nhóm web demo/RAM so với nhóm dự án/Mongo, hai tầng phân cấp, phụ thuộc dịch vụ kiểm tra quyền cho chat nhóm, không giao offline, không TURN, OAuth phụ thuộc cấu hình ngoài, quyền truy cập web demo.
10. Phân công, bài học và hướng phát triển.
