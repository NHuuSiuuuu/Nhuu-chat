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
- Chatbot tự động trên hai connector Telegram dùng chung orchestrator, delivery, automation template và RAG theo owner.
- Telegram cá nhân hỗ trợ QR login, xác minh 2FA, hủy phiên QR cũ và khôi phục session sau khi API restart.
- Socket.IO room authentication và event realtime cho message/conversation.
- API đọc/ghi hội thoại, message, customer và knowledge.
- API CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- API CRUD mẫu trả lời nhanh dùng chung cho admin/agent tại `/api/v1/quick-replies`, hỗ trợ một ảnh đính kèm lưu trên Cloudinary.
- Chunking và parser cho TXT, Markdown, PDF, DOCX; RAG adapter độc lập với provider.
- Bot Pause 30 phút; queue hỗ trợ retry `0s`, `1s`, `4s`, nhưng chatbot tự động chỉ gửi một lần do connector chưa hỗ trợ khóa idempotency.
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
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET` nếu muốn lưu ảnh đính kèm mẫu trả lời nhanh.

Không commit `.env`, token, secret hoặc encryption key.

`GEMINI_API_KEY` chỉ được lưu ở backend trong `apps/api/.env`; không đưa key vào frontend, request của trình duyệt hoặc repository. Endpoint `POST /api/v1/conversations/:id/ai-suggestions` chỉ cho `admin` và `agent`, đọc 6 tin nhắn cuối của cả khách hàng và nhân viên theo thứ tự thời gian, rồi trả tối đa 3 gợi ý kèm `source` là `gemini` hoặc `fallback`. Khi thiếu key, không có tin nhắn phù hợp, Gemini timeout/lỗi quota hoặc trả dữ liệu không hợp lệ, backend trả gợi ý cục bộ để không chặn composer. Prompt và response của request Gemini không được lưu vào database.

### Trả lời nhanh và ảnh Cloudinary

Khi dùng ảnh đính kèm, cần điền đủ các biến sau trong `apps/api/.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

Các route `/api/v1/quick-replies` yêu cầu role `admin` hoặc `agent`, nhưng dữ liệu vẫn được giới hạn theo user đã xác thực: `GET` chỉ liệt kê mẫu của user đó, `PATCH` và `DELETE` không truy cập mẫu của user khác. `POST` tạo mẫu, `PATCH /:id` cập nhật một phần, và `DELETE /:id` xóa mẫu. Hai route ghi dữ liệu dùng `multipart/form-data` với field text `shortcut`, `message` và field file tùy chọn `attachment`; `PATCH` không có file sẽ giữ ảnh hiện tại.

`attachment` chỉ nhận MIME type `image/*`, tối đa 5 MiB (5 × 1024 × 1024 byte). Backend stream ảnh từ memory lên Cloudinary vào `nhuu-chat/quick-replies/<userId>` và lưu URL bảo mật, public ID, resource type, MIME type, số byte cùng metadata kích thước ảnh. Khi thay ảnh, xóa mẫu hoặc dọn upload mồ côi sau khi MongoDB thất bại, asset Cloudinary tương ứng được xóa theo cơ chế best-effort; lỗi cleanup được ghi log và không rollback trạng thái MongoDB đã quyết định. Nếu chưa cấu hình Cloudinary, các thao tác không kèm ảnh vẫn không cần khởi tạo media service, còn request có ảnh sẽ lỗi cấu hình.

Đây chưa phải luồng gửi media: message composer hiện chưa gửi ảnh/media và hệ thống cũng chưa hỗ trợ upload video.

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

### Vận hành chatbot tự động

JWT của `admin`/`agent` cho phép CRUD trợ lý qua `GET/POST /api/v1/assistants`, `PATCH/DELETE /api/v1/assistants/:assistantId`. Automation template dùng `GET/POST /api/v1/assistants/:assistantId/templates` và `PATCH/DELETE /api/v1/assistants/:assistantId/templates/:templateId`. Các cấu hình và knowledge chỉ thuộc owner đã xác thực; không nhận owner tùy ý trong request.

