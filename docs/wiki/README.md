# Nhuu-chat Wiki

Nhuu-chat là MVP inbox Telegram cá nhân và RAG độc lập. MongoDB dùng MongoDB Atlas; Redis có thể chạy local bằng Docker. Xem README gốc để biết cách chạy, cấu hình Atlas, các module đã hoàn thành, giới hạn môi trường và kế hoạch trước production.

Trạng thái hiện tại: backend/API, Telegram Bot webhook, kết nối Telegram cá nhân bằng QR MTProto, RAG adapter, Bot Pause/retry và inbox React tối thiểu đã có. Sau đăng nhập, người dùng vào Dashboard và kết nối Telegram trước khi mở Inbox. Cần xác minh Atlas/Redis, QR thật với `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`, E2E deploy thật, vector store production và load test trước khi phát hành chính thức.
