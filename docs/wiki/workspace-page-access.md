# Workspace và quyền truy cập Facebook Page

NhuuChat tạo một Workspace cá nhân cho mỗi tài khoản với vai trò `owner`. Vai trò cấp hệ thống (`admin`, `agent`, `customer`) vẫn độc lập với vai trò Workspace (`owner`, `admin`, `staff`). Một tài khoản có thể là thành viên của nhiều Workspace; bộ chọn trong ứng dụng xác định phạm vi API và Socket.IO.

## Thành viên

Mở **Cài đặt → Thành viên** để xem thành viên, thêm tài khoản đã đăng ký bằng email, đổi vai trò hoặc xóa thành viên. Chỉ owner được quản lý thành viên; owner không thể bị sửa hoặc xóa. `admin` và `owner` truy cập mọi Facebook Page trong Workspace. `staff` có thể được giới hạn theo Page. Danh sách Page để trống mang nghĩa truy cập mọi Page trong Workspace.

## Facebook Page

Workspace owner kết nối nhiều Facebook Page từ trang Bài viết. Mỗi Page có một connection và token mã hóa riêng; kết nối/ngắt một Page không thay thế các Page khác. Inbox, gửi Messenger, ghi chú, ghim, trạng thái và thao tác bài viết kiểm tra Workspace cùng Page được cấp. Telegram, Zalo và cài đặt cá nhân giữ phạm vi hiện tại.

## Migration database hiện hữu

Không chạy migration khi ứng dụng khởi động. Trước production, tạo và xác minh backup; chạy dry-run; kiểm tra số liệu; chỉ chạy `--apply` sau khi operator duyệt kết quả và có kế hoạch rollback. Thứ tự:

```bash
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:workspaces
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:workspaces -- --apply
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:facebook-page-multi-connection-index
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:facebook-page-multi-connection-index -- --apply
```

Lệnh không có `--apply` chỉ báo cáo, không ghi dữ liệu. Migration đầu khởi tạo Workspace/owner membership cho tài khoản cũ và tạo index cần thiết. Migration sau gỡ unique index legacy chỉ cho phép một Page/user, giữ unique index toàn cục theo `pageId`. Nếu dry-run báo dữ liệu/index bất ngờ, dừng và xử lý thủ công; không xóa index hoặc dữ liệu ngoài phạm vi migration.

Triển khai production, áp dụng migration và nghiệm thu với Meta vẫn cần quy trình backup, review kết quả, cấu hình OAuth/webhook và kiểm thử tài khoản/Page thực tế riêng.
