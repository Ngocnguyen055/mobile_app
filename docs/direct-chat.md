# Service chat cá nhân 1–1

Phần này mô tả API, discovery, lưu trữ và giao diện để chat giữa hai peer. Không có kết bạn. Android có tab `Tin nhắn` ở thanh điều hướng dưới; giao diện Chat trong từng dự án vẫn dành riêng cho nhóm dự án và tiếp tục dùng luồng cũ.

## Tìm người dùng bằng email

Màn hình Tin nhắn không tự tải một danh bạ. Người dùng nhập ít nhất 3 ký tự của email; client gọi `GET /users/search?email=<query>` với `Authorization: Bearer <JWT>`. API trả tối đa 20 kết quả `{ id, name, email }`, loại chính người gọi và các cặp đang chặn nhau. `id` là MongoDB user ID và cũng là Peer ID khi Android đăng ký signaling. Không trả password hash hoặc JWT.

```ts
import { searchChatUsers } from "../src/mobile/services/api.ts";
const results = await searchChatUsers("an@example");
// Chọn một kết quả; app lưu id/name/email vào cache SQLite của tài khoản.
```

Danh sách cuộc trò chuyện được dựng từ tin nhắn và cache `direct_chat_contacts` cục bộ, không phải từ toàn bộ người dùng/dự án. `GET /users/:userId` chỉ dùng để khôi phục tên/email của peer đã xuất hiện trong lịch sử. Không có chức năng kết bạn.

## Peer discovery

Sau `await peer.connect()`, gọi `await peer.lookupPeer(contact.id)`. Client cũng có thể gọi Socket.IO trực tiếp:

