# Student Planner + DS01 P2P Chat

Monorepo TypeScript cho bài tập lớn nhóm ba sinh viên: ứng dụng Android quản lý dự án và lịch, web peer nhỏ để demo DS01, REST API MongoDB, signaling Socket.IO và relay Socket.IO chạy **hai process riêng**. Android dùng Expo development build có `react-native-webrtc`; Expo Go không chạy được module native này.

## Trạng thái kiểm chứng

- Bản dự án phân cấp đã chạy trên máy phát triển: typecheck (cả các script), lint, `npm test` **65/65 test trong 17 file**, web build và Android JavaScript export. Bộ test có thêm ACL Giám đốc / Trưởng phòng / Nhân viên, membership/manager, archive, post/comment/file permissions, inbox, task ownership và thu hồi nhóm qua Socket.IO. Test API phần mới dùng database mock; DataChannel nhận sau thu hồi là mô phỏng. Đầu ra thật ở [evidence/hierarchy-2026-10-07.txt](docs/evidence/hierarchy-2026-10-07.txt).
- Các lượt trước đã chạy lint/typecheck, Expo dependency check/prebuild và native build. Chưa thử UI drawer và các luồng phân cấp mới trên emulator/điện thoại; Android export không thay thế native build hay kiểm tra thao tác.
- Benchmark relay localhost 100 tin tuần tự: p50 0,545 ms, p95 1,023 ms; đầu ra thật ở `docs/evidence/benchmark.txt`. Chưa đo trên Internet.
- Test tự động kiểm tra discovery ba peer, nhóm có sửa gần đồng thời, relay định tuyến và từ chối sender giả, fallback từ **DataChannel giả lập không mở** sang relay, ACK, chống trùng và tách lịch sử chat nhóm/1:1. `npm run test:calendar-api` đã chạy thật với MongoDB Atlas cho lịch; `npm run test:contacts-api` đã đọc MongoDB đang cấu hình và xác nhận JWT, phạm vi cùng dự án, loại bản thân/trùng và không lộ trường riêng. Chưa kiểm chứng toàn bộ API ngoài phạm vi hai script này, DIRECT WebRTC thực, notification Android, Google OAuth hay đồng bộ Google Calendar với tài khoản thật.
- Development build đã chạy sau đăng nhập trên Android emulator. Ngày 28/09/2026, ADB đã xác nhận ba phạm vi lịch, chính sách nút tạo, điều hướng `Xem / sửa`, lịch dự án không có nút tạo và hai thanh công cụ cố định khi cuộn. Ngày 05/10/2026, native build được cài lại lên Pixel 7; ADB xác nhận tab `Tin nhắn`, danh bạ cùng dự án và màn hình hội thoại offline khóa ô gửi đúng chính sách. Ảnh thật nằm trong `docs/evidence/`. Việc gửi 1:1 giữa hai peer online, DIRECT/RELAY thật và notification vẫn cần nhóm kiểm tra theo `docs/test-plan.md`.
- Khi chạy demo thật, lưu log và ảnh vào `docs/evidence/` theo `docs/demo-script.md`. Không có ảnh hoặc số đo thực tế nào được dựng sẵn.
- Chưa chạy migration hoặc `test:hierarchy-api` với Atlas trong lượt này: cơ chế duyệt tự động hết quota và chặn lệnh trước khi thực thi. Các kết quả Atlas của lịch/danh bạ ở trên thuộc bản trước, không chứng minh transaction/phân quyền mới. Xem [nghiệp vụ và hướng dẫn dự án phân cấp](docs/hierarchical-projects.md).

## Yêu cầu trước khi clone

- Git, Node.js `>=22.13.0` và npm. Repository hiện đã được kiểm tra với Node.js 24.14.0; bộ test SQLite dùng module `node:sqlite` nên không chạy trên Node 20.
- MongoDB Atlas hoặc MongoDB cục bộ có **replica set** để chạy transaction. Docker chỉ là lựa chọn phụ cho MongoDB local; cấu hình Compose có replica set `rs0`.
- Android Studio có Android SDK Platform 36, Build Tools 36.0.0, Platform Tools, Emulator, Command-line Tools và một thiết bị trong Device Manager.
- JDK đi kèm Android Studio. Trên Windows, đường dẫn mặc định thường là `C:\Program Files\Android\Android Studio\jbr`.

