# Thiết kế Lịch sử hoạt động cài đặt

## Bối cảnh

Nhuu-chat cần một trang `Cài đặt > Lịch sử` để ghi lại các thay đổi quan trọng do người dùng thực hiện. Bản đầu ghi nhận hai nhóm hành động đã có API thực tế:

- Cập nhật Trợ lý AI (`AI Settings`).
- Kết nối và ngắt kết nối Facebook Page, bao gồm cả luồng OAuth và nhập thủ công.

Các tab phân loại `Xóa bình luận`, `Chặn khách hàng` và `Chế độ xoay vòng` không thuộc giao diện lịch sử bản đầu. Lịch sử dùng một Timeline chung và có bộ lọc theo loại hành động để mở rộng về sau.

## Mục tiêu và giới hạn

### Mục tiêu

- Lưu được người thực hiện, loại hành động, tiêu đề, các trường thay đổi, mã phiên bản và thời điểm.
- So sánh được giá trị trước/sau, kể cả object lồng nhau, nhưng không ghi log nếu không có thay đổi thực tế.
- Truy vấn có phân trang, lọc theo `actionType`, chỉ trả dữ liệu thuộc người dùng hiện tại.
- Giữ tối đa 500 bản ghi lịch sử cho mỗi người dùng; bản ghi cũ nhất bị dọn sau khi tạo bản ghi thứ 501.
- Hiển thị Timeline responsive với trạng thái cũ/mới, hash, avatar/tên người thực hiện và ghi chú giới hạn lịch sử.
- Giữ nguyên hoàn toàn đăng nhập Facebook thủ công bằng Page ID + Page Access Token.

### Không thuộc phạm vi

- Không tạo log giả cho các hành động chưa có API.
- Không sửa logic xác thực, OAuth, mã hóa token hoặc quyền hiện tại.
- Không ghi nội dung secret/token vào `changes`.
- Không triển khai các nghiệp vụ xóa bình luận, chặn khách hàng hoặc chế độ xoay vòng.

## Backend

### Model

Tạo `SettingHistory` tại `apps/api/src/models/setting-history.model.ts` với các trường:

- `userId`: ObjectId, ref `User`, bắt buộc, index.
- `actionType`: string enum mở rộng ở tầng TypeScript/service; bản đầu gồm `UPDATE_AI_SETTINGS`, `CONNECT_FACEBOOK_PAGE`, `DISCONNECT_FACEBOOK_PAGE`.
- `actionTitle`: string, bắt buộc.
- `changes`: array `{ fieldName: string; oldValue: Mixed; newValue: Mixed }`.
- `versionHash`: chuỗi ngắn sinh từ ObjectId hoặc crypto random, dùng để hiển thị/truy vết.
- timestamps `createdAt` và `updatedAt`.

Index chính: `{ userId: 1, createdAt: -1, _id: -1 }` và `{ userId: 1, actionType: 1, createdAt: -1, _id: -1 }`.

### Diff và retention service

Tạo service riêng, ví dụ `apps/api/src/services/setting-history.service.ts`:

- `diffSettings(oldValue, newValue)` đệ quy qua object/array, tạo path field bằng dấu `›`.
- Chuẩn hóa `undefined`, null và primitive để payload trả về ổn định.
- `recordSettingHistory(input)` tạo bản ghi sau mutation thành công, sau đó dọn bản ghi cũ vượt quá 500 theo `userId`.
- Nếu diff rỗng thì không tạo bản ghi.
- Lỗi ghi lịch sử không được làm rollback hoặc biến mutation chính thành thất bại; lỗi phải được log server-side theo cơ chế hiện có.

### Tích hợp mutation

