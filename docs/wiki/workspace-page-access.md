# Workspace và quyền truy cập kênh

NhuuChat tạo một Workspace cá nhân cho mỗi tài khoản với vai trò `owner`. Vai trò cấp hệ thống (`admin`, `agent`, `customer`) vẫn độc lập với vai trò Workspace (`owner`, `admin`, `staff`). Một tài khoản có thể là thành viên của nhiều Workspace; bộ chọn trong ứng dụng xác định phạm vi API và Socket.IO.

## Thành viên

Mở **Cài đặt → Thành viên** để xem thành viên, thêm tài khoản đã đăng ký bằng email, đổi vai trò hoặc xóa thành viên. Chỉ owner được quản lý thành viên; owner không thể bị sửa hoặc xóa. Vai trò Workspace độc lập với role hệ thống. `owner` và `admin` được truy cập các kênh của Workspace; `staff` được giới hạn theo từng cặp nền tảng/ID kênh. Không chọn kênh nào nghĩa là truy cập mọi kênh trong Workspace.

## Kênh được chia sẻ

Workspace owner có thể kết nối nhiều Facebook Page và chia sẻ các kênh đã kết nối, gồm Facebook, Zalo, Telegram và phiên Zalo/Telegram cá nhân của owner. Quyền dùng định danh gồm cả nền tảng và ID để các kênh trùng ID không cấp nhầm quyền. Danh sách Inbox, tìm kiếm, số liệu, gửi tin, lịch sử hội thoại và thao tác hội thoại đều áp dụng phạm vi kênh được cấp. Chọn Workspace đang làm việc để xác định dữ liệu và quyền áp dụng.

Mỗi Facebook Page giữ connection và token mã hóa riêng. Kết nối hoặc ngắt một Page không thay đổi các Page khác; webhook nhận tin được định tuyến theo Page ID.

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