```ts
const result = await signaling.timeout(4000).emitWithAck("peer:lookup", {
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

`connection` mô tả giao thức thiết lập kết nối được hỗ trợ; nó không chứng minh DataChannel hoặc relay đã kết nối. Không công khai socket ID, IP hay token của B. `peer:list`, `peer:lookup` và luồng `presence` chỉ dành cho socket đã đăng ký hiện hành; socket ẩn danh không nhận danh sách Peer ID online. SDP và ICE được trao đổi qua `signal:send` để WebRTC tìm đường đi; A không mở TCP socket trực tiếp tới IP công khai của B. Trạng thái online là một ảnh chụp tại thời điểm query, nên B vẫn có thể mất kết nối ngay sau đó. Với hai Peer ID tài khoản MongoDB, signaling kiểm tra endpoint nội bộ và từ chối discovery/signaling nếu một trong hai bên đã chặn bên kia.

## Envelope và cách gửi

`groupId` được schema chấp nhận khi bỏ trường, `undefined` hoặc `null`; UUID hợp lệ vẫn bắt buộc với tin nhóm. Chuỗi rỗng và ID nhóm sai định dạng bị từ chối. Tin nhắn cá nhân và ACK vẫn có `messageId`, `sessionId`, `senderId`, `receiverId`, `timestamp`, `sequence`, `mode` và `attempt`.

```ts
await peer.sendDirect(contact.id, "Chào bạn");
// Tương đương gửi trên engine hiện có, không gắn groupId:
await peer.send(contact.id, "Chào bạn");
// Engine cũng chấp nhận biểu diễn null:
await peer.send(contact.id, "Chào bạn", null);
```

"Chat cá nhân" mô tả cuộc trò chuyện chỉ có A và B. Delivery mode vẫn có thể là DIRECT hoặc RELAY. DIRECT thử WebRTC DataChannel trước; nếu mở kênh thất bại, mất kênh hoặc chờ ACK quá hạn, các lần gửi sau dùng relay Socket.IO. DIRECT thành công không chuyển nội dung chat qua signaling/relay. Engine dùng lại ACK ứng dụng, retry giới hạn và chống trùng hiện có. `delivered` nghĩa là ứng dụng nhận đã lưu/phản hồi ACK, chưa phải đã đọc.

Group Chat vẫn gọi `sendGroup(groupId, body)`: cùng Message ID được gửi riêng tới mỗi thành viên và ACK được theo dõi từng người. Không tạo groupId giả cho chat cá nhân.

Tin tệp có `type: "attachment"` và mảng metadata `{ id, name, mime, size }`; không nhét base64 vào DataChannel. Android tải tối đa 3 tệp/lần, 512 KiB/tệp lên `POST /chat/attachments`, sau đó gửi metadata bằng `sendDirectAttachment`. Chỉ người gửi và người nhận tải được `GET /chat/attachments/:id` bằng JWT. MIME được giới hạn và response dùng `nosniff`; nội dung tệp lưu trong MongoDB. Chat nhóm hiện vẫn chỉ gửi text.

## SQLite và localStorage

`MobileStore` và `WebStore` có thêm:

```ts
await store.putDirect({ message, status: "received" });
const history = await store.listDirect(contact.id);
```

`putDirect` chỉ chấp nhận tin text hoặc attachment không có groupId và có người gửi/người nhận là chủ local store. Engine tự lưu tin và trạng thái qua `store.put`/`store.mark`; client dùng `peer.sendDirect`/`sendDirectAttachment` không cần lưu lại thủ công. ACK được engine xử lý mà không đưa vào lịch sử cuộc trò chuyện.

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

Sau query, service đọc JSON và kiểm tra lại `isDirectMessageBetween`, gồm điều kiện loại tin là `text` hoặc `attachment`, để loại ACK và tin không thuộc cặp A/B. `scope` cô lập từng tài khoản đăng nhập trên cùng thiết bị. Lịch sử gộp mọi session của cặp A/B; `sessionId` không giới hạn kết quả, vì mở lại app có thể bắt đầu phiên kết nối mới. Index giúp lọc group/scope/sender/receiver. `list()` vẫn trả toàn bộ lịch sử để Group Chat dùng như trước.

SQLite còn có `direct_chat_contacts` và `direct_chat_preferences`. `deleteDirect(peerId)` xóa riêng lịch sử A↔B trên thiết bị hiện tại; không xóa bản của B. Chặn được lưu ở MongoDB (`user_blocks`) và đồng bộ xuống cache SQLite để một DataChannel đã mở cũng từ chối tin mới. Relay kiểm tra block trước khi chuyển tin cá nhân. Tệp đã tải lên máy chủ không bị xóa khi A xóa lịch sử cục bộ.

Web giữ nguyên key `ds01-history-v1-<Peer ID>`, lọc bằng `isDirectMessageBetween(message, A, B)` với điều kiện tương đương SQL và sắp xếp theo timestamp/Message ID. Mở lại `WebStore` cùng Peer ID đọc được lịch sử đã lưu. Giới hạn giữ 1.000 row của WebStore hiện tại vẫn áp dụng cho tổng lịch sử.

## Service dùng chung cho client

`DirectChatService` dùng cùng `PeerClient` và store mà client đã khởi tạo. Không tạo kết nối signaling thứ hai cho cùng user:

```ts
import { DirectChatService } from "@ds01/shared";
import { searchChatUsers } from "../src/mobile/services/api.ts";

