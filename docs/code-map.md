# Bản đồ mã nguồn và quy ước bảo trì

Repository là monorepo với hai workspace: `src/mobile` là ứng dụng React Native/Expo, `src/api` là backend Express. Hai phần giao tiếp bằng HTTP; MongoDB thuộc backend, SQLite và notification thuộc thiết bị.

## Bắt đầu đọc từ đâu?

1. `src/mobile/App.tsx` ghép các controller, phiên đăng nhập và lifecycle.
2. `src/mobile/screens/AppRouter.tsx` chọn màn hình và nối props với controller.
3. Mở screen/component của chức năng cần tìm, sau đó lần theo callback đến hook.
4. Hook dùng hàm có tên theo chức năng trong `services/api/` để gọi server.
5. `src/api/app.ts` cho biết nhóm route nào nhận request; mở module route, schema và policy tương ứng.

## Luồng tạo hoặc sửa task

```text
TaskEditor → ProjectTasksTab → ProjectDetailScreen
  → useTasks.saveTask
  → services/api/tasks.ts
  → services/api/client.ts: HTTP + JWT
  → api/tasks/routes.ts + schemas.ts
  → projectAccess.withWritableProject: quyền + transaction
  → models.Task → MongoDB
  → response → cập nhật reminder và tải lại dự án/lịch
```

`useTasks` quản lý form và thao tác task. `useTaskFocus` quản lý vị trí cuộn và highlight, không gửi request. Kiểm tra trên app hỗ trợ trải nghiệm; quyền truy cập và dữ liệu ghi vẫn phải được backend kiểm tra.

## Luồng lịch và sự kiện

- `CalendarPanel`: chọn chế độ/ngày, lọc dữ liệu và hiển thị agenda.
- `CalendarGrid`: lưới ngày/tuần/tháng/năm.
- `useCalendarEventEditor` và `EventEditorModal`: trạng thái, kiểm tra form và giao diện tạo/sửa sự kiện.
- `useCalendarEvents`: lưu/xóa, tải lại dữ liệu và đối soát nhắc việc.
- `services/api/calendar.ts` → `src/api/calendar/`: request, schema và xử lý server.

## Luồng chat

`useChat` là đầu mối controller được màn hình sử dụng, ghép các phần sau:

| Module | Trách nhiệm |
| --- | --- |
| `hooks/chat/useChatState.ts` | State, ref, chọn nhóm, dọn phiên chat |
| `hooks/chat/useChatSync.ts` | Khởi tạo dữ liệu thiết bị, polling, tải hồ sơ và cập nhật UI |
| `hooks/chat/useDirectChat.ts` | Tìm người, mở hội thoại cá nhân, gửi, chặn và xóa hội thoại |
| `hooks/chat/useProjectChat.ts` | Chọn/tạo/xóa nhóm dự án và gửi tin nhóm |
| `services/chat/messageInput.ts` | Tạo ID và payload tin nhắn |
| `services/chat/persistence.ts` | Gửi outbox và tải trang sync; không phụ thuộc React |
| `services/storage/chatStore.ts` | Message, contact, block, outbox và cursor trong SQLite |
| `services/api/chat.ts` | Giao tiếp với REST API chat |

Khi gửi, app ghi tin và outbox vào SQLite trước. Lỗi mạng/5xx giữ outbox để thử lại. Lỗi HTTP dưới 500 đánh dấu các delivery liên quan là thất bại và bỏ khỏi outbox. Khi server trả lại delivery nhóm, dữ liệu optimistic được thay bằng danh sách người nhận server chấp nhận.

Khi nhận, mỗi trang sync được ghi vào SQLite đầy đủ rồi mới lưu cursor. `tests/mobile-chat-sync.test.ts` kiểm tra lỗi tạm thời, từ chối quyền, thay đổi người nhận nhóm và lỗi lưu trữ giữa các trang.

## Dự án, thành viên và thảo luận

