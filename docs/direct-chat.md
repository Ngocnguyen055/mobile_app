# Service chat cá nhân 1–1

Phần này mô tả API, discovery, lưu trữ và giao diện để chat giữa hai peer. Không có kết bạn. Android có tab `Tin nhắn` ở thanh điều hướng dưới; giao diện Chat trong từng dự án vẫn dành riêng cho nhóm dự án và tiếp tục dùng luồng cũ.

## Danh bạ REST

Client gọi `GET /contacts` với `Authorization: Bearer <JWT>`. API trả một mảng `{ id, name, email }`, gồm những tài khoản cùng tham gia ít nhất một dự án với người gọi, loại chính người gọi, loại trùng và sắp xếp theo tên/email/ID. `id` là MongoDB user ID và cũng là Peer ID khi Android đăng ký signaling. Không trả password hash, JWT hay thông tin cá nhân của người ngoài các dự án chung.

```ts
import { loadChatContacts } from '../src/mobile/api.ts';
const contacts = await loadChatContacts();
// Chọn một contact; dùng contact.id để discovery và gửi.
```

Danh bạ là phạm vi lựa chọn người của client. Đây chưa phải ACL mới cho đường truyền P2P: signaling/relay hiện vẫn cho peer đã xác thực liên lạc với peer đã đăng ký khác, kể cả peer demo web. Không có tra cứu email toàn hệ thống hoặc thao tác mời/kết bạn.

## Peer discovery

Sau `await peer.connect()`, gọi `await peer.lookupPeer(contact.id)`. Client cũng có thể gọi Socket.IO trực tiếp:

```ts
const result = await signaling.timeout(4000).emitWithAck('peer:lookup', {
  peerId: contact.id,
});
```

Response khi B online:

```json
{
  "ok": true,
  "peer": {
    "peerId": "<MongoDB user ID của B>",
    "online": true,
    "lastSeen": 1791000000000,
    "connection": {
      "transport": "webrtc-datachannel",
      "signaling": "socket.io",
      "relay": "socket.io"
    }
  }
}
```

JSON trên mô tả cấu trúc response, không phải log demo thực tế. Khi offline hoặc Peer ID chưa đăng ký, `online` là `false`, `lastSeen` và `connection` là `null`. Signaling không lưu thời điểm online cuối sau khi xóa peer khỏi registry. `lastSeen` của peer online là thời điểm heartbeat/đăng ký gần nhất theo đồng hồ server. Client phải được đăng ký bằng chính kết nối hiện hành mới query được. Payload sai hoặc query chưa xác thực trả `{ ok: false, error }`.

`connection` mô tả giao thức thiết lập kết nối được hỗ trợ; nó không chứng minh DataChannel hoặc relay đã kết nối. Không công khai socket ID, IP hay token của B. `peer:list`, `peer:lookup` và luồng `presence` chỉ dành cho socket đã đăng ký hiện hành; socket ẩn danh không nhận danh sách Peer ID online. SDP và ICE được trao đổi qua `signal:send` để WebRTC tìm đường đi; A không mở TCP socket trực tiếp tới IP công khai của B. Trạng thái online là một ảnh chụp tại thời điểm query, nên B vẫn có thể mất kết nối ngay sau đó.

## Envelope và cách gửi

`groupId` được schema chấp nhận khi bỏ trường, `undefined` hoặc `null`; UUID hợp lệ vẫn bắt buộc với tin nhóm. Chuỗi rỗng và ID nhóm sai định dạng bị từ chối. Tin nhắn cá nhân và ACK vẫn có `messageId`, `sessionId`, `senderId`, `receiverId`, `timestamp`, `sequence`, `mode` và `attempt`.

```ts
await peer.sendDirect(contact.id, 'Chào bạn');
// Tương đương gửi trên engine hiện có, không gắn groupId:
await peer.send(contact.id, 'Chào bạn');
// Engine cũng chấp nhận biểu diễn null:
await peer.send(contact.id, 'Chào bạn', null);
```

