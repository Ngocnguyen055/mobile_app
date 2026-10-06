# Dự án độc lập và dự án phân cấp

## Quy ước nghiệp vụ

Khi tạo dự án, chọn **Độc lập** hoặc **Phân cấp**. Dự án cũ được giữ là độc lập khi migration; không tự chuyển dữ liệu cũ sang phân cấp. Loại dự án không đổi sau khi tạo.

Phân cấp có hai tầng: một dự án tổng và các dự án con; chưa hỗ trợ dự án cháu. Người tạo dự án tổng là Giám đốc. Mỗi dự án con phải có một Trưởng phòng; hủy vai trò bằng cách bổ nhiệm người thay thế, không để dự án con thiếu người quản lý. Chưa có chuyển quyền Giám đốc. Một người có thể quản lý dự án con A và là Nhân viên trong dự án con B.

Vai trò nằm trong collection `project_members`, khóa duy nhất `(project, user)`. `users` không có vai trò toàn cục. `Project.members` là danh sách ACL được cập nhật cùng membership trong transaction; `owner` và `manager` là tham chiếu phục vụ quản lý. Mọi thành viên dự án con phải thuộc dự án tổng. Giám đốc được thêm vào danh sách thành viên từng dự án con ngay khi tạo, nên cũng thuộc nhóm chat con.

Mục **Thành viên** luôn xếp Giám đốc trước, tiếp theo Trưởng phòng, cuối cùng Nhân viên; mỗi nhóm xếp theo tên A–Z với quy tắc tiếng Việt. Ở dự án tổng, người quản lý ít nhất một dự án con được hiển thị là Trưởng phòng. API trả `childManagerIds` chỉ để hiển thị danh bạ nhất quán, không cấp quyền quản lý dự án tổng hoặc làm lộ nội dung dự án con ngoài quyền.

| Thao tác trong dự án phân cấp | Giám đốc | Trưởng phòng | Nhân viên |
| --- | --- | --- | --- |
| Thêm / xóa thành viên | Tổng và mọi dự án con | Dự án con mình quản lý; chỉ chọn người thuộc tổng | Không |
| Bổ nhiệm / thay Trưởng phòng, tạo dự án con | Có | Không | Không |
| Tạo / sửa / xóa task và sửa sự kiện dự án | Mọi phạm vi | Dự án con mình quản lý | Không |
| Cập nhật trạng thái task | Mọi task | Mọi task trong dự án quản lý; task của mình trong dự án khác | Chỉ task được giao cho mình |
| Đọc task / tiến độ / thảo luận / tệp | Tổng và mọi dự án con | Tổng và các dự án con mình tham gia | Tổng và các dự án con mình tham gia |
| Lưu trữ / khôi phục, sửa thông tin và nguồn lực | Tổng và mọi dự án con | Dự án con mình quản lý | Không |
| Sửa nội dung bài / bình luận | Chỉ nội dung của mình | Chỉ nội dung của mình | Chỉ nội dung của mình |
| Ẩn / xóa bài, xóa bình luận vi phạm | Mọi phạm vi | Dự án con mình quản lý | Chỉ xóa nội dung của mình |

Ở dự án độc lập, mọi thành viên tiếp tục quản lý task chung; chủ dự án quản lý thành viên, nguồn lực và lưu trữ. Quyền luôn được kiểm tra lại tại API; việc ẩn nút trên Android chỉ giúp giao diện phù hợp với vai trò.

## Luồng thao tác trên Android