Tạo trợ lý có `name`, `instructions`, bật `enabled`, chọn `modelTier` (`smart`, `balanced`, `economy`), `fallbackMessage`, và đặt `isDefault: true` hoặc chỉ định `channelScope`. Định danh kênh có dạng `${platform}:${channelId}` như `telegram:456` hoặc `telegram_personal:456`. Trợ lý bật được gắn trực tiếp có ưu tiên cao hơn trợ lý mặc định cùng owner. Template khớp keyword/phạm vi được xét trước RAG; `allowAiRewrite: false` gửi nguyên `responseTemplate`, không cần Gemini. Mẫu trả lời nhanh `/quick-replies` là tính năng riêng, không tự trở thành automation template.

`POST /api/v1/assistants/:assistantId/preview` nhận `message`, `history` tùy chọn, cùng `platform`/`channelId` để thử phạm vi template; trả `{ answer, source, handoff }`. Preview không tạo message, claim, job, không gửi tin thật và không thay đổi pause. Preview dùng được khi trợ lý đang tắt và không chứng minh connector đã kết nối. Khi bỏ thông tin kênh, template giới hạn kênh không khớp.

Đặt `GEMINI_API_KEY` chỉ trong backend; chatbot dùng model theo tier, còn `GEMINI_CHAT_MODEL` dành cho gợi ý composer. Upload tài liệu bằng knowledge API của đúng owner trước khi dùng RAG. Index in-memory được khôi phục từ MongoDB khi API khởi động; chưa dùng Atlas Vector Search hoặc đồng bộ index giữa nhiều API process. Không có knowledge đủ tin cậy, thiếu key hay provider lỗi/timeout thì bot dùng fallback và bàn giao. Nếu Gemini không viết lại template được, bot dùng nguyên mẫu.

Telegram Bot lấy token mã hóa từ đăng ký `POST /api/v1/channels/telegram` (`botToken`, `webhookBaseUrl`) và giữ `TELEGRAM_WEBHOOK_SECRET`. Telegram cá nhân dùng client của session QR đã xác thực, khôi phục sau restart. Cả hai lưu tin khách trước khi gọi chung `ChatbotOrchestrator.process`; bot sender và replay được bỏ qua, echo của bot từ tài khoản cá nhân không tạo tin agent thứ hai. Webhook hợp lệ vẫn trả `204` khi bot lỗi; request hiện chờ xử lý bot có timeout, chưa có queue inbound bền vững.

Hai connector nhận text, ảnh, document/file, sticker, audio/voice, video/video note, animation/GIF; lưu loại/tham chiếu media và caption. Caption đi vào template/RAG; thiếu caption thì bot yêu cầu mô tả bằng văn bản. File Bot API dùng field `document`. Chưa đọc/tải nội dung media, chưa tải/render attachment đầy đủ; outbound bot chỉ gửi text. Fallback hoặc lỗi gửi chuyển hội thoại sang `pending`, pause 30 phút; mặc định khi tạo trợ lý là chính xác `Em chưa có đủ thông tin, nhân viên sẽ hỗ trợ.`. Fallback riêng đã lưu giữ nguyên. Bot chỉ thử gửi một lần, kể cả timeout không biết Telegram đã nhận hay chưa. Gửi thủ công từ web và tin gửi thật từ Telegram cá nhân kích hoạt cùng pause; echo/ID chatbot không được tính là agent takeover. Tin đến khi pause vẫn lưu nhưng không tự phát lại sau đó.

