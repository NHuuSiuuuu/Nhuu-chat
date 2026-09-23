# Thiết kế Cài đặt chung theo tài khoản

## Mục tiêu

Biến tab “Cài đặt chung” hiện đang là placeholder thành nơi quản lý các tùy chọn thông báo và hội thoại của từng tài khoản đăng nhập. Cấu hình phải được lưu ở backend, tải lại được trên thiết bị khác và chỉ ảnh hưởng đến user đang đăng nhập.

## Phạm vi giao diện

Theo ảnh tham chiếu, trang gồm một card “Thông báo và hội thoại” với:

- Toggle bật/tắt thông báo khi có tin nhắn hoặc bình luận mới.
- Lựa chọn âm thanh: “Tắt”, “Mặc định”, “Tri tone”, “Clubhouse”.
- Tùy chọn đẩy hội thoại chưa đọc lên đầu danh sách.
- Tùy chọn chuyển nhanh sang hội thoại chưa đọc kế tiếp.

Tên hiển thị và bố cục bám giao diện hiện tại của SettingsPage; không thêm dependency UI mới.

## Dữ liệu và quyền sở hữu

`generalSettings` được nhúng trong User vì đây là preference cá nhân và dự án đã lưu `aiSettings` theo cách tương tự. User cũ không có field này sẽ nhận giá trị mặc định khi đọc; không cần migration dữ liệu.

```ts
type NotificationSound = "off" | "default" | "tri-tone" | "clubhouse";

interface GeneralSettings {
  browserNotificationsEnabled: boolean;
  notificationSound: NotificationSound;
  moveUnreadConversationsToTop: boolean;
  openNextUnreadConversation: boolean;
}
```

Mặc định:

```ts
{
  browserNotificationsEnabled: true,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false
}
```

Tên `browserNotificationsEnabled` phản ánh copy trong ảnh; ở frontend nó cũng điều khiển toast thông báo tin nhắn đến hiện có để toggle không trở thành trạng thái chỉ có trên backend mà không có tác dụng trực quan.

## API

```text
GET   /api/v1/me/general-settings
PATCH /api/v1/me/general-settings
```

PATCH nhận partial object, validate chặt enum/boolean và chỉ dùng `request.auth.id`. Response của cả GET và PATCH là `GeneralSettings`. Không ghi nhóm này vào setting history hiện tại vì audit history đang giới hạn cho AI Settings và kết nối/ngắt kết nối Facebook Page.

## Hành vi frontend

- Khi mở tab, tải cấu hình một lần và hiển thị loading/error state rõ ràng.
- Mỗi thay đổi được lưu qua PATCH; UI optimistic, rollback về giá trị cũ nếu request lỗi và hiển thị toast lỗi.
- Bật browser notification sẽ gọi `Notification.requestPermission()` khi trình duyệt hỗ trợ. Nếu permission bị từ chối, giữ trạng thái backend nhưng hiển thị cảnh báo hướng dẫn bật quyền; không giả định browser đã cấp quyền.
- Âm thanh chỉ phát cho tin nhắn đến từ customer, không phát cho tin do agent/bot gửi. Xử lý autoplay restriction bằng cách bỏ qua phát âm thanh khi browser chưa cho phép, không làm hỏng luồng realtime.
- Không đổi API hội thoại, unread count hoặc cơ chế auth hiện tại; chỉ bổ sung lớp preference ở client.

## Hành vi Inbox

- `chat:message_received`: nếu user bật thông báo, hiển thị incoming toast hiện có và browser notification khi permission là `granted`; phát sound theo lựa chọn.
- Khi upsert conversation, nếu bật `moveUnreadConversationsToTop`, sắp xếp hội thoại chưa đọc lên trước nhưng vẫn giữ thứ tự thời gian ổn định trong cùng nhóm.
- Khi bật `openNextUnreadConversation`, hiển thị thao tác rõ ràng trong header hội thoại để đánh dấu đã đọc rồi mở hội thoại chưa đọc kế tiếp; chỉ điều hướng sau khi thao tác thành công, không tự chuyển khi người dùng chỉ vừa mở chat.

## Kiểm thử và không nằm trong phạm vi

- Test backend cho default, GET/PATCH, validation, authentication và isolation giữa user.
- Test frontend cho render, load/save, optimistic rollback, permission fallback và các lựa chọn âm thanh.
- Test Inbox cho gate thông báo/âm thanh, sort unread và chọn conversation kế tiếp.
- Không thay đổi luồng đăng nhập, Facebook Page ID/access token, OAuth Facebook, AI Settings hoặc audit-history contract.
- Không thêm file âm thanh bản quyền bên ngoài; implementer dùng asset nội bộ hiện có nếu tìm thấy, nếu không dùng Web Audio API tối giản cho các tone ngắn.