Android Studio chỉ cần để cài SDK và khởi động máy ảo; không bắt buộc mở source code của repository trong Android Studio. Ứng dụng dùng `react-native-webrtc`, vì vậy phải chạy **Expo development build** và không thể dùng Expo Go.

## Chạy lần đầu sau khi clone

Các lệnh dưới đây chạy tại **thư mục gốc của repository**. Trên Windows PowerShell, tài liệu dùng `npm.cmd` để tránh lỗi execution policy; trên macOS/Linux có thể thay bằng `npm`.

### 1. Clone, cài package và tạo `.env`

```powershell
git clone https://github.com/Ngocnguyen055/mobile_app.git Mobile_App
Set-Location Mobile_App
npm.cmd ci
Copy-Item .env.example .env
```

Trên macOS/Linux, dùng `cd Mobile_App`, `npm ci` và `cp .env.example .env`. Chỉ sửa file `.env`. Không dán mật khẩu hoặc connection string thật vào `.env.example`, vì file mẫu được đưa lên GitHub. `.env` đã nằm trong `.gitignore`.

### 2. Cấu hình MongoDB

Với MongoDB Atlas:

1. Tạo database user trong **Database Access**.
2. Cho phép IP hiện tại trong **Network Access**.
3. Lấy connection string ở **Connect → Drivers** và chọn Node.js.
4. Điền database name, ví dụ `student_planner`, rồi gán chuỗi đó cho `MONGO_URL` trong `.env`.

Ví dụ cấu trúc, không dùng nguyên giá trị này:

```dotenv
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/student_planner?retryWrites=true&w=majority
```

Nếu mật khẩu có ký tự như `@`, `:`, `/` hoặc `#`, phải URL encode mật khẩu trước khi đưa vào connection string. `JWT_SECRET` và `PEER_SECRET` nên là hai chuỗi ngẫu nhiên khác nhau, dài ít nhất 32 ký tự.

Nếu muốn dùng MongoDB cục bộ bằng Docker Desktop, dùng `MONGO_URL=mongodb://127.0.0.1:27017/student_planner?replicaSet=rs0` rồi chạy trước bước seed:

```powershell
docker compose -f deploy/compose.yaml up -d mongo
docker compose -f deploy/compose.yaml ps
```

Nếu dùng Android Emulator mặc định của Android Studio, đặt các URL mobile như sau:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
EXPO_PUBLIC_SIGNAL_URL=http://10.0.2.2:4001
EXPO_PUBLIC_RELAY_URL=http://10.0.2.2:4002
```

`10.0.2.2` là địa chỉ để Android Emulator truy cập máy Windows đang chạy server. Nếu dùng điện thoại thật, thay bằng IPv4 LAN của máy tính, ví dụ `http://192.168.1.20:4000`, và cho phép các cổng qua Windows Firewall. Các biến `PUBLIC_*` và `VITE_*` cho server/web vẫn dùng `localhost` khi chạy trên cùng máy.

Để Google Calendar trống hai biến `EXPO_PUBLIC_GOOGLE_*` cho đến khi nhóm tạo OAuth client thật. Các phần đăng nhập, dự án, task và lịch nội bộ vẫn chạy bình thường.

### 3. Cấu hình Java và Android SDK trên Windows

