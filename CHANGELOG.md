# Nhật ký thay đổi

Mọi thay đổi đáng chú ý của project sẽ được ghi lại trong file này.
Định dạng dựa trên Keep a Changelog và project tuân theo Semantic Versioning.

## [Chưa phát hành] - 2026-09-09

Các ghi chú nâng cấp được viết rõ ràng để cả team dễ theo dõi và thực hiện.

### Đã thêm

- Thiết kế kiến trúc MVP cho Nhuu-chat.
- Implementation plan cho Telegram connector, inbox realtime, RAG, Bot Pause, bảo mật và kiểm thử.
- Telegram connector MVP với chuẩn hóa tin nhắn text, webhook xác thực secret và chống ghi trùng khi Telegram gửi lại update.
- Đăng ký bot Telegram, lưu trữ provider secret đã mã hóa và client `setWebhook` có timeout cùng kiểm tra response.
- Chat contract, REST API cho hội thoại và tin nhắn, cập nhật trạng thái, gán agent, quản lý tag khách hàng và Socket.IO room xác thực bằng JWT.
- Phân quyền room theo agent được gán, Redis adapter cho Socket.IO, event realtime và gửi tin outbound Telegram bằng bot token đã mã hóa.
- Knowledge ingestion và RAG grounded có metadata nguồn, vector store/provider có thể thay thế và handoff rõ ràng khi không đủ context.
- Bot Pause 30 phút và retry policy outbound deterministic tại các mốc 0 giây, 1 giây và 4 giây.
- Inbox React tối thiểu với danh sách hội thoại, timeline tin nhắn, composer và cập nhật realtime qua Socket.IO.
- Security headers, request ID, rate limit cho auth và tài liệu README/Wiki ghi rõ trạng thái MVP cùng giới hạn production.
- Bổ sung security test cho security headers, request ID, CORS allowlist, role guard và xác thực Telegram webhook.
- Bổ sung hướng dẫn chạy riêng API/web và cấu hình `apps/api/.env` trong README.
- Cấu hình Vite listen trên `0.0.0.0` để web truy cập được qua IPv4 và SSH tunnel, đồng thời tránh lỗi `ERR_CONNECTION_RESET` khi server chỉ bind vào IPv6 loopback.
- Sửa lỗi màn hình trắng trên frontend bằng cách cung cấp biến `React` cho JSX runtime của Vite.
- Bổ sung biến `React` cho toàn bộ component TSX để tránh lỗi runtime màn hình trắng khi Vite render JSX.
- Thay nút nhập access token tạm thời bằng form đăng nhập/đăng ký kết nối API auth; tài khoản đăng ký mới mặc định không có quyền agent/admin.
- Bổ sung tài liệu contract auth MVP và giới hạn role customer trong README/Wiki.
- Chuyển cấu hình database từ MongoDB local sang MongoDB Atlas, bỏ MongoDB khỏi Docker Compose và giữ Redis local.
- Gỡ MongoDB native 8.0 vừa cài trên server sau khi xác minh CPU máy chủ không hỗ trợ AVX.
- Sửa lỗi frontend gọi API qua `localhost:3000` trong VS Code Tunnel bằng URL tương đối và Vite proxy cho API/Socket.IO.
- Cho phép role `customer` vào inbox và sử dụng luồng hội thoại trong giai đoạn MVP; quyền sẽ được siết lại trước production theo yêu cầu.
- Thêm Dashboard onboarding; sau đăng nhập người dùng không còn bị đưa thẳng vào Inbox khi chưa có kênh.
- Thêm kết nối Telegram cá nhân bằng MTProto QR Login, mã hóa session tại backend và adapter gửi tin theo session cá nhân.
- Thêm luồng nhập mật khẩu 2FA Telegram sau khi quét QR; mật khẩu không được lưu hoặc ghi log, lỗi mật khẩu sai cho phép thử lại thay vì báo sai `AUTH_USER_CANCEL`.
- Cho phép hủy phiên QR Telegram cũ đang chờ 2FA và tạo phiên mới sau khi người dùng thay đổi thiết lập 2FA; bổ sung nút tạo lại phiên trên UI.
- Hoàn thiện realtime Inbox: phát event khi có tin Telegram inbound/outbound, cập nhật danh sách hội thoại và message không cần refresh, tự mở hội thoại đầu tiên và chống hiển thị trùng message.

### Đã thay đổi

- Trạng thái QR Telegram cá nhân bổ sung `password_required` và endpoint xác minh mật khẩu theo đúng session của người dùng.

### Đã sửa

- Sửa lỗi GramJS biến yêu cầu mật khẩu 2FA thành `AUTH_USER_CANCEL`.
- Sửa lỗi gửi tin Telegram cá nhân trả `409 TELEGRAM_PERSONAL_DISCONNECTED` sau khi API restart bằng cách khôi phục session đã mã hóa từ MongoDB trước khi gửi.
