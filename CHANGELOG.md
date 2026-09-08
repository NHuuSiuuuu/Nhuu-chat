# Changelog

## Chưa phát hành

- Bổ sung connector Telegram MVP: chuẩn hóa tin nhắn text, webhook có xác thực secret và chống ghi trùng message khi Telegram replay update.
- Bổ sung đăng ký bot Telegram, mã hóa token qua provider-secret persistence và gọi `setWebhook` qua client có timeout/response validation.
- Bổ sung contract chat, REST API hội thoại/tin nhắn, cập nhật trạng thái/gán agent, quản lý tag khách hàng và Socket.IO room có xác thực JWT.

- Bổ sung thiết kế kiến trúc MVP cho Nhuu-chat.
- Bổ sung implementation plan cho Telegram connector, inbox realtime, RAG, Bot Pause, bảo mật và kiểm thử.
