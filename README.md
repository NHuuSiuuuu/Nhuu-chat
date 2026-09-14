# Nhuu-chat

MVP quản lý inbox chăm sóc khách hàng Telegram và trợ lý RAG. MongoDB dùng MongoDB Atlas; Redis vẫn có thể chạy local bằng Docker.

## Đã hoàn thành

- Workspace React/Vite + Node/Express/TypeScript.
- JWT auth và role admin/agent/customer.
- Dashboard onboarding và kết nối Telegram cá nhân bằng QR MTProto; session chỉ lưu mã hóa ở backend.
- MongoDB/Mongoose domain models, mã hóa provider secret AES-256-GCM.
- Telegram webhook có secret và idempotency.
- REST conversation/message API và Socket.IO room authentication.
- CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- CRUD mẫu trả lời nhanh dùng chung cho admin/agent tại `/api/v1/quick-replies`, hỗ trợ lưu một ảnh đính kèm qua Cloudinary.
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

Để bật gợi ý trả lời AI, thêm cấu hình Gemini vào `apps/api/.env`:

```dotenv
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
```

`GEMINI_API_KEY` là cấu hình backend bắt buộc khi muốn gọi Gemini; `GEMINI_CHAT_MODEL` là tùy chọn và mặc định là `gemini-3.5-flash-lite`. API key chỉ được đặt trong `apps/api/.env`, không đưa vào frontend, request của trình duyệt hoặc repository.

Endpoint `POST /api/v1/conversations/:id/ai-suggestions` yêu cầu quyền `admin` hoặc `agent`, lấy 6 tin nhắn cuối của cả khách hàng và nhân viên theo thứ tự thời gian để tạo ngữ cảnh, rồi trả tối đa 3 gợi ý cùng `source` (`gemini` hoặc `fallback`). Nếu chưa cấu hình key, không có tin nhắn phù hợp, Gemini timeout/lỗi quota hoặc trả dữ liệu không hợp lệ, backend tự dùng gợi ý cục bộ để composer vẫn hoạt động. Prompt và response gửi tới Gemini chỉ được dùng trong request, không được lưu vào database.

### Trả lời nhanh và ảnh Cloudinary

Để lưu ảnh đính kèm cho mẫu trả lời nhanh, điền đủ ba biến sau trong `apps/api/.env` (có thể để trống nếu không dùng ảnh):

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

Các route `/api/v1/quick-replies` chỉ cho `admin` và `agent`, đồng thời mọi thao tác chỉ thuộc về tài khoản đã xác thực:

- `GET /api/v1/quick-replies`: liệt kê mẫu của tài khoản hiện tại.
- `POST /api/v1/quick-replies`: tạo mẫu với field text `shortcut`, `message` và tùy chọn file `attachment`.
- `PATCH /api/v1/quick-replies/:id`: cập nhật một hoặc nhiều field; nếu không gửi `attachment` thì giữ ảnh cũ.
- `DELETE /api/v1/quick-replies/:id`: xóa mẫu và ảnh liên kết.

`POST` và `PATCH` dùng `multipart/form-data`; `attachment` phải là ảnh (`image/*`) và không vượt quá 5 MiB. Backend nhận file trong memory rồi stream lên Cloudinary vào thư mục riêng `nhuu-chat/quick-replies/<userId>`, lưu metadata `secureUrl`, `publicId`, loại tài nguyên, MIME type, kích thước và kích thước ảnh. Khi thay hoặc xóa mẫu, asset cũ được dọn khỏi Cloudinary; upload mồ côi sau khi MongoDB ghi thất bại cũng được dọn best-effort, còn lỗi dọn media không làm thay đổi kết quả persistence.

Tính năng này mới chỉ lưu ảnh cho mẫu trả lời nhanh. Composer chưa gửi media trong message và chưa hỗ trợ upload video.

Mở hai terminal riêng để chạy API và web:

```bash
# Terminal 1
pnpm --filter api dev

# Terminal 2
pnpm --filter web dev
```

API mặc định chạy ở `http://localhost:3000`, còn Vite web chạy ở `http://localhost:5173`.

### Styling frontend

Frontend sử dụng Tailwind CSS v4 với plugin Vite chính thức. Toàn bộ style được khai báo bằng utility classes; entry CSS duy nhất là `apps/web/src/styles/tailwind.css` và không cần chạy PostCSS riêng.

Khi phát triển giao diện, chạy web bằng `pnpm --filter web dev`. Build production dùng `pnpm --filter web build`.

### Auth MVP

- `POST /api/v1/auth/register` nhận `name`, `email` và password từ 8 ký tự; tài khoản mới luôn có role `customer`.
- `POST /api/v1/auth/login` trả access token, refresh token và role hiện tại của tài khoản.
- Sau đăng nhập, mọi role được đưa vào Dashboard. Người dùng phải kết nối Telegram trước khi Inbox có dữ liệu.
- Telegram cá nhân cần `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` lấy từ `my.telegram.org`; QR được quét bằng ứng dụng Telegram đã đăng nhập.
- Thẻ hội thoại được quản lý qua API với payload `{ "name": "Mua hàng", "color": "#22c55e" }`; danh mục hiện dùng chung cho admin/agent. Việc gắn thẻ vào từng hội thoại chưa thuộc bước này.
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