| Phần | Các file cần đọc |
| --- | --- |
| Danh sách dự án | `ProjectListScreen`, `CreateProjectModal`, `ProjectDateFilter`, `useProjects`, `utils/projectList.ts` |
| Thành viên/quản lý | `ProjectManagementPanel`, `ProjectMembersPanel`, `MemberManagementModals`, `useProjectManagement` |
| Dự án phân cấp | `ProjectHierarchyHub`, `services/api/projects.ts`, `api/projects/routes.ts` |
| Quyền và transaction | `api/projectAccess.ts`, `api/projects/mutations.ts` |
| Bài thảo luận | `DiscussionPanel`, `PostEditorModal`, `useDiscussion`, `services/api/discussions.ts` |
| Backend thảo luận | `api/discussions/postRoutes.ts`, `commentRoutes.ts`, `documentRoutes.ts`, `policy.ts`, `postService.ts` |

Các hàm HTTP của dự án nằm trong `services/api/projects.ts`; task, lịch, auth, thảo luận, thông báo và chat có file service riêng. UI không cần tự ghép URL hay biết request dùng JSON hay multipart.

## Lưu trữ trên thiết bị

- `storage/schema.ts`: câu lệnh tạo bảng/index, viết thành SQL nhiều dòng để đọc được.
- `storage/database.ts`: một kết nối SQLite dùng chung và migration dữ liệu cũ.
- `storage/chatStore.ts`: dữ liệu chat theo tài khoản.
- `storage/attachmentStore.ts`: metadata cache tệp theo tài khoản.
- `storage/mobileStore.ts`: facade kết hợp chat và attachment cho các nơi đang dùng `MobileStore`.
- `services/reminders.ts`: lịch notification của task và sự kiện.
- `services/attachmentCache.ts`: tải tệp, kiểm tra kích thước, chia cache theo tài khoản và dọn cache.

Giữ nguyên tên database và các migration khi sửa cấu trúc code; việc di chuyển file không đòi hỏi xóa dữ liệu của người dùng.

## Quy ước khi thêm hoặc sửa tính năng

1. Screen ghép các phần giao diện; component lớn nên tách form, modal hoặc khối UI có ý nghĩa riêng.
2. Hook quản lý state, loading/error và phối hợp các hành động. Đưa phép tính thuần vào `domain/` hoặc `utils/`.
3. Thêm URL/payload HTTP trong `services/api/<chức năng>.ts`; không import `api`/`json` trực tiếp vào screen, component hoặc hook. ESLint kiểm tra quy tắc này.
4. Import DTO từ `types/api.ts`. Không import mã backend vào mobile hoặc ngược lại.
5. Backend thêm route vào nhóm chức năng tương ứng và đăng ký ở `app.ts` hoặc installer của nhóm. Khai báo schema request và kiểm tra quyền trước khi ghi dữ liệu.
6. Dùng lại `withWritableProject` hoặc transaction hiện có cho thao tác cần nhất quán về membership/archive/version.
7. Sửa style trong file chức năng tương ứng ở `styles/app/`; registry `styles/app.ts` chỉ ghép các nhóm.
8. Khi file có nhiều lý do độc lập để thay đổi, tách theo trách nhiệm. Mốc 500 dòng là cảnh báo lint để xem xét, không phải mục tiêu để chia nhỏ tùy tiện.
9. Giữ API public của controller ổn định khi tách module; bỏ export tương thích khi đã chuyển hết nơi sử dụng.
10. Khi thay logic, thêm test cho hành vi hoặc tình huống lỗi liên quan. Khi đổi schema dữ liệu, xem cả dữ liệu cũ và migration.

## Kiểm tra trước khi bàn giao

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run export -w @student-planner/mobile
```

Các test HTTP hiện dùng mock MongoDB; test storage dùng SQLite in-memory. Các script `test:*` trong README kiểm tra MongoDB thật và chỉ nên chạy với database test. Android export kiểm tra bundle JavaScript; UI, notification và lifecycle vẫn cần chạy trên emulator/thiết bị theo [kế hoạch kiểm thử](test-plan.md).