1. Mở **Dự án**, chọn **Dự án phân cấp**, nhập tên rồi tạo. Bạn trở thành Giám đốc.
2. Bấm **☰ → Thành viên**, thêm bằng email tài khoản đã đăng ký vào dự án tổng. Không tự tạo tài khoản cho người khác.
3. **☰ → Quản lý dự án**, nhập tên dự án con, bấm ô **Chọn Trưởng phòng** để mở danh sách thả xuống. Nhập toàn bộ hoặc một phần email để lọc các thành viên đã thuộc dự án tổng, chọn người rồi tạo. Khi thay Trưởng phòng hoặc chọn người thay thế lúc xóa thành viên, dùng cùng danh sách có tìm kiếm. Vào dự án con, **Thành viên** để chọn thêm nhân viên từ tổng.
4. Trưởng phòng đăng nhập tài khoản của mình để tạo, phân công và sửa task trong dự án con quản lý. Nhân viên thấy task nhưng chỉ đổi trạng thái task của mình.
5. **Tiến độ** có tổng số hoàn thành / sắp quá hạn / quá hạn. Nút `▾` bên phải thanh của từng người mở danh sách task: vòng tròn xám = Chưa làm, vòng tròn nét đứt vàng = Đang làm, tích xanh = Hoàn thành, dấu × đỏ = Quá hạn. Tổng quan của dự án tổng chỉ gộp các dự án con mà người xem được phép truy cập.
6. **Thảo luận** để đăng bài, đính kèm tệp / ảnh, bình luận, sửa nội dung của mình và quản lý bài vi phạm trong phạm vi quyền. Khi mở bình luận, danh sách có chiều cao giới hạn và thanh cuộn riêng; vuốt trong vùng này để đọc tiếp, ô nhập nằm bên dưới. Mỗi bài tối đa 3 tệp, mỗi tệp 512 KiB. Tab Tài liệu được bỏ; tệp cũ còn tải được ở cuối Thảo luận.
7. **Chat** tự lấy nhóm của dự án. Không tạo nhóm hoặc sửa danh sách thành viên riêng từ Android. Khởi động API → signaling → relay để chat hoạt động. Trạng thái online và DIRECT / RELAY vẫn đến từ peer engine.
8. Bấm **🔔 Thông báo** trên header để mở hộp thư, làm mới, đánh dấu đã đọc và mở dự án liên quan.

Menu dự án là drawer dọc mở bằng `☰`; header dự án nằm ngoài vùng cuộn. Lịch chính tiếp tục mở sau đăng nhập và giữ bộ lọc **Tất cả / Cá nhân / Dự án**. Trong lịch dự án không có nút tạo sự kiện / task; quyền sửa mục đã có được kiểm tra theo dự án. Lịch cá nhân không bị ảnh hưởng bởi vai trò dự án.

## Xóa thành viên và lưu trữ

- Xóa khỏi tổng sẽ xóa khỏi các dự án con liên quan. Xóa khỏi một dự án con không xóa khỏi tổng hoặc các dự án con khác.
- Nếu người bị xóa là Trưởng phòng, Giám đốc phải chọn người thay thế cho từng dự án con bị ảnh hưởng. Trưởng phòng không tự bổ nhiệm người kế nhiệm.
- Mặc định task chuyển thành chưa phân công. Có thể chuyển toàn bộ task sang một người; người nhận phải thuộc **mọi dự án bị ảnh hưởng**. Nếu không đáp ứng, API từ chối toàn bộ thao tác, không xóa một phần. Giao diện không tự thêm người nhận task vào dự án khác.
- Membership, manager, phân công task và phiên bản nhóm chat được cập nhật trong cùng transaction. Quyền đọc dữ liệu dự án bị thu hồi. Signaling phát danh sách mới sau đồng bộ; peer và relay kiểm tra quyền mới khi gửi / nhận tin nhóm, kể cả một DataChannel đã mở từ trước.
- SQLite của thiết bị bị loại vẫn giữ lịch sử trước đó. Không xóa hoặc gọi lại tin đã nhận. Cơ chế thu hồi áp dụng cho API và client tuân thủ giao thức; phần mềm P2P bị sửa để cố ý bỏ kiểm tra không thể được máy chủ ngăn gửi byte trực tiếp. Không giao tin offline.
- Lưu trữ dự án tổng lưu trữ mọi dự án con. Dự án lưu trữ vẫn đọc được nhưng không sửa task, lịch, thành viên, nguồn lực, bài, bình luận hoặc gửi chat mới. Khôi phục tổng có lựa chọn khôi phục tất cả con hoặc giữ con lưu trữ. Trưởng phòng không khôi phục con khi tổng còn lưu trữ. Chưa có xóa vĩnh viễn dự án.

