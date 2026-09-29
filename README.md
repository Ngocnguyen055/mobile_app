# Student Planner + DS01 P2P Chat

Monorepo TypeScript cho bài tập lớn nhóm ba sinh viên: ứng dụng Android quản lý dự án và lịch, web peer nhỏ để demo DS01, REST API MongoDB, signaling Socket.IO và relay Socket.IO chạy **hai process riêng**. Android dùng Expo development build có `react-native-webrtc`; Expo Go không chạy được module native này.

## Trạng thái kiểm chứng

- Đã chạy trên máy phát triển: `npm run typecheck`, `npm run lint`, `npm test` (18 test trong 7 file), `npm run build -w @ds01/web-peer`, `expo install --check`, `expo prebuild --platform android --no-install` và `expo export --platform android`. Riêng `tests/calendar-policy.test.ts` có 4 ca kiểm tra phạm vi lịch, quyền tạo và điều hướng dự án.
- Benchmark relay localhost 100 tin tuần tự: p50 0,545 ms, p95 1,023 ms; đầu ra thật ở `docs/evidence/benchmark.txt`. Chưa đo trên Internet.
- Test tự động kiểm tra discovery ba peer, nhóm có sửa gần đồng thời, relay định tuyến và từ chối sender giả, fallback từ **DataChannel giả lập không mở** sang relay, ACK và chống trùng. `npm run test:calendar-api` đã chạy thật với MongoDB Atlas cho lịch tổng hợp, CRUD, ACL hai user, quyền chuyển event cá nhân/dự án, dữ liệu sai và dọn sự kiện tạm. Chưa kiểm chứng toàn bộ API ngoài phạm vi script này, DIRECT WebRTC thực, notification Android, Google OAuth hay đồng bộ Google Calendar với tài khoản thật.
- Development build đã chạy sau đăng nhập trên Android emulator. Ngày 28/09/2026, ADB đã xác nhận ba phạm vi lịch, chính sách nút tạo, điều hướng `Xem / sửa`, lịch dự án không có nút tạo và hai thanh công cụ cố định khi cuộn; ảnh thật nằm trong `docs/evidence/`. Việc phát, cập nhật và hủy notification vẫn cần nhóm kiểm tra riêng theo `docs/test-plan.md`.
- Khi chạy demo thật, lưu log và ảnh vào `docs/evidence/` theo `docs/demo-script.md`. Không có ảnh hoặc số đo thực tế nào được dựng sẵn.

## Yêu cầu

Node.js 20.19+ (đã dùng Node 24), npm, MongoDB 7, Android SDK + JDK để build Android, ba trình duyệt hoặc điện thoại cho demo. Docker chỉ cần nếu muốn khởi động MongoDB bằng Compose.

## Chạy local

```powershell
Copy-Item .env.example .env
npm install
docker compose -f deploy/compose.yaml up -d mongo  # tùy chọn; hoặc MongoDB cài sẵn
npm run seed
```

Mở **bốn terminal riêng**, chạy:

```powershell
npm run dev:api
npm run dev:signaling
npm run dev:relay
npm run dev:web
```

Web peer ở `http://localhost:5173`. Mở ba trình duyệt hoặc ba profile riêng với Peer ID `peer-a`, `peer-b`, `peer-c`; mỗi profile có secret riêng trong localStorage. Seed tạo `an@example.test`, `binh@example.test`, `chi@example.test` với mật khẩu mẫu `StudentDemo123!`. Chỉ dùng tài khoản mẫu ở local.

Android: sửa `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SIGNAL_URL`, `EXPO_PUBLIC_RELAY_URL` trong `.env` thành IP LAN máy chủ; `localhost` trên điện thoại là điện thoại. Biến `EXPO_PUBLIC_*` được nạp lúc Metro/build chạy. Trong `src/mobile`:

```powershell
npx expo prebuild --platform android
npx expo run:android
npx expo start --dev-client
```

Development build phải được tạo lại sau khi thay native dependency/config plugin. `react-native-webrtc` dùng plugin `@config-plugins/react-native-webrtc`. Thử chat trực tiếp trên Android **ngay khi có APK**, trước khi mở rộng demo: đăng nhập hai máy cùng Wi-Fi, chọn chat dự án, gửi và xác nhận nhãn DIRECT và relay log không có `FORWARD` của Message ID đó. Nếu không DIRECT, lấy ICE state/log và sửa trước khi tuyên bố chức năng chạy.

## Lịch trên Android

Sau khi đăng nhập hoặc khôi phục phiên, app mở **Lịch của tôi**. Đây là lịch tổng hợp, không yêu cầu chọn dự án trước:

- task có deadline được phân công cho người đang đăng nhập từ mọi dự án họ tham gia;
- sự kiện cá nhân do người dùng tạo;
- sự kiện của các dự án mà người dùng là thành viên.

Thanh điều hướng dưới cùng mở `Lịch`, `Dự án` và `Cá nhân`; mỗi dự án vẫn có tab lịch riêng. Lịch dùng múi giờ `Asia/Ho_Chi_Minh`, định dạng `dd/MM/yyyy`, tuần bắt đầu từ thứ Hai và có tiêu đề `T2, T3, T4, T5, T6, T7, CN`. Người dùng có thể chuyển ngày/tuần/tháng và lọc bằng đúng ba phạm vi `Tất cả`, `Cá nhân`, `Dự án`. Phạm vi `Dự án` gộp nội dung của mọi dự án người dùng được phép xem, thay vì tạo một nút lọc cho từng dự án.

