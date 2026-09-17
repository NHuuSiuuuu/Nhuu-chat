# Inbox Optimistic Messages Design

## Goal

Hiển thị tin nhắn outbound ngay lập tức trong Inbox, phản ánh trạng thái gửi và cho phép retry đúng payload khi delivery thất bại.

## Behavior

- Mỗi lần gửi tạo `clientMessageId` riêng và gửi cùng multipart payload.
- UI thêm message local với `deliveryStatus: "pending"` trước khi gọi API.
- Response HTTP hoặc event Socket.IO có cùng `clientMessageId` sẽ thay thế message local, không tạo bản trùng.
- Khi request lỗi, message local giữ nguyên nội dung và preview file, chuyển sang `deliveryStatus: "failed"`.
- Nhấn indicator lỗi sẽ gửi lại chính text/file đã lưu trong payload retry.
- Retry là một attempt mới có `clientMessageId` mới nhưng vẫn cập nhật cùng message local; event Socket.IO đến trước response HTTP vẫn chỉ có một bubble.
- Backend lưu correlation ID trong `metadata.clientMessageId`; không thêm field hoặc migration MongoDB.

## Boundaries

- Chỉ áp dụng flow gửi tin trong Inbox.
- Không thay đổi giao diện danh sách hội thoại, API auth, hoặc giới hạn file 20 MB.
- `URL.createObjectURL` của file local được giữ trong optimistic message khi failed và giải phóng sau khi message được thay thế thành công hoặc component unmount.

## Status display

- `pending`: indicator đang gửi.
- `sent`, `delivered`: dấu tích.
- `failed`: dấu `!`, có `aria-label` retry.
