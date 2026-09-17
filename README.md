# Nhuu-chat

MVP quản lý inbox chăm sóc khách hàng Telegram và trợ lý RAG. MongoDB dùng MongoDB Atlas; Redis vẫn có thể chạy local bằng Docker.

## Đã hoàn thành

- Workspace React/Vite + Node/Express/TypeScript.
- JWT auth và role admin/agent/customer.
- Dashboard onboarding và kết nối Telegram cá nhân bằng QR MTProto; session chỉ lưu mã hóa ở backend.
- Backend Zalo cá nhân thử nghiệm qua QR, nhận media metadata và gửi text; credentials chỉ lưu mã hóa ở backend.
- MongoDB/Mongoose domain models, mã hóa provider secret AES-256-GCM.
- Telegram webhook có secret và idempotency.
- Chatbot tự động dùng chung orchestration/delivery cho Telegram Bot và Telegram cá nhân, có template, RAG đúng owner, fallback và bàn giao.
- REST conversation/message API và Socket.IO room authentication.
- CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- CRUD mẫu trả lời nhanh dùng chung cho admin/agent tại `/api/v1/quick-replies`, hỗ trợ lưu một ảnh đính kèm qua Cloudinary.
- Knowledge chunking, TXT/Markdown/PDF/DOCX parser, provider-independent RAG.
- Bot Pause 30 phút; queue có chính sách retry 0s/1s/4s, riêng chatbot tự động chỉ gửi một lần để tránh trả lời trùng.
- Inbox React tối thiểu.
- Ghi chú nội bộ theo từng hội thoại; agent/admin có thể tạo, sửa, xóa và ghim ghi chú trong sidebar Thông tin.
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

### Chatbot tự động trên Telegram

API cấu hình trợ lý và automation template yêu cầu JWT của `admin` hoặc `agent`; owner lấy từ tài khoản đã xác thực, không nhận từ body:

- `GET/POST /api/v1/assistants`: liệt kê/tạo trợ lý.
- `PATCH/DELETE /api/v1/assistants/:assistantId`: sửa/xóa trợ lý.
- `GET/POST /api/v1/assistants/:assistantId/templates`: liệt kê/tạo automation template.
- `PATCH/DELETE /api/v1/assistants/:assistantId/templates/:templateId`: sửa/xóa template.
- `POST /api/v1/assistants/:assistantId/preview`: thử câu trả lời, trả `{ answer, source, handoff }` với `source` là `template`, `ai` hoặc `fallback`.

Tạo trợ lý với `name`, `instructions`, `enabled: true` và `isDefault: true`, hoặc gắn trực tiếp qua `channelScope: { "mode": "channels", "identifiers": ["telegram_personal:456"] }`. Định danh luôn là `${platform}:${channelId}`: `telegram:456` khác `telegram_personal:456`. Trợ lý được gắn trực tiếp và đang bật được ưu tiên trước trợ lý mặc định của cùng owner. Template có `name`, `keywords`, `responseTemplate`, `priority`, `enabled`, `allowAiRewrite` và `channelScope`; template khớp được xét trước RAG. `allowAiRewrite: false` gửi nguyên mẫu mà không gọi Gemini.

Preview nhận ví dụ `{ "message": "Giờ mở cửa?", "platform": "telegram_personal", "channelId": "456" }` và `history` tùy chọn. Preview chỉ đọc cấu hình/knowledge, không lưu tin hội thoại, không tạo claim/job, không gửi qua connector và không tạm dừng bot. Có thể preview trợ lý đang tắt; kết quả không xác nhận connector đã kết nối hay hội thoại đủ điều kiện tự động gửi. Khi bỏ platform/channelId, chỉ template không giới hạn kênh có thể khớp.

Đặt `GEMINI_API_KEY` ở backend để sinh câu trả lời từ knowledge hoặc viết lại mẫu; model chatbot chọn theo `modelTier` (`smart`, `balanced`, `economy`). `GEMINI_CHAT_MODEL` thuộc luồng gợi ý composer riêng. Nạp tài liệu bằng API knowledge dưới đúng owner; RAG chỉ truy xuất knowledge của owner đó. Index in-memory được khôi phục từ tài liệu MongoDB khi API khởi động, chưa có đồng bộ index giữa nhiều API process.

