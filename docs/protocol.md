# Giao thức REST chat

Tài liệu này mô tả giao thức chat của ứng dụng Mobile. Đây không phải giao thức P2P: mọi thiết bị giao tiếp với API bằng HTTPS và JWT.

## Message envelope

```ts
type ChatMessage = {
  messageId: string;       // UUID do client tạo, dùng chống lặp
  sessionId: string;       // UUID của lượt gửi
  senderId: string;        // API lấy từ JWT
  receiverId: string;      // một user nhận cụ thể
  groupId?: string | null; // null cho 1:1, UUID cho nhóm
  type: "text" | "attachment";
  timestamp: number;       // epoch milliseconds
  body: string;
  attachments?: Array<{
    id: string;
    name: string;
    mime: string;
    size: number;
  }>;
  sequence: number;
};
```

Tin 1:1 có `groupId = null`. Tin nhóm được API fan-out thành một envelope/delivery cho mỗi `receiverId`; các record giữ cùng `messageId` và `groupId`.

## Trạng thái

- `queued`: API đã lưu, người nhận chưa sync.
- `delivered`: API đã trả tin cho người nhận qua endpoint sync.
- `read`: người nhận đã mở hội thoại và xác nhận đọc.
- `failed`: Mobile xác định request không thể retry, ví dụ payload sai hoặc bị chặn.

SQLite có thể giữ `pending`, `sent`, `received` để tương thích lịch sử cục bộ; trạng thái authoritative của tin đã lên server là queued/delivered/read.

## Endpoint

Tất cả endpoint dưới đây cần `Authorization: Bearer <JWT>`.

```text
GET    /users/search?email=...
GET    /users/:userId
GET    /chat/blocks
POST   /chat/blocks/:userId
DELETE /chat/blocks/:userId

POST   /chat/attachments
GET    /chat/attachments/:attachmentId

POST   /chat/messages/direct
POST   /chat/messages/group
GET    /chat/messages/sync?cursor=...
POST   /chat/messages/read
DELETE /chat/conversations/direct/:userId
```

### Tạo tin 1:1

```json
{
  "receiverId": "507f1f77bcf86cd799439011",
  "messageId": "0f6c9b1c-038a-4a25-b749-bc51df265da8",
  "sessionId": "32c94056-7164-47ab-b3a5-94ebf943076e",
  "timestamp": 1793450000000,
  "sequence": 1793450000000,
  "body": "Xin chào",
  "attachmentIds": []
}
```

API bỏ qua mọi ý định giả sender và dùng user trong JWT. Nếu một trong hai phía đã chặn phía kia, request bị từ chối.

### Tạo tin nhóm

Payload giống direct nhưng thay `receiverId` bằng `groupId`. API tìm project theo `chatGroupId`, kiểm tra project chưa lưu trữ và sender còn là thành viên, sau đó lấy danh sách người nhận từ membership hiện hành.

### Đồng bộ

```json
{
  "items": [
    { "message": {}, "status": "delivered" }
  ],
  "nextCursor": "opaque-cursor",
  "hasMore": false
}
```

Cursor là giá trị opaque; client chỉ lưu và gửi lại, không tự phân tích. Mobile upsert từng item theo khóa message/delivery rồi mới lưu cursor mới. Endpoint có phân trang và client lặp đến khi `hasMore = false` hoặc đạt giới hạn an toàn.

### Xác nhận đọc

```json
{ "messageIds": ["uuid-1", "uuid-2"] }
```

API chỉ đánh dấu các delivery có receiver là user hiện tại. User khác không thể xác nhận thay.

## Attachment

Upload dùng `multipart/form-data`, tối đa 3 file và 5 MiB/file. Request phải có đúng một target: `receiverId` hoặc `groupId`. API ghi multipart vào tệp tạm, stream vào GridFS rồi xóa tệp tạm; không giữ toàn bộ file trong RAM. Sau upload, client đưa các ID nhận được vào `attachmentIds` của message. Quyền tải kiểm tra sender/receiver của direct hoặc membership hiện tại của group.

Metadata lưu trong `chat_attachments`; bytes nằm ở GridFS (`uploads.files`, `uploads.chunks`). Endpoint tải stream nội dung theo yêu cầu. Mobile cache file đã xem theo tài khoản và dùng lại file cục bộ; khi mở rộng quy mô nên chuyển sang object storage và URL ký ngắn hạn.

## Chống trùng, thứ tự và retry

- Unique key `(messageId, receiver)` khiến retry cùng message không tạo bubble thứ hai.
- Trong hội thoại, Mobile sắp theo `timestamp`, `messageId`, sender và receiver để có thứ tự xác định.
- Mobile ghi message và outbox SQLite trước khi gọi API.
- Lỗi mạng/5xx giữ outbox để retry.
- Lỗi 4xx do payload/quyền chuyển message sang failed và bỏ request không hợp lệ khỏi outbox.

Không có hàng đợi relay hoặc ACK từ peer. `delivered/read` là ACK ở cấp ứng dụng do API và thiết bị nhận cập nhật.

## Xóa và block

Xóa hội thoại thêm user hiện tại vào `hiddenFor` và xóa cache SQLite phía họ. Người còn lại không mất lịch sử. Block là quan hệ có hướng trong `user_blocks`; server từ chối tin 1:1 mới nếu một trong hai chiều tồn tại. Block không tự xóa lịch sử cũ.

## Lỗi chuẩn

- `400`: schema/ID/cursor sai.
- `401`: JWT thiếu hoặc hết hạn.
- `403`: bị chặn, ngoài membership hoặc không có quyền tệp.
- `404`: user/group/message/tệp không tồn tại hoặc bị che theo quyền.
- `409`: message ID xung đột với nội dung khác hoặc version conflict.
- `413`: file vượt giới hạn.
- `423`: dự án đã lưu trữ.