Mở PowerShell mới và đặt biến cho terminal hiện tại:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
java -version
adb version
```

Để lưu cho các terminal mở sau này:

```powershell
$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
[Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $androidSdk, "User")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathParts = @($userPath -split ';' | Where-Object { $_ })
foreach ($entry in @("$javaHome\bin", "$androidSdk\platform-tools")) {
  if ($pathParts -notcontains $entry) { $pathParts = @($entry) + $pathParts }
}
[Environment]::SetEnvironmentVariable("Path", ($pathParts -join ';'), "User")
```

Đóng và mở lại PowerShell sau khi lưu biến. Chạy `where.exe java`, `java -version`, `adb version` để phát hiện một JDK cũ còn đứng trước trong `PATH`. Nếu Android SDK nằm ở thư mục khác, xem đường dẫn thật tại **Android Studio → Settings → Android SDK** rồi dùng đường dẫn đó. Trong Android Studio, mở **SDK Manager**, cài đủ các thành phần nêu ở phần yêu cầu và chấp nhận Android SDK licenses.

### 4. Tạo dữ liệu mẫu và chạy API

Seed là tùy chọn; có thể bỏ qua và đăng ký tài khoản mới trong ứng dụng. Với database đã dùng bản cũ, dừng các service, sao lưu rồi chạy migration trước khi mở bản mới:

```powershell
npm.cmd run migrate:projects
npm.cmd run migrate:projects -- --apply
```

Lệnh đầu là dry run không sửa dữ liệu. Lệnh `--apply` bổ sung vai trò/thông tin nhóm, giữ dự án cũ là độc lập và backfill revision bài thảo luận. Xem chi tiết trong [hierarchical-projects.md](docs/hierarchical-projects.md). Database mới tạo bằng API đã có cấu trúc mới; nếu chạy seed vào DB cũ, chạy migration lại sau seed.

```powershell
npm.cmd run seed
```

Lệnh seed ghi trực tiếp vào database được chỉ ra bởi `MONGO_URL` và có thể chạy lại để bổ sung phần dữ liệu mẫu còn thiếu. Không chạy seed trên database production hoặc database chứa dữ liệu cần giữ nguyên.

Seed thành công sẽ in ba tài khoản:

| Email               | Mật khẩu          |
| ------------------- | ----------------- |
| `an@example.test`   | `StudentDemo123!` |
| `binh@example.test` | `StudentDemo123!` |
| `chi@example.test`  | `StudentDemo123!` |

Chỉ dùng các tài khoản và mật khẩu mẫu trong môi trường học tập/phát triển.

Mở terminal thứ nhất tại thư mục gốc:

```powershell
npm.cmd run dev:api
```

Có thể kiểm tra API và MongoDB bằng:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

Kết quả cần có `service: api` và `mongo: True`.

### 5. Build và chạy ứng dụng Android

Khởi động máy ảo trong **Android Studio → Device Manager** và đợi Android vào màn hình chính. Ở terminal thứ hai, vẫn tại thư mục gốc, chạy:

```powershell
npm.cmd run android
```

Lệnh này gọi `expo run:android` đúng trong workspace `src/mobile`, tự tạo thư mục native nếu bản clone chưa có, build development client, cài APK lên máy ảo và khởi động Metro. Lần đầu có thể mất vài phút. Không chạy `npx expo run:android` tại thư mục gốc vì cấu hình mobile thật nằm trong `src/mobile`.

Sau khi development client đã được cài, những lần chạy tiếp theo chỉ cần:

```powershell
npm.cmd run dev:mobile
```

Nhấn `a` để mở app trên Android hoặc `r` để reload app đang mở. Phải khởi động lại Metro sau khi thay đổi biến `EXPO_PUBLIC_*`. Chỉ cần build lại development client khi đổi native dependency, plugin hoặc cấu hình Android.

### 6. Chạy chat và web peer DS01

Các chức năng tài khoản, dự án, task và lịch chỉ cần API. Chat nhóm dự án cần cả API, signaling và relay để kiểm tra membership/archive. Trong `.env`, bổ sung `API_INTERNAL_URL=http://127.0.0.1:4000` và `SIGNAL_INTERNAL_URL=http://127.0.0.1:4001`; ba service dùng cùng `PEER_SECRET`. Khởi động signaling và relay trước khi mở Chat trên Android, ở hai terminal riêng:

```powershell
npm.cmd run dev:signaling
```

```powershell
npm.cmd run dev:relay
```

Kiểm tra hai dịch vụ:

```powershell
Invoke-RestMethod http://localhost:4001/health
Invoke-RestMethod http://localhost:4002/health
```

Để mở web peer, chạy thêm:

```powershell
npm.cmd run dev:web
```

| Thành phần | Địa chỉ local           |
| ---------- | ----------------------- |
| API        | `http://localhost:4000` |
| Signaling  | `http://localhost:4001` |
| Relay      | `http://localhost:4002` |
| Web peer   | `http://localhost:5173` |
| Metro      | `http://localhost:8081` |

Mở ba cửa sổ hoặc profile trình duyệt riêng và đăng ký `peer-a`, `peer-b`, `peer-c` để chạy demo web. Mỗi profile giữ secret Peer ID riêng trong localStorage.