Telegram Bot dùng token mã hóa đã đăng ký qua `POST /api/v1/channels/telegram` với `{ botToken, webhookBaseUrl }` và `TELEGRAM_WEBHOOK_SECRET`; Telegram cá nhân dùng client đang được xác thực của session QR. Tin khách được lưu trước khi gọi `ChatbotOrchestrator.process`; bot-originated update và replay không tạo câu trả lời thứ hai. Webhook giữ xác thực secret, validation và phản hồi `204` cho update hợp lệ, kể cả khi bot/send thất bại; hiện vẫn chờ orchestration có giới hạn thời gian trong request, chưa dùng inbound queue bền vững.

Hai connector chuẩn hóa text, ảnh, document/file, sticker, audio/voice, video/video note và animation/GIF. Caption được dùng như văn bản; media không có caption nhận lời nhắc mô tả bằng văn bản. Telegram Bot nhận file qua field `document`; Telegram cá nhân dùng document/file của MTProto. Loại media và tham chiếu file được lưu với caption, không tải hay phân tích nội dung. Outbound media và luồng tải/render attachment đầy đủ trong Inbox vẫn chưa được hỗ trợ.

Lỗi orchestration, kể cả trước khi tạo claim, được ghi bằng mã cố định `PROCESSING_FAILED` và thời điểm trong `metadata.botFailure` của tin khách; log backend có ID liên quan và kết quả ghi diagnostics/handoff, không chứa lỗi gốc, prompt, token hay session. Backend thử lưu diagnostics và chuyển `pending`/pause độc lập để một lần ghi lỗi không cản lần còn lại. Replay giữ nguyên diagnostics đã lưu và không chạy lại bot. Khi MongoDB không ghi được, log vẫn cho biết lần phục hồi thất bại; không đảm bảo handoff bền vững trong thời gian database mất kết nối.

Telegram cá nhân phát unread từ kết quả `$inc` atomic để tin đến đồng thời không dùng lại snapshot cũ. Echo được đối chiếu theo ID gửi thật; kết quả gửi thành công đến sau timeout vẫn được giữ trong bộ nhớ 10 giây tính từ lúc kết quả đó về, không retry và không đổi trạng thái delivery đã timeout. Cơ chế đối chiếu này nằm trong một API process; không thay thế lưu trữ/đối soát bền vững cho echo đến sau thời gian lưu hoặc sau restart.

Khi thiếu knowledge đáng tin cậy, thiếu key hoặc provider lỗi/timeout, bot dùng `fallbackMessage`, chuyển hội thoại sang `pending` và tạm dừng 30 phút. Fallback mặc định khi tạo trợ lý là chính xác `Em chưa có đủ thông tin, nhân viên sẽ hỗ trợ.`; cấu hình riêng đã lưu không bị ghi đè. Viết lại template không thành công sẽ dùng nguyên mẫu. Lỗi gửi giữ tin khách, đánh dấu bot message `failed` cùng metadata handoff/error, không tự retry vì connector chưa có khóa idempotency. Nhân viên gửi từ web hoặc gửi thật từ tài khoản Telegram cá nhân đều kích hoạt Bot Pause 30 phút; echo/ID outbound của chatbot được loại trước khi áp dụng pause. Tin đến trong lúc pause vẫn được lưu, không được bot trả lời bù khi hết pause.

Owner Telegram cá nhân lấy từ session. `POST /api/v1/channels/telegram` yêu cầu admin đã xác thực và lưu `ownerId` của tài khoản đó cùng bản ghi token mã hóa. Hội thoại Bot mới lấy owner từ đăng ký này; không lấy owner từ body đăng ký, webhook, Telegram sender ID hay tự chọn admin. Đăng ký có owner không được dùng để auto-send cho hội thoại của owner khác. Hội thoại cũ không bị tự đổi owner. Token legacy chưa có owner không tự cấp owner cho hội thoại mới; cần xác minh/cấp owner bằng quy trình vận hành có kiểm chứng, không suy đoán hàng loạt. Hệ thống vẫn dùng một token Bot chung, unique `(provider, name)` ngăn đăng ký thứ hai ghi đè token hiện có.

Lượt gửi bot và chính sách pause của nhân viên dùng chung khóa atomic trên document hội thoại (`sendLeaseId`, `sendLeaseAt`). Bot giữ khóa từ lần đọc pause cuối tới khi thao tác gửi kết thúc/timeout; pause của nhân viên phải lấy cùng khóa trước khi commit. Vì vậy không khởi tạo lần gửi bot sau takeover đã commit. Request chờ khóa tối đa 15 giây rồi báo bận, không cưỡng chiếm khóa. Khóa không tự hết hạn: nếu process chết hoặc không thể nhả khóa, người vận hành phải xác nhận process cũ đã dừng và lượt gửi không còn chạy, đối chiếu ID/thời điểm khóa trên đúng hội thoại, rồi mới xóa khóa bằng cập nhật có điều kiện khớp ID đó và giữ pause. Không xóa claim bot hay tự gửi lại để phục hồi. Telegram vẫn có thể giao một tin đã khởi tạo trước takeover đến muộn; kết quả mạng mơ hồ không được retry.

