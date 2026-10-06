# Giao thức DS01

## Kết nối và danh tính

1. Peer nối signaling, gửi `peer:register {peerId, identityProof}`. ID 24 ký tự hex (Android user ID Mongo) phải có API JWT với `sub` khớp. Peer web dùng secret ngẫu nhiên tối thiểu 16 ký tự; signaling giữ hash trong RAM và từ chối ID trùng hoặc secret khác. ID đang online là duy nhất.
2. Signaling trả `token`, danh sách `peers`, `groups`. Peer gửi `peer:heartbeat` mỗi 10 giây; server timeout 30 giây, phát `presence` khi danh sách đổi. `peer:list` và `presence` chỉ trả/phát cho socket đã đăng ký hiện hành. Socket.IO cũng phát hiện disconnect.
3. Relay nhận token ký bằng `PEER_SECRET` từ signaling qua Socket.IO auth. Một Peer ID ánh xạ tới socket hiện hành. Kết nối mới cùng ID đóng kết nối cũ.
4. Nhóm demo web dùng `group:create`, `group:change {groupId,memberId,action,version}` ở signaling, owner thêm và owner hoặc chính thành viên xóa. `version` chặn sửa từ bản cũ; nhóm demo nằm trong RAM. **Nhóm dự án Android** có `projectId`, UUID ổn định và `chatRevision` lưu MongoDB; được tạo cùng dự án, membership chỉ sửa qua REST API theo vai trò. `group:change` từ client bị từ chối đối với nhóm dự án. Thành viên offline vẫn ở danh sách nhưng **không nhận tin gửi khi offline**.
5. Client đã đăng ký gọi `peer:lookup {peerId}` để tìm một peer cụ thể; Android truyền MongoDB user ID. Response gồm `peerId`, `online`, heartbeat `lastSeen` và các giao thức kết nối được hỗ trợ; offline/unknown có `lastSeen`/`connection = null`. Không trả socket ID, IP hay token của người khác. `PeerClient.lookupPeer()` kiểm tra schema của response. Danh bạ người cùng dự án lấy riêng qua REST `GET /contacts`; discovery không chuyển nội dung chat.

## Mở DIRECT và fallback

Peer gửi trước gọi `ensureDirect`. ID thấp hơn tạo offer; ID cao hơn gửi `request` để ID thấp hơn tạo offer, tránh glare khi hai bên cùng mở. `signal:send` chuyển offer/answer/ICE đúng peer, không có body chat. Mỗi cặp tạo DataChannel `ordered: true`. Nếu channel không mở sau 5 giây, gửi envelope qua relay. Khi `connectionState` failed/disconnected/closed hoặc channel close, nhãn đổi RELAY và lần gửi tiếp dùng relay. Khi DIRECT hoạt động, không gọi `relay:send` cho body đó. Nếu gửi DIRECT mà không có ACK sau 2 giây, retry qua relay tối đa hai lần nữa. Đường mạng thật có thể bị firewall/NAT chặn; STUN công cộng chỉ hỗ trợ tìm ứng viên, không đảm bảo kết nối.

## Envelope và ACK

```json
{
  "messageId": "UUID v4",
  "sessionId": "UUID v4",
  "senderId": "peer-a",
  "receiverId": "peer-b",
  "groupId": "UUID v4 nếu chat nhóm",
  "type": "text",
  "timestamp": 1760000000000,
  "body": "Xin chào",
  "mode": "DIRECT",
  "attempt": 1,
  "sequence": 1
}
```

`type: ack` có `ackFor: messageId`, `body: ""`; mỗi người nhận tự tạo ACK sau khi đã lưu message. ACK của Socket.IO server chỉ chứng minh relay nhận để chuyển tiếp, không thay ACK ứng dụng. Sender lưu `pending → sent → delivered` hoặc `failed`; nhóm có một bản ghi/trạng thái ACK cho mỗi receiver. Message ID trùng từ cùng sender bị loại khỏi lịch sử, nhưng receiver vẫn ACK lại để sender thoát retry. Có tối đa 3 attempt, mỗi attempt 2 giây chờ ACK. Nếu relay cũng mất thì báo failed, không hứa giao sau khi peer offline. `sequence` theo người gửi và cuộc trò chuyện, DataChannel ordered; lịch sử hiển thị theo timestamp rồi ID. Đồng hồ hai máy lệch có thể làm thứ tự xen kẽ khác thực tế, không có total order phân tán.

Với chat cá nhân, `groupId` có thể bị bỏ, `undefined` hoặc `null`. `groupId: ""` bị từ chối; tin nhóm vẫn phải có UUID hợp lệ. `sendDirect(receiverId, body)` dùng cùng engine gửi/ACK nhưng không gắn groupId. Lịch sử cá nhân lọc đúng A↔B, không gắn nhóm, chỉ giữ tin text; lịch sử nhóm vẫn lọc UUID nhóm. Chi tiết service, query SQL và cách gọi client nằm trong [direct-chat.md](direct-chat.md).

Relay từ chối envelope >8192 byte, body >4000 ký tự, ID sai format, sender khác peer đã xác thực, mode khác `RELAY`, receiver offline, hoặc nhóm không có cả sender và receiver. Log `REGISTER`, `DISCONNECT`, `FORWARD messageId`, `REJECT` ở relay. Signaling chỉ log `REGISTER`, `GROUP`, `offer/answer/ice/request`, không log nội dung chat. Để chứng minh DIRECT, ghi cùng Message ID trong log peer `DIRECT SEND` và kiểm tra relay **không** có `FORWARD` ID đó; để chứng minh RELAY, đối chiếu `RELAY SEND` và `FORWARD` cùng ID.

## Quyền nhóm dự án

Client gọi `project:group {projectId}` để lấy nhóm hiện tại; signaling dùng `API_INTERNAL_URL` và `x-peer-secret` để đọc API nội bộ. `Group` bổ sung `projectId?: string`, `archived?: boolean`. Signaling poll khoảng 2 giây và phát `group:update` cho cả thành viên cũ và mới; client bị loại xóa nhóm khỏi danh sách nhưng không xóa lịch sử local.

`group:authorize {groupId, otherPeerId}` kiểm tra actor đã đăng ký, cả hai thuộc nhóm và dự án chưa lưu trữ. PeerClient dùng lệnh này trước khi gửi / nhận text hoặc ACK qua DIRECT / RELAY; relay đọc lại nhóm qua signaling trước chuyển tiếp. Các truy vấn quyền không chứa chat body. Khi API hoặc signaling không sẵn sàng, tin nhóm bị từ chối thay vì dùng ACL cache cũ. Vì vậy chat nhóm vẫn cần dịch vụ kiểm tra quyền dù DataChannel đã mở. Tin 1:1 không nhóm giữ luồng hiện tại.

Sau khi xóa thành viên / lưu trữ, API và client tuân thủ giao thức từ chối tin nhóm mới. Tin đã lưu trên thiết bị không bị thu hồi; máy chủ không thể ngăn phần mềm P2P cố ý bỏ kiểm tra gửi byte trên kết nối trực tiếp. Restart signaling không đổi ID nhóm dự án đã lưu Mongo; nhóm demo RAM cần tạo lại. Xem [hierarchical-projects.md](hierarchical-projects.md).