Thứ tự đầy đủ khi chạy cả Mobile và DS01 là: MongoDB → migration nếu DB cũ / seed tùy chọn → API → signaling → relay → Android/Metro; web peer là tùy chọn.

## Dự án phân cấp, thảo luận và thông báo

Khi tạo dự án, chọn **Độc lập** (thành viên quản lý task chung như trước) hoặc **Phân cấp** (Giám đốc → Trưởng phòng → Nhân viên). Trong dự án, dùng **☰** mở menu dọc **Task, Lịch, Tiến độ, Chat, Thảo luận, Nguồn lực, Thành viên, Quản lý dự án**.

Giám đốc thêm thành viên vào tổng bằng email, rồi tạo dự án con và bổ nhiệm Trưởng phòng. Trưởng phòng chỉ chọn thành viên đã thuộc tổng; nhân viên chỉ cập nhật trạng thái task được giao. Tiến độ có nút mở task từng người và trạng thái Quá hạn tự tính theo deadline. Xóa thành viên thu hồi quyền/nhóm chat, bỏ hoặc chuyển phân công; xóa Trưởng phòng bắt buộc chọn người thay thế. Lưu trữ làm dự án chỉ đọc; lưu trữ tổng áp dụng cả con và khôi phục tổng có lựa chọn khôi phục con.

Phần **Bổ nhiệm Trưởng phòng** dùng danh sách thả xuống: bấm ô chọn, nhập email hoặc một phần email để lọc, rồi chọn thành viên. Danh sách chỉ lấy người đã thuộc dự án tổng và đủ điều kiện bổ nhiệm; gõ email không tự thêm tài khoản vào dự án. Cách chọn này áp dụng cả khi tạo dự án con, thay Trưởng phòng và chọn người thay thế lúc xóa.

Nhóm chat dự án được tạo tự động và đồng bộ membership từ MongoDB. Tab **Tài liệu** được bỏ, chuyển tệp / ảnh vào bài **Thảo luận** (tối đa 3 tệp/bài, 512 KiB/tệp); bình luận có quyền sửa/xóa riêng. **🔔 Thông báo** là hộp thư lưu MongoDB, loại actor và giới hạn đúng dự án; chưa có push server. Quy tắc/API/giả định và luồng demo đầy đủ ở [hierarchical-projects.md](docs/hierarchical-projects.md).

Development build phải được tạo lại sau khi thay native dependency/config plugin. `react-native-webrtc` dùng plugin `@config-plugins/react-native-webrtc`. Thử chat trực tiếp trên Android **ngay khi có APK**: đăng nhập hai máy cùng Wi-Fi, chọn chat dự án, gửi và xác nhận nhãn DIRECT và relay log không có `FORWARD` của Message ID đó. Nếu không DIRECT, lấy ICE state/log và sửa trước khi tuyên bố chức năng chạy.

## Lỗi cài đặt thường gặp

### `Unsupported class file major version 69`

Terminal đang dùng JDK quá mới. Trỏ `JAVA_HOME` về thư mục `jbr` của Android Studio, mở terminal mới rồi chạy lại `npm.cmd run android`. Có thể dừng Gradle daemon cũ trước khi build lại:

```powershell
Push-Location src/mobile/android
.\gradlew.bat --stop
Pop-Location
```

### `SDK location not found`

Kiểm tra `ANDROID_HOME`. Nếu vẫn lỗi và thư mục `src/mobile/android` đã được tạo, tạo file `src/mobile/android/local.properties` với đường dẫn SDK của chính máy đó:

```properties
sdk.dir=C:/Users/<ten-windows>/AppData/Local/Android/Sdk
```

Không đưa `local.properties` của máy cá nhân lên GitHub.

### `Activity not started, unable to resolve Intent`

Development client chưa được cài hoặc máy ảo chưa khởi động xong. Cold Boot máy ảo nếu cần, đợi màn hình Android xuất hiện rồi chạy `npm.cmd run android`. Sau khi APK đã được cài mới dùng `npm.cmd run dev:mobile`.

### MongoDB Atlas báo `querySrv ECONNREFUSED`

Kiểm tra lại Atlas Network Access, database user, connection string và DNS SRV:

