# Nhuu-chat

MVP quản lý inbox chăm sóc khách hàng Telegram và trợ lý RAG. MongoDB dùng MongoDB Atlas; Redis vẫn có thể chạy local bằng Docker.

## Đã hoàn thành

- Workspace React/Vite + Node/Express/TypeScript.
- JWT auth và role admin/agent/customer.
- Dashboard onboarding và kết nối Telegram cá nhân bằng QR MTProto; session chỉ lưu mã hóa ở backend.
- MongoDB/Mongoose domain models, mã hóa provider secret AES-256-GCM.
- Telegram webhook có secret và idempotency.
- REST conversation/message API và Socket.IO room authentication.
- Knowledge chunking, TXT/Markdown/PDF/DOCX parser, provider-independent RAG.
- Bot Pause 30 phút và retry outbound 0s/1s/4s.
- Inbox React tối thiểu.
- Security headers, request ID và rate limit auth.

## Chạy local

```bash
pnpm install
cp .env.example apps/api/.env
docker compose -f infra/docker-compose.yml up -d redis
pnpm test
pnpm --filter web build
```

Điền `MONGODB_URI` bằng connection string MongoDB Atlas trong `apps/api/.env` trước khi chạy API. Tạo database user, cấp quyền truy cập IP cho server chạy API và URL-encode ký tự đặc biệt trong username/password. Không commit file này.

Mở hai terminal riêng để chạy API và web:

```bash
# Terminal 1
pnpm --filter api dev

# Terminal 2
pnpm --filter web dev
```

API mặc định chạy ở `http://localhost:3000`, còn Vite web chạy ở `http://localhost:5173`.

### Auth MVP

- `POST /api/v1/auth/register` nhận `name`, `email` và password từ 8 ký tự; tài khoản mới luôn có role `customer`.
- `POST /api/v1/auth/login` trả access token, refresh token và role hiện tại của tài khoản.
- Sau đăng nhập, mọi role được đưa vào Dashboard. Người dùng phải kết nối Telegram trước khi Inbox có dữ liệu.
- Telegram cá nhân cần `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` lấy từ `my.telegram.org`; QR được quét bằng ứng dụng Telegram đã đăng nhập.
- Telegram Bot API hiện tại vẫn là provider riêng, không dùng chung session cá nhân.

Test Mongo integration cần `MONGODB_TEST_URI` trỏ tới database test riêng trên Atlas; nếu không có URI này, test dùng fallback in-memory theo cấu hình hiện tại.

## Chưa hoàn tất trước production

- Chưa chạy Playwright E2E trên môi trường deploy thật.
- Redis adapter và Mongo integration cần xác minh trên Atlas/CI sạch.
- Vector store hiện là adapter in-memory cho MVP; Mongo Atlas Vector Search vẫn là lựa chọn production chưa triển khai.
- Meta/Instagram OAuth, Zalo, WebRTC và load test thực tế nằm ngoài MVP hiện tại.

## Lệnh kiểm tra

```bash
pnpm test
pnpm exec vitest run tests/security/webhook.spec.ts
pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
pnpm --filter web build
git diff --check
```