Knowledge legacy thiếu owner được cách ly khỏi index: startup chỉ nạp chunk có owner khớp document có owner hợp lệ. Chunk thiếu owner, parent thiếu owner/không tồn tại hoặc owner không khớp không được đổi thành chuỗi `undefined`/`null` và không được truy xuất unscoped. Log `KNOWLEDGE_OWNER_QUARANTINED` chỉ ghi số chunk; dữ liệu gốc trong MongoDB giữ nguyên. Để phục hồi, người vận hành đọc các document/chunk thiếu owner hoặc sai liên kết, xác minh nguồn và chủ sở hữu ngoài hệ thống; đăng nhập bằng tài khoản admin của owner đã xác minh rồi gửi lại `title`/`content` qua `POST /api/v1/knowledge`. API lấy owner từ JWT, tạo document/chunk mới có scope; không dùng body `ownerId` hay tự nhận chủ cho bản ghi cũ. Nếu không xác minh được, tiếp tục cách ly. Không có migration xóa/đổi owner hàng loạt; re-ingestion phải là quyết định rõ ràng để tránh nhân bản nhiều lần.

Index hội thoại mới dùng `(platform, channelId, ownerId)`, nhưng database đã tồn tại phải chạy migration Zalo bên dưới trước khi rollout. Index tin nhắn vẫn là `(platform, externalMessageId)`; connector Zalo cá nhân namespace ID inbound theo tài khoản, còn các connector khác vẫn cần đánh giá collision khi triển khai nhiều tài khoản. Facebook và Instagram chưa có adapter tự động gửi; Zalo cá nhân mới ở trạng thái thử nghiệm.

### Zalo cá nhân thử nghiệm

Backend kết nối tài khoản Zalo cá nhân bằng `zca-js`, một API không chính thức mô phỏng Zalo Web. Chỉ bật trên tài khoản thử nghiệm vì Zalo có thể hạn chế hoặc khóa tài khoản. Chưa có xác nhận smoke test bằng tài khoản thật, reconnect WebSocket đầy đủ hoặc UI quản lý production.

Trước khi bật connector, cấu hình `MONGODB_URI`, `ENCRYPTION_KEY` tối thiểu 32 ký tự và `REDIS_URL` dùng chung giữa mọi API process. Credentials được mã hóa AES-256-GCM trong MongoDB; QR chỉ tồn tại tạm thời trong memory. Bốn route sau yêu cầu JWT role `admin` và luôn lấy owner từ JWT:

- `POST /api/v1/channels/zalo-personal/qr`: tạo phiên QR.
- `GET /api/v1/channels/zalo-personal/qr/:id`: đọc trạng thái QR của owner hiện tại.
- `GET /api/v1/channels/zalo-personal/status`: đọc trạng thái kết nối.
- `POST /api/v1/channels/zalo-personal/logout`: dừng listener và xóa session đã lưu.

QR không tạo được chuyển session sang `error` với mã `ZALO_QR_CREATE_FAILED`. Inbound hỗ trợ direct/group text và chuẩn hóa caption, URL/thumbnail cùng metadata an toàn từ attachment; outbound hiện chỉ gửi text.

Với database đã tồn tại, thực hiện theo đúng thứ tự: sao lưu, mở maintenance window, chạy migration rồi mới rollout/restart API:

```bash
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:zalo-personal-conversation-index
```

Migration tạo unique index `(platform, channelId, ownerId)` trước khi xóa legacy `(platform, channelId)`, không tự chạy khi startup và có thể chạy lại. Nếu đã có owner-scoped index dùng `partialFilterExpression`, `sparse` hoặc `collation`, migration dừng mà không xóa legacy index; người vận hành phải kiểm tra và sửa index không tương thích trước khi chạy lại.

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
- Meta/Instagram OAuth, Zalo cá nhân production UI/live smoke/reconnect đầy đủ, WebRTC và load test thực tế nằm ngoài MVP hiện tại.

## Lệnh kiểm tra

```bash
pnpm test
pnpm exec vitest run tests/security/webhook.spec.ts
pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
pnpm --filter web build
git diff --check
```