"Chat cá nhân" mô tả cuộc trò chuyện chỉ có A và B. Delivery mode vẫn có thể là DIRECT hoặc RELAY. DIRECT thử WebRTC DataChannel trước; nếu mở kênh thất bại, mất kênh hoặc chờ ACK quá hạn, các lần gửi sau dùng relay Socket.IO. DIRECT thành công không chuyển nội dung chat qua signaling/relay. Engine dùng lại ACK ứng dụng, retry giới hạn và chống trùng hiện có. `delivered` nghĩa là ứng dụng nhận đã lưu/phản hồi ACK, chưa phải đã đọc.

Group Chat vẫn gọi `sendGroup(groupId, body)`: cùng Message ID được gửi riêng tới mỗi thành viên và ACK được theo dõi từng người. Không tạo groupId giả cho chat cá nhân.

## SQLite và localStorage

`MobileStore` và `WebStore` có thêm:

```ts
await store.putDirect({ message, status: 'received' });
const history = await store.listDirect(contact.id);
```

`putDirect` chỉ chấp nhận tin text không có groupId và có người gửi/người nhận là chủ local store. Engine tự lưu tin và trạng thái qua `store.put`/`store.mark`; client dùng `peer.sendDirect` không cần lưu lại thủ công. ACK được engine xử lý mà không đưa vào lịch sử cuộc trò chuyện.

SQLite thêm cột `group_id TEXT NULL`. Khi mở database cũ, migration thêm cột và backfill groupId từ JSON payload trước khi query. Tin nhóm cũ được giữ đúng group ID; tin cá nhân cũ có trường bị bỏ hoặc null đều có SQL NULL. Query chính là:

```sql
SELECT payload, status
FROM messages
WHERE scope = ?
  AND group_id IS NULL
  AND ((sender_id = ? AND receiver_id = ?)
    OR (sender_id = ? AND receiver_id = ?))
ORDER BY timestamp, message_id, sender_id, receiver_id;
-- Parameters: [A, A, B, B, A]
```

Sau query, service đọc JSON và kiểm tra lại `isDirectMessageBetween`, gồm điều kiện `type === 'text'`, để loại ACK và tin không thuộc cặp A/B. `scope` cô lập từng tài khoản đăng nhập trên cùng thiết bị. Lịch sử gộp mọi session của cặp A/B; `sessionId` không giới hạn kết quả, vì mở lại app có thể bắt đầu phiên kết nối mới. Index giúp lọc group/scope/sender/receiver. `list()` vẫn trả toàn bộ lịch sử để Group Chat dùng như trước.

Web giữ nguyên key `ds01-history-v1-<Peer ID>`, lọc bằng `isDirectMessageBetween(message, A, B)` với điều kiện tương đương SQL và sắp xếp theo timestamp/Message ID. Mở lại `WebStore` cùng Peer ID đọc được lịch sử đã lưu. Giới hạn giữ 1.000 row của WebStore hiện tại vẫn áp dụng cho tổng lịch sử.

## Service dùng chung cho client

`DirectChatService` dùng cùng `PeerClient` và store mà client đã khởi tạo. Không tạo kết nối signaling thứ hai cho cùng user:

```ts
import { DirectChatService } from '@ds01/shared';
import { loadChatContacts } from '../src/mobile/api.ts';

// peer và store là instance đã cấu hình trong ứng dụng.
await peer.connect(); // Chỉ gọi một lần cho instance/phiên kết nối.
const directChat = new DirectChatService(peer, store);
const contacts = await loadChatContacts();
const contact = contacts[0]; // UI thực tế để người dùng chọn.
if (contact) {
  const conversation = await directChat.open(contact.id);
  // conversation.messages: lịch sử cả hai chiều, không lẫn tin nhóm.
  // conversation.peer: trạng thái online và giao thức kết nối.
  if (conversation.peer.online) {
    await directChat.send(contact.id, 'Chào bạn');
  }
  const history = await directChat.history(contact.id);
}
```