// peer và store là instance đã cấu hình trong ứng dụng.
await peer.connect(); // Chỉ gọi một lần cho instance/phiên kết nối.
const directChat = new DirectChatService(peer, store);
const contacts = await searchChatUsers("an@example");
const contact = contacts[0];
if (contact) {
  const conversation = await directChat.open(contact.id);
  // conversation.messages: lịch sử cả hai chiều, không lẫn tin nhóm.
  // conversation.peer: trạng thái online và giao thức kết nối.
  if (conversation.peer.online) {
    await directChat.send(contact.id, "Chào bạn");
  }
  const history = await directChat.history(contact.id);
}
```

`history()` chỉ đọc local và hoạt động cả khi signaling mất kết nối. `open()` cần signaling để discovery; nếu discovery lỗi, client vẫn có thể gọi `history()` để mở phần lịch sử. Sau khi nhận event `kind: 'message'` từ PeerClient, client gọi lại `history(contact.id)` để cập nhật giao diện. Mobile tìm người bằng REST; web peer demo hiện dùng danh sách peer online và không có phiên đăng nhập REST.

Người offline không có hàng đợi server để nhận lại tin. Tin không gửi được có trạng thái failed sau retry; không tự resend khi mở lại app. Lịch sử nằm trên thiết bị/browser hiện tại, không đồng bộ MongoDB hoặc thiết bị khác.

## Luồng trên Android

1. Đăng nhập và mở `Tin nhắn`; app chỉ tải danh sách hội thoại/cache cục bộ. Nhập email và bấm `Tìm` để gọi API tìm người.
2. Chọn kết quả hoặc một hội thoại; app đọc lịch sử A↔B từ SQLite trước, sau đó gọi `peer:lookup`. Mũi tên quay về danh sách hội thoại.
3. Khi B online và chưa bị chặn, nhập tối đa 4.000 ký tự hoặc bấm `+` để chọn tối đa 3 ảnh/tệp. Mỗi bubble hiển thị thời gian, ACK và nhãn `DIRECT`/`RELAY`.
4. Bấm nút `!` hình tròn để xem lại ảnh/tệp và tải/mở bằng ứng dụng trên máy. Mục này đọc metadata từ lịch sử SQLite; nội dung tệp được tải có JWT khi người dùng bấm mở.
5. Nhấn giữ hội thoại để xóa cục bộ hoặc chặn/bỏ chặn. Các thao tác tương tự có trong nút `!`. Chặn giữ lịch sử cũ nhưng ngừng tin mới; xóa không tác động thiết bị người kia.
6. Khi B offline, composer bị khóa vì hệ thống không có hàng đợi offline. Nút `Làm mới trạng thái` query lại discovery; nút `DIRECT trước`/`Đang ép RELAY` phục vụ kiểm thử đường truyền.

Chat nhóm không dùng màn hình này: vào `Dự án` → chọn dự án → `☰ → Chat`. Nhóm được tạo cùng dự án và tự đồng bộ thành viên từ MongoDB, rồi gọi `sendGroup`; không tạo/khôi phục UUID nhóm thủ công. Xem [dự án phân cấp](hierarchical-projects.md).

## Kiểm tra

Chạy `npm.cmd test -- --silent`. Các test kiểm tra tìm email/ACL block, metadata tệp, discovery và relay từ chối cặp bị chặn, null/undefined groupId, SQLite migration, cache contact/block, xóa đúng một cuộc chat, ACK và fallback. Test WebRTC fallback dùng DataChannel giả không mở; kết quả này không chứng minh DIRECT WebRTC thực trên hai Android hoặc hai mạng.

Lượt 20/10/2026, toàn bộ `npm.cmd test` đạt 87/87 test trong 22 file; riêng API chat kiểm tra tìm email, upload multipart, tải bằng hai participant và từ chối tài khoản thứ ba. Test dùng model mock nên chưa chứng minh ghi/tải tệp trên Atlas. Kết quả lệnh nằm ở `docs/evidence/direct-chat-search-files-block-2026-10-20.txt`.

`npm.cmd run test:contacts-api` từng được chạy với MongoDB và dữ liệu seed cho API danh bạ cũ. Kết quả đó chỉ là bằng chứng lịch sử tại `docs/evidence/direct-chat-2026-10-05.txt`, không chứng minh API tìm email mới.

Native build ngày 05/10/2026 đã được cài lên Pixel 7 emulator cho giao diện danh bạ cũ; ảnh ở `evidence/mobile-direct-chat-2026-10-05.png` không phải bằng chứng cho giao diện tìm email/tệp/chặn mới. Phiên bản mới vẫn cần nhóm thử trên hai tài khoản online và ghi lại DIRECT, RELAY, tải tệp, chặn và khôi phục lịch sử sau restart.