```powershell
Resolve-DnsName -Type SRV _mongodb._tcp.<cluster>.mongodb.net
```

Nếu PowerShell phân giải được nhưng Node.js vẫn bị từ chối, thử mạng khác hoặc đổi DNS của Windows sang DNS công cộng, mở terminal mới rồi chạy lại. Không chuyển sang database giả để bỏ qua lỗi Atlas.

### App không gọi được API

- Android Emulator dùng `10.0.2.2`, không dùng `localhost`.
- Điện thoại thật dùng IPv4 LAN của máy chạy API và phải cùng mạng Wi-Fi.
- Sau khi sửa `.env`, dừng Metro bằng `Ctrl+C` rồi chạy lại `npm.cmd run dev:mobile`.
- Kiểm tra `http://localhost:4000/health` trên máy tính trước.

### PowerShell báo `npm.ps1 cannot be loaded`

Dùng `npm.cmd` và `npx.cmd` như các lệnh trong README, hoặc chạy lệnh bằng Command Prompt. Không cần thay execution policy của toàn máy chỉ để chạy repository này.

### `adb devices` không thấy máy ảo

Đợi máy ảo vào màn hình chính rồi chạy `adb devices`. Nếu danh sách vẫn trống, dùng **Cold Boot Now** trong Device Manager, kiểm tra Platform Tools và khởi động lại ADB bằng `adb kill-server`, sau đó `adb start-server`.

### Cổng đã được sử dụng

API, signaling, relay và Metro lần lượt dùng cổng 4000, 4001, 4002 và 8081. Dừng process cũ hoặc terminal Metro cũ trước khi chạy thêm một bản; không mở hai Metro trên cùng cổng.

## Lịch trên Android

Sau khi đăng nhập hoặc khôi phục phiên, app mở **Lịch của tôi**. Đây là lịch tổng hợp, không yêu cầu chọn dự án trước:

- task có deadline được phân công cho người đang đăng nhập từ mọi dự án họ tham gia;
- sự kiện cá nhân do người dùng tạo;
- sự kiện của các dự án mà người dùng là thành viên.

Thanh điều hướng dưới cùng mở `Lịch`, `Dự án`, `Tin nhắn` và `Cá nhân`; mỗi dự án vẫn có tab lịch riêng. Lịch dùng múi giờ `Asia/Ho_Chi_Minh`, định dạng `dd/MM/yyyy`, tuần bắt đầu từ thứ Hai và có tiêu đề `T2, T3, T4, T5, T6, T7, CN`. Người dùng có thể chuyển ngày/tuần/tháng và lọc bằng đúng ba phạm vi `Tất cả`, `Cá nhân`, `Dự án`. Phạm vi `Dự án` gộp nội dung của mọi dự án người dùng được phép xem, thay vì tạo một nút lọc cho từng dự án.

Trên lịch chính, `Tất cả` và `Cá nhân` chỉ cung cấp `+ Thêm sự kiện`; không có thao tác tạo task tại đây. Phạm vi `Dự án` không cung cấp nút thêm sự kiện hoặc task. Task và sự kiện gắn dự án hiển thị `Xem / sửa`; thao tác này mở đúng dự án và tab phù hợp trước khi cho phép chỉnh sửa. Tab `Lịch` bên trong một dự án cũng không có nút tạo sự kiện hoặc task; task được tạo trong tab `Task`, còn mục đã có vẫn được xem hoặc chỉnh sửa trong ngữ cảnh dự án.

Khối `Lịch của tôi / Hiển thị` và header dự án gồm `☰`, `← Danh sách`, tên dự án, mục đang mở được đặt ngoài vùng cuộn dọc. Menu dự án mở theo chiều dọc trong drawer, không còn hàng tab cuộn ngang.

