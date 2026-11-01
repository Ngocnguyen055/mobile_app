# Student Planner

Ứng dụng Android quản lý lịch cá nhân, dự án, công việc, thảo luận và tin nhắn cho nhóm sinh viên. Repository này là phần **Mobile** độc lập; mã DS01 P2P/WebRTC đã được chuyển sang repository riêng và không còn là dependency của ứng dụng.

## Công nghệ

- Mobile: React Native + Expo development build + TypeScript.
- API: Node.js, Express, Mongoose, JWT.
- Dữ liệu dùng chung: MongoDB Atlas hoặc MongoDB replica set local.
- Dữ liệu trên thiết bị: SQLite cho lịch sử chat, outbox, cursor đồng bộ và lịch nhắc.
- Nhắc việc: `expo-notifications`.

Chat hiện dùng mô hình **store-and-forward qua REST API**. Người nhận không cần online cùng lúc: API lưu tin trong MongoDB, Mobile đồng bộ khi mở app. Không còn signaling, relay Socket.IO, WebRTC, Peer ID hay nhãn DIRECT/RELAY trong ứng dụng này.

## Chức năng chính

- Đăng ký, đăng nhập và phiên JWT.
- Dự án độc lập hoặc dự án phân cấp với Giám đốc, Trưởng phòng, Nhân viên.
- Quản lý thành viên, dự án con, lưu trữ/khôi phục và nguồn lực/ngân sách.
- Task có thời gian bắt đầu/kết thúc, phân công, trạng thái, deadline và tiến độ từng người.
- Lịch ngày/tuần/tháng theo định dạng Việt Nam; sự kiện cá nhân và lịch dự án.
- Nhắc trước 1 tuần, 1 ngày, 1 giờ và các mốc ngắn hơn có trong giao diện.
- Bảng thảo luận có bài viết, bình luận và tệp nhỏ.
- Chat 1:1 bằng tìm kiếm email; chat nhóm đồng bộ theo thành viên dự án.
- Tin text, ảnh/tệp nhỏ, chặn người dùng, xóa hội thoại phía mình và trạng thái queued/delivered/read.
- Hộp thư thông báo trong ứng dụng.

## Yêu cầu môi trường

- Node.js 20 hoặc 22 LTS được khuyến nghị.
- Android Studio, Android SDK và một emulator đang chạy.
- JDK 17. Có thể dùng JBR đi kèm Android Studio.
- MongoDB Atlas, hoặc Docker nếu muốn chạy MongoDB local.

Expo Go không phù hợp vì ứng dụng dùng các module native như SQLite, notification và development client. Hãy dùng `expo run:android`.

## Cài đặt lần đầu

Tại thư mục gốc repository:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Tạo file `.env` **ở thư mục gốc**, cùng cấp với `package.json`:

```dotenv
MONGO_URL=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/student_planner
JWT_SECRET=thay-bang-chuoi-bi-mat-dai-va-ngau-nhien
API_PORT=4000
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
```

Quy ước URL:

- Android emulator: `http://10.0.2.2:4000`.
- Điện thoại thật cùng Wi-Fi: `http://IP_LAN_CUA_MAY:4000`.
- APK dùng qua Internet: URL HTTPS thật, ví dụ `https://api.example.org`.

Không commit `.env`. `.env.example` chỉ chứa cấu hình mẫu, không chứa secret thật.

### MongoDB Atlas

Trong Atlas, tạo database user, cho IP hiện tại truy cập trong Network Access rồi copy connection string vào `MONGO_URL`. Nếu mật khẩu có ký tự đặc biệt, phải URL-encode. Có thể kiểm tra SRV bằng:

```powershell
Resolve-DnsName -Type SRV _mongodb._tcp.TEN_CLUSTER.mongodb.net
```

### MongoDB local tùy chọn

Docker không bắt buộc cho Android. Nếu dùng local:

```powershell
docker compose -f deploy/compose.yaml up -d
```

URI mẫu đã cấu hình replica set:

```dotenv
MONGO_URL=mongodb://127.0.0.1:27017/student_planner?replicaSet=rs0
```

Replica set cần cho các transaction cập nhật membership/task/project atomically.

## Tạo dữ liệu mẫu

Sau khi MongoDB truy cập được:

```powershell
npm.cmd run seed
```

Tài khoản mẫu dùng chung mật khẩu `StudentDemo123!`:

- `an@example.test`
- `binh@example.test`
- `chi@example.test`

Script seed có thể chạy lại; nó không tạo lặp user và dữ liệu mẫu chính.

## Chạy ứng dụng

Mở hai terminal tại thư mục gốc.

Terminal 1 — API:

```powershell
npm.cmd run dev:api
```

Kiểm tra API tại `http://localhost:4000/health`.

Terminal 2 — build/cài development client lần đầu:

```powershell
npm.cmd run android
```

Sau khi development client đã được cài, các lần sửa TypeScript thông thường chỉ cần:

```powershell
npm.cmd run dev:mobile
```

Sau đó nhấn `a` để mở app trên emulator. Nếu vừa đổi dependency/plugin native, phải chạy lại `npm.cmd run android`.

Nếu chỉ cần tạo APK debug mà không cài lên emulator:

```powershell
cd src/mobile/android
.\gradlew.bat app:assembleDebug -x lint -x test
```

