# Nhuu-chat Wiki

Tài liệu tổng quan vận hành và trạng thái phát triển của Nhuu-chat — nền tảng quản lý inbox chăm sóc khách hàng đa kênh, hiện ưu tiên Telegram và trợ lý RAG.

> Đây là Wiki source được lưu trong repository. Khi Wiki online được bật trên GitHub, nội dung file này có thể được đồng bộ sang trang Wiki tương ứng.

## 1. Tổng quan sản phẩm

Nhuu-chat hiện là MVP tập trung vào:

- Đăng nhập/đăng ký bằng JWT.
- Dashboard onboarding sau đăng nhập.
- Kết nối Telegram cá nhân bằng QR MTProto.
- Nhận và gửi tin nhắn Telegram trong Inbox realtime.
- Quản lý hội thoại, unread count, avatar, tên khách hàng, nhóm và nền tảng gửi.
- Trợ lý RAG với dữ liệu knowledge dạng tài liệu/chính sách.
- Bot Pause và retry outbound có thời gian chờ cố định.

MongoDB dùng MongoDB Atlas. Redis có thể chạy local bằng Docker để phục vụ realtime adapter và các thành phần liên quan.

## 2. Trạng thái hiện tại

### Đã hoàn thành

- Workspace monorepo dùng pnpm, React/Vite/TypeScript cho web và Node.js/Express/TypeScript cho API.
- API đã tổ chức theo các lớp toàn cục:
  - `routes`: khai báo HTTP route và middleware quyền.
  - `controllers`: nhận request, validate schema và trả response.
  - `services`: xử lý nghiệp vụ, lưu dữ liệu và outbound delivery.
  - `schemas`: schema HTTP và domain input.
- JWT auth với role `admin`, `agent`, `customer`.
- Provider secret được mã hóa trước khi lưu MongoDB bằng AES-256-GCM.
- Telegram webhook có secret validation và idempotency.
- Telegram cá nhân hỗ trợ QR login, xác minh 2FA, hủy phiên QR cũ và khôi phục session sau khi API restart.
- Socket.IO room authentication và event realtime cho message/conversation.
- API đọc/ghi hội thoại, message, customer và knowledge.
- API CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- Chunking và parser cho TXT, Markdown, PDF, DOCX; RAG adapter độc lập với provider.
- Bot Pause 30 phút và retry outbound theo các mốc `0s`, `1s`, `4s`.
- Frontend đã chuyển sang Tailwind CSS v4; entry CSS duy nhất là `apps/web/src/styles/tailwind.css`.

### Inbox và giao diện chat

- Dashboard dùng chung header Hchat khi chuyển sang Inbox.
- Layout Inbox gồm navigation rail, danh sách hội thoại và khung chat.
- Khi mở hội thoại, khung chat tự cuộn tới tin nhắn mới nhất.
- Khi cuộn lên xa tin mới, hiển thị nút `Tin mới nhất`; nút dùng smooth scroll.
- Khi chọn hội thoại, unread count được optimistic reset về `0`, sau đó xác nhận qua API.
- Có guard chống response đọc chậm ghi đè trạng thái realtime mới.
- Danh sách hiển thị:
  - tên khách hàng hoặc tên nhóm;
  - avatar ảnh hoặc initials fallback;
  - biểu tượng nhóm cho conversation group;
  - preview và thời gian tin nhắn cuối;
  - badge nền tảng như Telegram/Zalo;
  - badge số tin chưa đọc.
- Form nhập tin nhắn hỗ trợ:
  - textarea nhiều dòng;
  - `Enter` để gửi;
  - `Shift + Enter` để xuống dòng;
  - `/` mở mẫu trả lời nhanh;
  - `@` mở gợi ý thành viên;
  - modal `Phím tắt & Mẹo`;
  - toolbar file, ảnh, ghi chú và mẫu trả lời.
- Sidebar thông tin bên phải khung chat có:
  - tab `Thông tin` và `Tạo đơn`;
  - khu vực `Ghi chú`;
  - khu vực `Đơn hàng`;
  - responsive drawer trên màn hình hẹp.
- Khi chiều rộng màn hình dưới breakpoint Inbox:
  - danh sách hội thoại bên trái được ẩn khỏi layout cố định;
  - khung chat chiếm phần còn lại;
  - nút danh sách cạnh avatar mở conversation list dạng drawer;
  - drawer có overlay và tự đóng sau khi chọn hội thoại.

## 3. Kiến trúc thư mục chính

```text
apps/
  api/
    src/
      routes/
      controllers/
      services/
      schemas/
      channels/
      models/
      realtime/
      jobs/
  web/
    src/
      components/
      pages/
      state/
      lib/
packages/
  contracts/
  config/
docs/
  requirements/
  superpowers/specs/
  superpowers/plans/
  wiki/
```

Các contract dùng chung nằm trong `packages/contracts`. Web không gọi trực tiếp model MongoDB; mọi dữ liệu đi qua API contract và các service backend.

## 4. Cài đặt local

Yêu cầu cơ bản:

- Node.js tương thích với workspace hiện tại.
- pnpm theo phiên bản trong `package.json`.
- MongoDB Atlas hoặc MongoDB test riêng.
- Redis local nếu cần realtime adapter đầy đủ.