Trên lịch chính, `Tất cả` và `Cá nhân` chỉ cung cấp `+ Thêm sự kiện`; không có thao tác tạo task tại đây. Phạm vi `Dự án` không cung cấp nút thêm sự kiện hoặc task. Task và sự kiện gắn dự án hiển thị `Xem / sửa`; thao tác này mở đúng dự án và tab phù hợp trước khi cho phép chỉnh sửa. Tab `Lịch` bên trong một dự án cũng không có nút tạo sự kiện hoặc task; task được tạo trong tab `Task`, còn mục đã có vẫn được xem hoặc chỉnh sửa trong ngữ cảnh dự án.

Khối `Lịch của tôi / Hiển thị` và thanh dự án gồm `← Danh sách`, tên dự án, `Task`, `Lịch`, `Tiến độ`, `Chat`, `Thảo luận`, `Tài liệu` được đặt ngoài vùng cuộn dọc. Vì vậy bộ lọc lịch hoặc thanh chuyển tab dự án vẫn cố định khi nội dung bên dưới được cuộn; hàng tab dự án có thể cuộn ngang trên màn hình hẹp.

Form tạo/sửa sự kiện mở trong modal sheet gần toàn màn hình. Trường chính mang nhãn `Nội dung sự kiện`; các tùy chọn còn lại gồm thời gian bắt đầu/kết thúc, cả ngày, dự án và mốc nhắc 1 tuần, 1 ngày hoặc 1 giờ. Chạm vào `Bắt đầu` hoặc `Kết thúc` sẽ mở bộ chọn ngày rồi bộ chọn giờ 24 giờ dạng spinner của Android, thay vì nhập chuỗi ngày giờ bằng tay. Bộ chọn dùng native module `@react-native-community/datetimepicker`, vì vậy cần tạo lại development build sau lần cài dependency đầu tiên. App gọi `GET /calendar` để lấy lịch tổng hợp; tạo, sửa và xóa sự kiện qua `POST /events`, `PATCH /events/:eventId`, `DELETE /events/:eventId`. API lấy danh tính từ JWT, chỉ trả sự kiện cá nhân của chính người dùng và sự kiện thuộc dự án họ có quyền truy cập.

Form tạo/sửa task có hai trường riêng: `Bắt đầu` và `Kết thúc (deadline)`. Cả hai dùng cùng popup native chọn ngày rồi chọn giờ 24 giờ như sự kiện cá nhân, nên người dùng không phải nhập chuỗi thời gian. API lưu mốc mới trong `startsAt` và từ chối khi thời gian bắt đầu không nhỏ hơn thời gian kết thúc. `startsAt` vẫn là trường tùy chọn trong dữ liệu để các task đã tạo trước thay đổi này tiếp tục đọc được; `dueAt` vẫn là deadline dùng để tính sắp quá hạn, quá hạn và lên lịch nhắc.

Khi thử tiếng Việt bằng bàn phím máy tính trong Android Emulator, chỉ bật một bộ gõ: tắt/chuyển UniKey trên Windows sang tiếng Anh và chọn `Tiếng Việt` trong Gboard của emulator, đồng thời bật `Hardware Input` trong cửa sổ Running Devices. Thử cùng chuỗi trong Chrome của emulator để phân biệt cấu hình IME với lỗi ứng dụng.

Thông báo được lên lịch cục bộ trên Android. Khi thời gian hoặc mốc nhắc của sự kiện thay đổi, mã hiện tại hủy lịch cũ rồi tạo lịch mới; khi xóa sự kiện, mã hủy các thông báo tương ứng. Hành vi thực tế này còn phải kiểm tra trên emulator/điện thoại theo `docs/test-plan.md`.

## Lệnh kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npm run test:calendar-api
npm run build -w @ds01/web-peer
Push-Location src/mobile
npx expo install --check
Pop-Location
npx tsx scripts/benchmark-relay.ts
```

`benchmark-relay.ts` cần signaling và relay đang chạy; in p50/p95/max của 100 lần gửi, chỉ xem là bằng chứng nếu thực sự chạy và lưu đầu ra. `scripts/simulate-fault.ps1` chạy riêng test DataChannel cố tình không mở để tái hiện fallback. `docs/test-plan.md` có ca kiểm thử thủ công cho API, thiết bị, mạng và OAuth.

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

Signaling/nhóm lưu trong RAM; restart signaling làm mất nhóm DS01. Chủ dự án có thể dùng nút tạo/khôi phục nhóm để tạo ID mới; nhóm web demo phải tạo lại. Lịch sử chat chỉ nằm ở SQLite trên Android hoặc localStorage trên web, không gửi lại tin cho peer offline. Relay lưu kết nối hiện hành, không lưu tin. Web demo Peer ID giữ bằng secret trong RAM signaling; restart server làm mất sổ secret demo. Android Peer ID là Mongo user ID và xác thực bằng JWT tài khoản. Cấu hình local cho phép HTTP cleartext để phát triển; Internet phải dùng HTTPS/WSS. Dữ liệu tài liệu nằm trong MongoDB và giới hạn 512 KiB/tệp; không phù hợp lưu file lớn. Không có thanh toán, TURN, push từ server hoặc bảo đảm phân tán qua nhiều instance signaling.