APK nằm tại `src/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Đây là bản debug/development, không phải APK release đã ký để phát hành.

### JDK và Android SDK trên Windows

Cho terminal hiện tại:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

Nếu Gradle không thấy SDK, tạo `src/mobile/android/local.properties` trên máy cá nhân:

```properties
sdk.dir=C:\\Users\\TEN_BAN\\AppData\\Local\\Android\\Sdk
```

`local.properties` là cấu hình riêng của máy và không nên commit.

## Luồng kiểm thử nhanh

1. Đăng nhập `binh@example.test` và kiểm tra lịch mở ngay sau login.
2. Tạo/sửa/xóa sự kiện cá nhân, chọn ngày giờ bằng picker và đặt nhắc.
3. Tạo dự án độc lập, thêm thành viên bằng email, tạo task và phân công.
4. Tạo dự án phân cấp bằng An; thêm Bình/Chi vào tổng, tạo dự án con và chọn Trưởng phòng.
5. Đăng nhập Trưởng phòng/Nhân viên để kiểm tra nút và API đều giới hạn đúng quyền.
6. Đăng bài thảo luận, bình luận và tải tệp nhỏ.
7. Mở Tin nhắn, tìm email của user khác, gửi tin khi user kia chưa mở app.
8. Đăng nhập user nhận trên emulator/thiết bị thứ hai; tin phải được sync và đổi trạng thái giao/đọc.
9. Tắt API, gửi một tin text; mở lại API và kiểm tra outbox tự gửi lại.
10. Chat nhóm dự án, sau đó xóa một thành viên và xác nhận họ không nhận tin nhóm mới.

Chi tiết ở [docs/demo-script.md](docs/demo-script.md) và [docs/test-plan.md](docs/test-plan.md).

## Kiểm tra mã nguồn

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run export -w @student-planner/mobile
```

Các script tích hợp dùng MongoDB thật:

```powershell
npm.cmd run test:calendar-api
npm.cmd run test:contacts-api
npm.cmd run test:hierarchy-api
```

`test:hierarchy-api` tạo database kiểm thử riêng rồi dọn database đó; vẫn nên dùng tài khoản Atlas dành cho môi trường test.

## Database cũ và migration

Nếu database đã có dữ liệu từ phiên bản trước, hãy sao lưu trước. “Sao lưu rồi chạy migration” nghĩa là tạo bản backup để có thể khôi phục nếu dữ liệu cũ không đúng schema, sau đó chạy thử migration ở chế độ chỉ đọc:

```powershell
npm.cmd run migrate:projects
```

Đọc kết quả DRY RUN. Chỉ khi đúng mới áp dụng:

```powershell
npm.cmd run migrate:projects -- --apply
```

Trong lúc migration, dừng API để không có request ghi đồng thời. Database mới tạo bằng `seed` không cần migration.

Để bản cài hiện có tiếp tục dùng đúng Android sandbox và lịch sử SQLite, `applicationId` cũ `edu.student.plannerds01` cùng tên file cục bộ `ds01-chat.db` được giữ lại như định danh tương thích. Đây chỉ là tên kỹ thuật cũ, không kéo theo mã hoặc dependency DS01. Hai cột SQLite cũ `peer_id` được tự đổi sang `user_id` khi app mở.

## Cấu trúc repository

```text
src/
  api/       REST API, schema Mongoose, ACL, chat persistence
  mobile/    màn hình, component, hook, service API/SQLite
scripts/     seed, migration và kiểm tra tích hợp
tests/       test tự động
docs/        kiến trúc, nghiệp vụ, giao thức và kịch bản demo
deploy/      Mongo local, biến môi trường Internet và Caddy mẫu
```

Tài liệu chính:

- [Kiến trúc](docs/architecture.md)
- [Chat lưu và giao offline](docs/direct-chat.md)
- [Dự án phân cấp và phân quyền](docs/hierarchical-projects.md)
- [Giao thức REST chat](docs/protocol.md)
- [Kế hoạch kiểm thử](docs/test-plan.md)
- [Phân công và dàn ý báo cáo](docs/team-and-report.md)

## Triển khai API tùy chọn

Ứng dụng không bắt buộc deploy khi phát triển local. Nếu cài APK cho máy ở mạng khác, API phải có URL HTTPS truy cập được và MongoDB phải nằm ở nơi API truy cập được. Mẫu cấu hình ở `deploy/internet.env.example` và `deploy/Caddyfile.example`.

Không đưa `MONGO_URL` hoặc `JWT_SECRET` vào biến `EXPO_PUBLIC_*`; mọi biến Expo public đều nằm trong bundle ứng dụng.

## Giới hạn hiện tại

- Chat đồng bộ bằng polling khi app đang mở; chưa có FCM/Expo Push hoặc background worker đảm bảo khi app bị hệ điều hành đóng.
- Nội dung chat chưa mã hóa đầu cuối; API/MongoDB có thể đọc dữ liệu.
- Attachment lưu trong MongoDB và giới hạn 512 KiB/tệp, tối đa 3 tệp/lần.
- Xóa hội thoại chỉ ẩn/xóa phía người thao tác; không thu hồi lịch sử của người còn lại.
- Cần kiểm chứng thủ công trên hai Android/emulator và Atlas thật; test tự động không thay thế bằng chứng thiết bị.

## Hướng phát triển

- Tích hợp Google Calendar bằng OAuth thật, đồng bộ có khóa chống trùng và xử lý xung đột. Hiện repository **không chứa SDK, credential hoặc mã đồng bộ Google Calendar**.
- Push notification/background sync cho chat và thông báo dự án.
- Object storage cho ảnh/tệp lớn thay vì lưu bytes trong MongoDB.
- Mã hóa đầu cuối, thu hồi/chỉnh sửa tin nhắn, tìm kiếm toàn văn và phân trang lịch sử.

Không tuyên bố các mục hướng phát triển đã hoạt động cho đến khi có credential, thiết bị và log kiểm chứng thật.