Cài dependency:

```bash
pnpm install
```

Tạo cấu hình API:

```bash
cp .env.example apps/api/.env
```

Điền tối thiểu các biến liên quan:

- `MONGODB_URI`: connection string MongoDB Atlas.
- `JWT_SECRET` và refresh-token secret theo cấu hình dự án.
- `ENCRYPTION_KEY`: tối thiểu 32 ký tự.
- `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` cho Telegram cá nhân.
- `TELEGRAM_BOT_TOKEN`/webhook secret nếu dùng Telegram Bot.
- `MONGODB_TEST_URI` nếu muốn chạy integration test Mongo ổn định.
- `GEMINI_API_KEY` nếu muốn bật gợi ý trả lời Gemini.
- `GEMINI_CHAT_MODEL` tùy chọn; mặc định là `gemini-2.5-flash-lite`.

Không commit `.env`, token, secret hoặc encryption key.

`GEMINI_API_KEY` chỉ được lưu ở backend trong `apps/api/.env`; không đưa key vào frontend, request của trình duyệt hoặc repository. Endpoint `POST /api/v1/conversations/:id/ai-suggestions` chỉ cho `admin` và `agent`, đọc 6 tin nhắn cuối của cả khách hàng và nhân viên theo thứ tự thời gian, rồi trả tối đa 3 gợi ý kèm `source` là `gemini` hoặc `fallback`. Khi thiếu key, không có tin nhắn phù hợp, Gemini timeout/lỗi quota hoặc trả dữ liệu không hợp lệ, backend trả gợi ý cục bộ để không chặn composer. Prompt và response của request Gemini không được lưu vào database.

Khởi động Redis local:

```bash
docker compose -f infra/docker-compose.yml up -d redis
```

Chạy API và web ở hai terminal:

```bash
# Terminal 1
pnpm --filter api dev

# Terminal 2
pnpm --filter web dev
```

Mặc định:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## 5. Luồng sử dụng chính

1. Mở web và đăng ký/đăng nhập.
2. Dashboard hiển thị trạng thái channel.
3. Kết nối Telegram cá nhân bằng QR.
4. Nếu tài khoản Telegram yêu cầu 2FA, nhập mật khẩu trong modal; mật khẩu không được lưu hoặc ghi log.
5. Bấm tài khoản Telegram đã kết nối để mở Inbox.
6. Chọn hội thoại trong danh sách.
7. Khung chat tự tải lịch sử, merge với message realtime và cuộn tới tin cuối.
8. Nhập tin nhắn trong composer và gửi bằng nút gửi hoặc `Enter`.
9. Trên màn hình hẹp, mở danh sách bằng nút cạnh avatar để đổi hội thoại.

## 6. Kiểm thử và kiểm chứng

Các lệnh thường dùng:

```bash
pnpm test
pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
pnpm --filter web build
git diff --check
```

Test frontend tập trung:

```bash
pnpm --filter web exec vitest run
```

Các test quan trọng của Inbox kiểm tra tự cuộn, unread state, metadata hội thoại, composer, sidebar thông tin và responsive drawer.

## 7. Giới hạn môi trường hiện tại

- Một số Mongo integration test dùng MongoMemoryServer yêu cầu `libcrypto.so.1.1`; nếu host thiếu thư viện này, các suite Mongo sẽ bị fail hoặc skip dù test logic không thay đổi.
- Có thể dùng `MONGODB_TEST_URI` trỏ tới Mongo replica set test để tránh phụ thuộc MongoMemoryServer.
- Chưa chạy Playwright E2E trên môi trường deploy thật.
- Vector store hiện vẫn là adapter in-memory cho MVP; MongoDB Atlas Vector Search chưa được bật cho production.
- Redis adapter và Mongo integration cần xác minh lại trong CI/Atlas sạch.
- Nút `+ Tạo đơn`, ghi chú và một số toolbar hiện mới là UI placeholder; chưa có luồng persistence/order backend hoàn chỉnh.
- Meta/Instagram OAuth, Zalo connector, WebRTC và load test thực tế chưa thuộc MVP hiện tại.

## 8. Kế hoạch tiếp theo

- Hoàn thiện persistence cho ghi chú và đơn hàng trong sidebar.
- Hoàn thiện flow tạo đơn và liên kết sản phẩm/customer.
- Chạy E2E trên môi trường deploy thật với Telegram QR và realtime inbound/outbound.
- Chuẩn hóa Mongo integration trong CI bằng Mongo replica set test.
- Đánh giá MongoDB Atlas Vector Search cho RAG production.
- Tích hợp thêm Zalo, Facebook và Instagram sau khi có spec và connector được phê duyệt.

## 9. Tài liệu liên quan

- README dự án: `README.md`
- Quy định agent: `AGENTS.md`
- Prompt UI và handoff dài: `DEVELOPMENT_PROMPT.md`
- Yêu cầu sản phẩm: `docs/requirements/`
- Spec kiến trúc: `docs/superpowers/specs/`
- Implementation plan: `docs/superpowers/plans/`
- Nhật ký thay đổi: `CHANGELOG.md`
