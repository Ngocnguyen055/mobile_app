# Chat Mobile có lưu và giao offline

Tài liệu này mô tả chat của ứng dụng Mobile. Bản DS01 P2P đã được tách sang repository riêng; Mobile dùng API/MongoDB để người nhận không cần online cùng lúc.

## Phạm vi

- Tìm người chat bằng email, không có kết bạn hoặc tải toàn bộ danh bạ.
- Chat 1:1 và nhóm tự đồng bộ theo thành viên dự án.
- Text, ảnh và tệp; tối đa 3 tệp/lần, 5 MiB/tệp.
- Trạng thái `queued`, `delivered`, `read`; Message ID chống trùng.
- SQLite giữ lịch sử, cursor và outbox trên Android.
- Chặn tài khoản, xóa hội thoại phía người thao tác và kiểm tra quyền tải tệp.

## Luồng gửi

### Người gửi có API

1. Mobile tạo `messageId`, `sessionId`, timestamp và sequence.
2. Tin 1:1 được ghi SQLite với trạng thái `queued`.
3. `POST /chat/messages/direct` lưu document trong `chat_messages`.
4. Nếu người nhận đang offline, document tiếp tục ở trạng thái `queued`.
5. Khi người nhận mở app, polling gọi `/chat/messages/sync`; API trả tin và đổi trạng thái thành `delivered`.
6. Khi người nhận mở hội thoại, `/chat/messages/read` đổi trạng thái thành `read`.
7. Người gửi nhận trạng thái mới ở lần sync tiếp theo.

### Máy gửi tạm mất API

Tin text 1:1 được giữ trong `chat_outbox`. Polling thử gửi lại khi API hoạt động. Ảnh/tệp phải upload trước nên cần kết nối API tại thời điểm chọn tệp; nếu message create lỗi sau upload, metadata đã có được giữ trong outbox và gửi lại.

### Nhóm dự án

API đọc `chatGroupId` và membership dự án hiện tại. Một Message ID được fan-out thành một record cho mỗi người nhận để theo dõi delivery/read riêng. Thành viên bị loại không được tải tin mới; SQLite cũ trên thiết bị của họ không bị xóa từ xa. Dự án lưu trữ từ chối tin và upload mới.

## REST API

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

Upload attachment nhận đúng một trong hai trường `receiverId` hoặc `groupId`. API kiểm tra JWT, block hoặc membership, MIME, kích thước và quyền tải.

Payload tạo message:

```json
{
  "messageId": "UUID",
  "sessionId": "UUID",
  "timestamp": 1793450000000,
  "sequence": 1793450000000,
  "body": "Nội dung",
  "attachmentIds": [],
  "receiverId": "Mongo ObjectId cho direct"
}
```

Với nhóm, thay `receiverId` bằng `groupId`. Sender luôn lấy từ JWT; client không được tự khai sender.

## MongoDB

### `chat_messages`

Mỗi record gồm Message ID, sender, receiver, group/project tùy chọn, body, attachment references, timestamp, sequence, status, delivered/read time và `hiddenFor`. Unique index `(messageId, receiver)` bảo đảm retry không tạo bản trùng.

### `chat_attachments`

Attachment thuộc đúng một direct receiver hoặc group. Metadata giữ `gridFsFileId`; bytes được chia chunk trong GridFS thay vì nằm trong document metadata. Response danh sách chỉ gồm `id`, `name`, `mime`, `size`, còn endpoint tải stream bytes khi cần. Dữ liệu `Buffer` cũ vẫn đọc được để tương thích; tệp mới không dùng cách đó.

### `user_blocks`

Block là quan hệ có hướng. Nếu một trong hai phía chặn, API từ chối tin 1:1 mới. Các tin queued từ người bị chặn chưa giao được ẩn với blocker. Block không tự xóa lịch sử đã có.

## SQLite Android

- `messages`: lịch sử hiển thị theo user scope.
- `chat_outbox`: request chưa ghi được lên API.
- `chat_sync_state`: cursor đồng bộ tăng dần theo `updatedAt + _id`.
- `direct_chat_contacts`: hội thoại đã mở hoặc contact suy ra từ message.
- `direct_chat_preferences`: cache block cục bộ.
- `attachment_cache`: URI, kích thước, MIME và thời điểm truy cập gần nhất của file đã cache theo tài khoản.

Mọi lần sync đều upsert theo khóa message nên nhận lặp không tạo bubble trùng. App polling khoảng 3 giây khi đang mở và sync ngay lúc khởi tạo/open hội thoại.

Ảnh/tệp được tải một lần vào cache riêng của tài khoản, kiểm tra kích thước trước khi dùng lại và dọn theo LRU khi tổng cache vượt 200 MiB. Cache được xóa lúc đăng xuất; hệ điều hành vẫn có thể tự dọn thư mục cache khi thiếu dung lượng.

## Xóa và quyền

Xóa hội thoại thêm user hiện tại vào `hiddenFor` trên các tin direct và xóa cache SQLite của chính họ. Người còn lại vẫn giữ lịch sử. Tin mới sau thời điểm xóa sẽ xuất hiện bình thường. Tệp direct chỉ sender/receiver tải được; tệp nhóm chỉ thành viên hiện hành tải được.

## Cách kiểm thử thủ công

1. Chạy MongoDB, API và Metro/development client.
2. Đăng nhập Bình trên máy A, giữ An chưa mở app.
3. Bình tìm `an@example.test`, gửi text và ảnh. Bubble phải hiện `Đã gửi` dù An chưa mở ứng dụng.
4. Mở app và đăng nhập An trên máy B. Trong tối đa vài giây, hội thoại/tin phải xuất hiện; phía Bình chuyển sang trạng thái đã giao sau lần sync.
5. An mở hội thoại; phía Bình chuyển `Đã xem` sau lần sync.
6. Tắt API, gửi một tin text từ Bình. Tin phải còn trong SQLite/outbox. Mở lại API; tin tự ghi server và được giao khi An sync.
7. Tạo dự án có ba thành viên; tắt app một người, gửi text/ảnh trong Chat, sau đó mở lại người đó và kiểm tra lịch sử.
8. Xóa một thành viên rồi gửi tin nhóm mới; thiết bị bị loại không được sync tin đó.

## Giới hạn đã xác định

- Polling chỉ chạy ổn định khi app đang mở; chưa có FCM/Expo push hoặc background worker bảo đảm.
- Không có mã hóa đầu cuối; API/MongoDB nhìn thấy nội dung.
- Attachment nằm trong MongoDB GridFS, giới hạn 5 MiB/tệp và 3 tệp/lần; Atlas miễn phí vẫn có giới hạn tổng dung lượng.
- Không có gọi thoại/video, thu hồi tin hoặc delivery giữa hai máy khi cả hai đều không thể truy cập API.
- Test tự động dùng model mock và SQLite thật trong bộ nhớ; vẫn cần kiểm chứng Atlas và hai Android/emulator thật.