**Quá hạn** là trạng thái hiển thị tính từ `status != done` và `dueAt < hiện tại`. API lưu trạng thái nghiệp vụ `todo / doing / done` và trả `effectiveStatus`; không cho đặt `overdue` bằng tay. Task hoàn thành không đổi thành quá hạn. Tiến độ tính lại khi tải dữ liệu; Android tính nhãn theo giờ thiết bị nên cần kiểm tra giờ các máy.

## Chat và thông báo

`Project.chatGroupId` là UUID ổn định lưu MongoDB, có ngay khi tạo dự án. `chatRevision` tăng khi đổi membership / manager / archive. Nhóm dự án tổng do Giám đốc quản lý; nhóm con do Trưởng phòng quản lý. Signaling đọc danh sách từ API nội bộ khi đăng ký, khi client gọi `project:group` và khi kiểm tra quyền; poll khoảng 2 giây để cập nhật giao diện. Android tải lại dữ liệu dự án khoảng 30 giây khi đang xem hoặc sau thao tác ghi.

`project:group {projectId}` trả nhóm hiện tại. `group:authorize {groupId, otherPeerId}` kiểm tra cả hai peer còn trong nhóm và dự án chưa lưu trữ. PeerClient kiểm tra trước khi gửi / nhận cả text và ACK; relay cũng kiểm tra trước chuyển tiếp. Các lệnh này không mang nội dung chat. **Chat nhóm cần signaling và API còn hoạt động để kiểm tra quyền, kể cả khi DIRECT đã mở**; khi không kiểm tra được thì từ chối tin mới. Restart signaling vẫn lấy lại đúng nhóm dự án từ MongoDB. Nhóm demo web tự tạo bằng `group:create` tiếp tục nằm trong RAM và mất sau restart. Chat cá nhân 1:1 không đổi giao thức và không phụ thuộc `groupId`.

Collection `notifications` là **hộp thư trong ứng dụng**, chưa có push server. Không gửi cho actor. Bài mới thông báo thành viên đúng dự án. Bình luận mới thông báo tác giả bài, người đã bình luận và user được nhắc bằng `@[userId]`, luôn giới hạn trong membership; Android chưa có bộ chọn mention. Người đã bị loại không đọc được thông báo của dự án cũ; thông báo bài bị ẩn không lộ tiêu đề cho người không được xem.

Được thêm vào dự án, bổ nhiệm Trưởng phòng, giao / cập nhật task và cập nhật dự án tạo thông báo phù hợp. API quét mỗi phút để tạo một thông báo cho người được giao task chưa hoàn thành, còn hạn trong 24 giờ, khóa chống trùng theo task + deadline. Không gửi thêm cho Trưởng phòng ở bản này. Hộp thư giữ thông báo cũ như lịch sử, nên đổi deadline hoặc hoàn thành không xóa thông báo đã ghi. Notification cục bộ Android theo lựa chọn 1 tuần / 1 ngày / 1 giờ vẫn do cơ chế nhắc lịch riêng cập nhật / hủy.

## API chính

Các endpoint cần JWT. `version` nên gửi khi sửa dự án / membership / nguồn lực; Android gửi phiên bản đã đọc. Task PATCH cần `version`; sửa bài và bình luận dùng `revision` để phát hiện dữ liệu cũ. Payload không được chứa trường ngoài schema.

