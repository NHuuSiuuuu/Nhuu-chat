# Mẫu trả lời nhanh với media Cloudinary

## Mục tiêu

Lưu mẫu trả lời nhanh theo tài khoản người dùng, cho phép đính kèm ảnh được upload lên Cloudinary và cung cấp metadata đủ để tái sử dụng cho việc gửi ảnh/video trong tin nhắn về sau.

## Phạm vi

- API CRUD mẫu trả lời nhanh, giới hạn theo user đang đăng nhập.
- Upload ảnh từ modal Settings lên Cloudinary.
- Lưu metadata mẫu và media trong MongoDB.
- Settings tải lại dữ liệu sau refresh.
- Inbox dùng cùng danh sách mẫu khi gõ `/`; chọn mẫu chỉ điền nội dung và attachment vào composer, không tự gửi.
- Chưa triển khai gửi media qua Telegram; chỉ chuẩn bị contract metadata dùng chung.

## Thiết kế được chọn

Backend nhận `multipart/form-data` ở `POST /api/v1/quick-replies`, dùng Cloudinary SDK để upload ảnh vào thư mục `nhuu-chat/quick-replies/{userId}`. MongoDB chỉ lưu `secureUrl`, `publicId`, `resourceType`, `mimeType`, `width`, `height`, `duration` và dung lượng; không lưu binary.

Collection `quickreplies` có các trường:

- `userId`: ObjectId của user sở hữu mẫu, có index.
- `shortcut`: chuỗi bắt buộc, đã trim, không trùng trong cùng user.
- `message`: nội dung bắt buộc.
- `attachment`: object tùy chọn với metadata Cloudinary.
- timestamps.

Routes dùng `requireRole("admin", "agent")`; mọi truy vấn, sửa và xóa đều thêm `userId` từ auth. Xóa mẫu thành công sẽ gọi Cloudinary destroy cho `publicId`; lỗi xóa media được ghi nhận nhưng không làm mất bản ghi đã xóa.

## Upload và giới hạn

- Chỉ nhận `image/*` trong phase này.
- Dung lượng tối đa 5 MiB.
- Từ chối request thiếu shortcut/message bằng lỗi 400.
- Nếu upload Cloudinary thành công nhưng lưu MongoDB thất bại, cố gắng xóa asset vừa tạo để tránh orphan.
- Nếu Cloudinary chưa được cấu hình, API trả lỗi cấu hình rõ ràng; không hardcode credential.

Biến môi trường:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

## API contract

```text
GET    /api/v1/quick-replies
POST   /api/v1/quick-replies       multipart: shortcut, message, attachment?
PATCH  /api/v1/quick-replies/:id   multipart: shortcut?, message?, attachment?
DELETE /api/v1/quick-replies/:id
```

Response mẫu:

```json
{
  "id": "...",
  "shortcut": "cskh",
  "message": "Chăm sóc khách hàng 1",
  "attachment": {
    "secureUrl": "https://res.cloudinary.com/...",
    "publicId": "nhuu-chat/quick-replies/user-id/file-id",
    "resourceType": "image",
    "mimeType": "image/png",
    "bytes": 12345,
    "width": 800,
    "height": 600
  }
}
```

## Tương lai media tin nhắn

Attachment metadata là một kiểu dữ liệu độc lập với quick reply. Giai đoạn gửi media trong chat có thể tái sử dụng media service và Cloudinary folder `nhuu-chat/messages/{conversationId}`, mở rộng `resourceType` sang `video` mà không đổi cách lưu mẫu trả lời.

## Kiểm thử và vận hành

- Unit test media service cho upload thành công, file sai MIME, quá dung lượng, thiếu cấu hình và cleanup khi MongoDB thất bại.
- Service/controller test cho user isolation, CRUD và duplicate shortcut.
- Route test cho auth/role và multipart contract.
- Frontend test cho tải danh sách, submit FormData, hiển thị attachment và lỗi upload.
- Build web, focused API tests và `git diff --check` trước bàn giao.
- README/Wiki ghi rõ biến môi trường Cloudinary và giới hạn phase hiện tại.