Form tạo/sửa sự kiện mở trong modal sheet gần toàn màn hình. Trường chính mang nhãn `Nội dung sự kiện`; các tùy chọn còn lại gồm thời gian bắt đầu/kết thúc, cả ngày, dự án và mốc nhắc 1 tuần, 1 ngày hoặc 1 giờ. Chạm vào `Bắt đầu` hoặc `Kết thúc` sẽ mở bộ chọn ngày rồi bộ chọn giờ 24 giờ dạng spinner của Android, thay vì nhập chuỗi ngày giờ bằng tay. Bộ chọn dùng native module `@react-native-community/datetimepicker`, vì vậy cần tạo lại development build sau lần cài dependency đầu tiên. App gọi `GET /calendar` để lấy lịch tổng hợp; tạo, sửa và xóa sự kiện qua `POST /events`, `PATCH /events/:eventId`, `DELETE /events/:eventId`. API lấy danh tính từ JWT, chỉ trả sự kiện cá nhân của chính người dùng và sự kiện thuộc dự án họ có quyền truy cập.

Form tạo/sửa task có hai trường riêng: `Bắt đầu` và `Kết thúc (deadline)`. Cả hai dùng cùng popup native chọn ngày rồi chọn giờ 24 giờ như sự kiện cá nhân, nên người dùng không phải nhập chuỗi thời gian. API lưu mốc mới trong `startsAt` và từ chối khi thời gian bắt đầu không nhỏ hơn thời gian kết thúc. `startsAt` vẫn là trường tùy chọn trong dữ liệu để các task đã tạo trước thay đổi này tiếp tục đọc được; `dueAt` vẫn là deadline dùng để tính sắp quá hạn, quá hạn và lên lịch nhắc.

Khi thử tiếng Việt bằng bàn phím máy tính trong Android Emulator, chỉ bật một bộ gõ: tắt/chuyển UniKey trên Windows sang tiếng Anh và chọn `Tiếng Việt` trong Gboard của emulator, đồng thời bật `Hardware Input` trong cửa sổ Running Devices. Thử cùng chuỗi trong Chrome của emulator để phân biệt cấu hình IME với lỗi ứng dụng.

Thông báo được lên lịch cục bộ trên Android. Khi thời gian hoặc mốc nhắc của sự kiện thay đổi, mã hiện tại hủy lịch cũ rồi tạo lịch mới; khi xóa sự kiện, mã hủy các thông báo tương ứng. Hành vi thực tế này còn phải kiểm tra trên emulator/điện thoại theo `docs/test-plan.md`.

## Lệnh kiểm tra