`history()` chỉ đọc local và hoạt động cả khi signaling mất kết nối. `open()` cần signaling để discovery; nếu discovery lỗi, client vẫn có thể gọi `history()` để mở phần lịch sử. Sau khi nhận event `kind: 'message'` từ PeerClient, client gọi lại `history(contact.id)` để cập nhật giao diện. Mobile dùng `loadChatContacts()` từ REST API; web peer demo hiện dùng danh sách peer online và không có phiên đăng nhập REST.

Người offline không có hàng đợi server để nhận lại tin. Tin không gửi được có trạng thái failed sau retry; không tự resend khi mở lại app. Lịch sử nằm trên thiết bị/browser hiện tại, không đồng bộ MongoDB hoặc thiết bị khác.

## Luồng trên Android

1. Đăng nhập và mở `Tin nhắn`; app gọi `GET /contacts` rồi hiển thị thành viên cùng dự án cùng trạng thái online hiện biết.
2. Chọn một người; app đọc lịch sử A↔B từ SQLite trước, sau đó gọi `peer:lookup` để cập nhật trạng thái. Mất signaling không làm mất khả năng xem lịch sử đã lưu.
3. Khi B online, nhập tối đa 4.000 ký tự và gửi. Mỗi bubble hiển thị thời gian, trạng thái gửi/ACK và nhãn `DIRECT` hoặc `RELAY` lấy từ envelope thực tế.
4. Khi B offline, composer và nút Gửi bị khóa vì hệ thống không có hàng đợi offline. Nút `Làm mới trạng thái` query lại discovery; nút `DIRECT trước`/`Đang ép RELAY` phục vụ kiểm thử đường truyền.
5. Event nhận được chỉ cập nhật hội thoại nếu là tin text không nhóm của đúng cặp A/B. Việc đổi liên hệ dùng request guard để response chậm của cuộc chat trước không ghi đè cuộc chat đang mở.

Chat nhóm không dùng màn hình này: vào `Dự án` → chọn dự án → `☰ → Chat`. Nhóm được tạo cùng dự án và tự đồng bộ thành viên từ MongoDB, rồi gọi `sendGroup`; không tạo/khôi phục UUID nhóm thủ công. Xem [dự án phân cấp](hierarchical-projects.md).

## Kiểm tra

Chạy `npm.cmd test -- --silent`. Các test bổ sung kiểm tra API danh bạ qua HTTP, discovery qua Socket.IO thật, null/undefined groupId, SQLite thật và migration dữ liệu cũ, localStorage đọc lại, tin cá nhân/nhóm gửi xen kẽ, ACK, peer offline và helper lọc/trạng thái/validation của composer mobile. Lượt chạy ngày 05/10/2026 đạt 30/30 test trong 10 file. Test WebRTC fallback dùng DataChannel giả không mở; kết quả này không chứng minh DIRECT WebRTC thực trên hai Android hoặc hai mạng.

`npm.cmd run test:contacts-api` cũng đã được chạy với MongoDB đang cấu hình và dữ liệu seed: đăng nhập JWT, `GET /contacts`, đối chiếu độc lập thành viên các dự án chung, kiểm tra chỉ có `id/name/email`, và trả 2 liên hệ trong dữ liệu hiện tại. Script này chỉ đọc database. Chi tiết đầu ra thật nằm ở `docs/evidence/direct-chat-2026-10-05.txt`.

Native build ngày 05/10/2026 đã được cài lên Pixel 7 emulator. ADB xác nhận tab `Tin nhắn` có hai liên hệ seed, mở được hội thoại với An, hiển thị Offline và khóa ô gửi. Ảnh thật ở `evidence/mobile-direct-chat-2026-10-05.png`. Chưa có peer thứ hai online trong lượt kiểm tra này, nên ảnh không chứng minh gửi, ACK, DIRECT hoặc RELAY thực.