Owner Telegram cá nhân lấy từ session. Đăng ký Telegram Bot qua `POST /api/v1/channels/telegram` lưu owner admin đã xác thực cùng token mã hóa; hội thoại mới kế thừa owner này, không lấy owner từ body/webhook. Adapter không dùng đăng ký có owner để gửi cho hội thoại của người khác. Hội thoại cũ không bị đổi owner; token legacy chưa có owner không được tự cấp owner cho hội thoại mới. Chỉ cấp owner legacy sau xác minh nguồn bằng quy trình vận hành có kiểm chứng. Một token chung vẫn là giới hạn hiện tại và đăng ký thứ hai không ghi đè bản ghi hiện có. Các unique index cũ `(platform, channelId)` và `(platform, externalMessageId)` vẫn có thể xung đột giữa nhiều chat/tài khoản; cần migration riêng cho triển khai nhiều tài khoản. Facebook/Instagram/Zalo vẫn chưa có connector tự gửi.

Phối hợp gửi: `sendLeaseId`/`sendLeaseAt` trên hội thoại làm khóa atomic dùng chung giữa các API process. Bot giữ khóa cho lần kiểm tra pause cuối và thao tác gửi; pause của nhân viên lấy cùng khóa trước khi commit. Không khởi tạo gửi bot sau takeover đã commit, vẫn không retry khi kết quả mạng mơ hồ. Chờ khóa tối đa 15 giây; khóa không tự hết hạn để tránh hai process cùng gửi. Nếu process chết/nhả khóa thất bại, người vận hành xác minh process/lượt gửi cũ đã dừng, kiểm tra đúng hội thoại và lease ID rồi mới xóa khóa có điều kiện theo ID, giữ pause và không xóa claim hay tự gửi lại. Tin đã khởi tạo trước takeover vẫn có thể được Telegram giao muộn.

Knowledge legacy: hydration chỉ nạp chunk có owner khớp parent document có owner hợp lệ; thiếu owner, parent thiếu/không có owner hoặc owner không khớp đều bị loại khỏi index. Log `KNOWLEDGE_OWNER_QUARANTINED` chỉ chứa số chunk, dữ liệu MongoDB gốc không bị xóa/đổi owner. Người vận hành xác minh nguồn/chủ sở hữu của tài liệu cũ trước; sau đó đăng nhập admin của owner đúng và re-ingest `title`/`content` bằng `POST /api/v1/knowledge`. API dùng JWT, không nhận owner từ body, tạo document/chunk mới có scope. Tài liệu chưa chứng minh chủ tiếp tục cách ly; không chạy migration gán owner hàng loạt hay khôi phục retrieval unscoped. Tham khảo README cho quy trình và giới hạn tránh re-ingest lặp.

## 6. Kiểm thử và kiểm chứng

Hậu kiểm connector: unread Telegram cá nhân dùng document trả về từ phép tăng atomic để tin đồng thời phát đúng các giá trị đếm riêng. Khi orchestrator reject hoặc trả `failed`, caller giữ ack/idempotency, ghi `metadata.botFailure` (`PROCESSING_FAILED`, thời điểm) trên tin khách và thử chuyển hội thoại đúng owner sang `pending`/pause 30 phút. Diagnostics và handoff ghi độc lập; log chỉ có mã lỗi/ID và kết quả ghi, không chứa lỗi gốc hoặc secret. Replay không chạy bot lại và giữ diagnostics; database lỗi có thể ngăn lưu hoặc handoff, khi đó log cho biết kết quả phục hồi.

Echo của tài khoản cá nhân dùng ID kết quả gửi thực tế, kể cả kết quả thành công đến sau timeout. ID thành công được giữ trong bộ nhớ 10 giây từ khi nhận kết quả; không retry hay đổi trạng thái delivery đã timeout. Giới hạn vẫn là một process và thời gian lưu ngắn; chưa có đối soát delivery bền vững sau restart/echo quá muộn.

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
- Ảnh Cloudinary hiện chỉ dùng cho mẫu trả lời nhanh; gửi media trong message và upload video chưa được triển khai.
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