| Method / URL | Payload hoặc kết quả |
| --- | --- |
| `POST /projects` | `{name, description?, kind: "independent" \| "hierarchical"}` |
| `GET /projects`, `GET /projects/:id` | Vai trò, quyền, thành viên; chi tiết tổng thêm `children` đã lọc quyền |
| `POST /projects/:id/children` | `{name, managerId, memberIds?, version?}` |
| `POST /projects/:id/members` | `{email, version?}` hoặc `{userId, version?}` |
| `PUT /projects/:id/manager` | `{userId, version?}` |
| `DELETE /projects/:id/members/:userId` | `{version?, reassignTo?: id \| null, replacementManagers?: [{projectId,userId}]}` |
| `PATCH /projects/:id` | `{name?, description?, version?}` |
| `PATCH /projects/:id/archive` | `{archived, restoreChildren?, version?}` |
| `PATCH /projects/:id/resources` | Bốn số giờ / ngân sách + `version?` |
| `GET /projects/:id/progress` | Tổng, `byProject`, `byPerson[].tasks` có `effectiveStatus` |
| `/projects/:id/discussions` | GET danh sách, POST JSON hoặc multipart `title / body / files` |
| `/projects/:id/discussions/:postId` | PATCH nội dung của tác giả với `revision`; DELETE tác giả hoặc moderator |
| `PATCH /projects/:id/discussions/:postId/visibility` | `{hidden: boolean}` dành cho moderator |
| `/projects/:id/discussions/:postId/comments` | GET / POST `{body}` |
| `/projects/:id/discussions/:postId/comments/:commentId` | PATCH `{body,revision}` hoặc DELETE |
| `GET /projects/:id/documents/:documentId` | Tệp sau kiểm tra quyền dự án và bài |
| `GET /notifications?limit=50` | Hộp thư của chính người đăng nhập; tối đa 100 mục |
| `PATCH /notifications/:id/read`, `/notifications/read-all` | Đánh dấu đã đọc |

Lỗi thường gặp: 400 payload sai, 403 ngoài quyền, 404 không tồn tại / nội dung không được xem, 409 version cũ hoặc thiếu người thay Trưởng phòng, 423 dự án đã lưu trữ. Khi gặp 409, tải lại trước khi sửa; không tự ghi đè thay đổi của người khác.

## Cấu hình và chuyển dữ liệu cũ

Transaction nhiều collection cần **MongoDB replica set**. Atlas dùng được với URI hiện tại, không đổi sang Mongo khác. Local dùng Compose đã cấu hình replica set `rs0`; URI mẫu có `?replicaSet=rs0`. Docker vẫn là tùy chọn.

API / signaling / relay dùng cùng `PEER_SECRET`. Signaling cần `API_INTERNAL_URL=http://127.0.0.1:4000`, relay cần `SIGNAL_INTERNAL_URL=http://127.0.0.1:4001` khi chạy cùng máy. Caddy mẫu chặn `/internal/*` từ Internet; không đưa secret vào `EXPO_PUBLIC_*` hoặc `VITE_*`.

Với database cũ: dừng API / signaling / relay, sao lưu database rồi chạy tại thư mục gốc:

```powershell
npm.cmd run migrate:projects
# Đọc kết quả DRY RUN trước; lệnh trên không sửa dữ liệu.
npm.cmd run migrate:projects -- --apply
```

Migration bổ sung kind độc lập, membership/roles, group UUID ổn định, archive/version và revision của bài cũ; bỏ phân công task cho user không còn trong dự án. Tệp cũ được giữ để tải trong Thảo luận. Có thể chạy lại, không đổi group UUID đã lưu. Không chạy migration khi các service đang ghi dữ liệu.

Kiểm tra tích hợp riêng bằng `npm.cmd run test:hierarchy-api`: script tạo **database tạm riêng** trên cluster được cấu hình, chạy HTTP API với Mongo thật và dọn đúng database tạm ở cuối. Tài khoản DB cần quyền tạo / xóa database tạm. Script không chuyển đổi hay xóa database của app.

## Trạng thái kiểm chứng

Các test tự động kiểm tra ACL, phạm vi manager, transaction/session, thay manager, version conflict, archive cascade, post/comment/file permissions, inbox scope, task ownership và đồng bộ/thu hồi nhóm qua Socket.IO. Database ở các test này được mock; DataChannel nhận tin sau thu hồi cũng được mô phỏng. Chạy Android export chỉ kiểm tra đóng gói JavaScript, không chứng minh UI hoặc chức năng trên thiết bị.

**Chưa chạy migration hoặc script hierarchy trên Atlas trong lần triển khai này**: lệnh thử Atlas bị chặn trước khi thực thi do cơ chế duyệt tự động hết quota. Cần nhóm chạy script trên DB thử nghiệm, kiểm tra bằng ba tài khoản trên Android và lưu ảnh/log thật. DIRECT WebRTC thật, hai mạng, notification Android và Google OAuth vẫn cần kiểm chứng riêng. Xem [test-plan.md](test-plan.md).