- `updateAiSettings`: đọc settings trước, cập nhật thành công, gọi recorder với diff trước/sau.
- `facebookPageService.connect`: ghi `CONNECT_FACEBOOK_PAGE`; nếu kết nối cũ được thay bằng Page khác, changes phải thể hiện Page cũ/mới nhưng vẫn là một action connect.
- `facebookPageService.remove`: ghi `DISCONNECT_FACEBOOK_PAGE` với thông tin Page đã ngắt kết nối, không ghi access token.
- OAuth select tiếp tục gọi `facebookPageService.connect`, tránh ghi log trùng.

### API đọc lịch sử

Tạo route được bảo vệ bởi `requireRole("admin", "agent")`:

`GET /api/v1/setting-histories?page=1&pageSize=20&actionType=...`

- `pageSize` mặc định 20, giới hạn 50 cho mỗi request.
- `actionType` tùy chọn, chỉ nhận loại được hỗ trợ.
- Query theo `request.auth.id`, sort `createdAt desc, _id desc`.
- Response gồm `{ items, pagination: { page, pageSize, total, totalPages, hasNextPage } }`.
- Populate tối thiểu `userId.name`; User schema hiện chưa có avatar nên frontend luôn có fallback chữ cái, không mở rộng User schema trong phạm vi này.

## Frontend

### Settings navigation

Giữ mục `Lịch sử` trong sidebar Settings và route `/settings/history`. Nội dung lịch sử không render ba tab cũ. Bộ lọc dùng một hàng điều khiển gồm `Tất cả`, `Cài đặt AI`, `Kết nối Facebook` và có thể mở rộng theo action type.

### Components

Tạo các component nhỏ trong `apps/web/src/components/settings/`:

- `SettingHistoryTimeline`: tải dữ liệu, loading/error/empty, phân trang và filter.
- `SettingHistoryTimelineItem`: anchor timeline, header người dùng/thời gian/hash, action title và changes.
- `SettingHistoryValueBadge`: hiển thị old/new an toàn, không render token/secret.

Trang `SettingsPage` chỉ chịu trách nhiệm chọn tab và truyền API context; không đưa logic diff hoặc retention vào frontend.

### UX

- Desktop: nội dung Timeline khoảng 70%, sidebar ghi chú sticky khoảng 30%.
- Mobile: hai cột chuyển thành một cột; sidebar ghi chú nằm sau Timeline.
- Timeline có đường `border-l`, anchor nằm chồng lên đường kẻ.
- Thời gian hiển thị `HH:mm • DD/MM/YYYY` theo múi giờ giao diện hiện tại.
- Badge old/new dùng màu khác nhau và có text, không chỉ dựa vào màu.
- Ghi rõ: hệ thống giữ tối đa 500 bản ghi cho mỗi người dùng.

## Bảo mật và dữ liệu

- Mọi query lịch sử bắt buộc giới hạn theo authenticated user; không nhận `userId` từ query/body.
- Không ghi Page Access Token, OAuth token, cookie, password hoặc secret vào `changes`, `actionTitle` hay log lỗi.
- Chỉ trả các field cần cho UI; không trả raw document ngoài schema response.
- API dùng cùng cookie/session và role guard hiện tại.

## Kiểm thử và nghiệm thu

### Backend

- Unit test diff primitive, nested object, array, null/undefined và diff rỗng.
- Model test kiểm tra schema, ref và index.
- Service test kiểm tra ghi log, retention 500 và không làm mutation chính thất bại khi recorder lỗi.
- Controller/route test kiểm tra auth, filter, pagination và user isolation.
- Regression test AI Settings, Facebook connect/remove và OAuth select không ghi trùng.

### Frontend

- Test filter/action labels, Timeline old/new/hash, empty/loading/error và pagination.
- Test route `/settings/history` và sidebar không còn ba tab phân loại cũ.
- Test responsive class/structure theo quy ước test source hiện có.
- Chạy frontend test suite và production build.

### Tài liệu

- Cập nhật `CHANGELOG.md` dưới `Unreleased`.
- Cập nhật `README.md` phần tính năng/trạng thái và giới hạn retention.
- Cập nhật Wiki source trong `docs/wiki/` theo quy định repo.