Chat cá nhân 1–1 dùng API `GET /contacts`, `PeerClient.lookupPeer`, `sendDirect`, `DirectChatService`, cùng `putDirect`/`listDirect` trong SQLite và localStorage. Trên Android, mở tab `Tin nhắn`, chọn một thành viên cùng dự án, rồi gửi khi người đó online. Màn hình hiển thị trạng thái ACK, nhãn `DIRECT`/`RELAY`, lịch sử cục bộ và khóa ô gửi khi peer offline; hệ thống không xếp hàng giao tin offline. Danh bạ không có chức năng kết bạn. Xem [cách gọi service, query lịch sử và giới hạn](docs/direct-chat.md). Chat nhóm trong tab `Chat` của dự án vẫn dùng `sendGroup` và không bị trộn vào hội thoại 1:1.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:calendar-api
npm.cmd run test:contacts-api
npm.cmd run test:hierarchy-api
npm.cmd run build -w @ds01/web-peer
Push-Location src/mobile
npx.cmd expo install --check
Pop-Location
npx.cmd tsx scripts/benchmark-relay.ts
```

`test:calendar-api` và `test:contacts-api` cần MongoDB đang chạy, `MONGO_URL` đúng và dữ liệu seed. Script contacts chỉ đọc dữ liệu, có thể chọn tài khoản kiểm thử qua `CONTACTS_TEST_EMAIL`/`CONTACTS_TEST_PASSWORD`. `test:hierarchy-api` tạo database tạm riêng trên cluster cấu hình, dùng Mongo thật rồi dọn database tạm; cần tài khoản DB có quyền tương ứng. `benchmark-relay.ts` cần signaling và relay đang chạy; script in p50/p95/max của 100 lần gửi, chỉ xem là bằng chứng nếu thực sự chạy và lưu đầu ra. `scripts/simulate-fault.ps1` chạy riêng test DataChannel cố tình không mở để tái hiện fallback. `docs/test-plan.md` có ca kiểm thử thủ công cho API, thiết bị, mạng và OAuth.

## Cấu hình Google Calendar

Google Calendar dùng Google Sign-In native, không qua Expo Go. Bật Google Calendar API và OAuth consent trong Google Cloud. Tạo **Android OAuth client** cho package `edu.student.plannerds01` cùng SHA-1 của debug/development build; tạo **Web OAuth client ID** và điền `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Xem [hướng dẫn Google Sign-In của Expo](https://docs.expo.dev/guides/google-authentication/) và [cấu hình client/SHA-1](https://react-native-google-signin.github.io/docs/setting-up/get-config-file). `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` để ghi nhận cấu hình bên ngoài nhưng native Android đối chiếu package/SHA-1 trong Google Cloud; app dùng Web client ID cho `GoogleSignin.configure`.

Trong app, **Kết nối Google** cấp quyền `calendar.events`, **Đồng bộ ngay** upsert một chiều các task chưa hoàn thành được phân công cho người dùng, sự kiện cá nhân và sự kiện dự án đang có trong lịch tổng hợp vào lịch chính của chính người đó. Mỗi mục tìm theo `privateExtendedProperty.studentPlannerKey` trước khi insert, rồi patch nếu đã tồn tại; ID ổn định tránh trùng khi hai lần insert chạy gần nhau. Không tự xóa sự kiện Google khi task hoàn thành hoặc một mục bị xóa trong app; nhóm cần xử lý thủ công các mục Google cũ. Token Google do native SDK quản lý; app không lưu token Google trong MongoDB. Chưa có credential Google trong repo, nên OAuth và đồng bộ thật chưa được kiểm thử. Xem [Google Calendar extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties).

## Internet và hai mạng

Xem `deploy/internet.env.example`, `deploy/Caddyfile.example` và `docs/architecture.md`. Có thể đặt API, signaling và relay trên một máy nhưng chạy process riêng, phía ngoài dùng HTTPS/WSS qua reverse proxy. Một cách thử không cần trả phí/tạo tài khoản là ba [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) cho cổng 4000, 4001, 4002; nếu web peer cũng chạy trên máy chủ thì thêm tunnel thứ tư cho cổng 5173. URL ngẫu nhiên đổi khi restart, chỉ phù hợp demo. Cần build Android với ba URL mới, hoặc dùng Metro development build nạp lại cấu hình. Tunnel chỉ đưa signaling/relay ra Internet; nó **không** biến kết nối WebRTC thành DIRECT. NAT chặn đường trực tiếp thì app chuyển sang relay. Không có TURN trong repo.

## Cấu trúc

- `src/mobile`: Android Expo, lịch tổng hợp, SQLite chat, notifications và Google Calendar.
- `src/web-peer`: peer web DS01, lịch sử localStorage, log và nút ép RELAY.
- `src/api`: REST API tài khoản/dự án/task/lịch/thảo luận/tệp/nguồn lực.
- `src/signaling`: peer discovery, heartbeat, nhóm và SDP/ICE.
- `src/relay`: chuyển đúng đích và ACK envelope qua Socket.IO.
- `src/shared`: schema message và PeerClient chung.
- `tests`, `scripts`, `deploy`, `docs`: test, seed, benchmark, cấu hình và kịch bản.

## Giới hạn hiện tại

Nhóm dự án và quyền thành viên lưu MongoDB; restart signaling nạp lại nhóm với ID đã lưu. Nhóm demo web tự tạo và sổ secret Peer ID demo vẫn ở RAM nên phải tạo lại sau restart. Lịch sử chat chỉ nằm ở SQLite trên Android hoặc localStorage trên web, không gửi lại tin cho peer offline. Relay không lưu tin. Chat nhóm cần signaling/API đang hoạt động để xác minh quyền; DIRECT vẫn gửi body qua DataChannel. Hệ thống không thu hồi tin đã lưu trên thiết bị và không thể cưỡng chế phần mềm P2P cố ý bỏ kiểm tra. Phân cấp hiện có hai tầng và một Trưởng phòng/dự án con, chưa có chuyển Giám đốc hoặc xóa vĩnh viễn dự án. Cấu hình local cho phép HTTP cleartext; Internet dùng HTTPS/WSS. Không có thanh toán, TURN, push server hoặc bảo đảm phân tán qua nhiều instance signaling. Các luồng mới vẫn cần chạy Mongo thật và kiểm tra Android theo test plan.
