# Nhuu-chat

MVP quản lý inbox chăm sóc khách hàng Facebook Messenger và Telegram cùng trợ lý RAG. MongoDB dùng MongoDB Atlas; Redis vẫn có thể chạy local bằng Docker.

## Đã hoàn thành

- Workspace React/Vite + Node/Express/TypeScript.
- JWT auth và role admin/agent/customer.
- React Router v6 chia route public và private; route Dashboard được mở sau khi API xác minh phiên cookie HttpOnly.
- Quên mật khẩu qua Nodemailer/SMTP với token đặt lại một lần, hết hạn sau 30 phút.
- Dashboard onboarding và kết nối Telegram cá nhân bằng QR MTProto; session chỉ lưu mã hóa ở backend.
- Backend Zalo cá nhân thử nghiệm qua QR, nhận media metadata và gửi text, ảnh hoặc file; credentials chỉ lưu mã hóa ở backend.
- MongoDB/Mongoose domain models, mã hóa provider secret AES-256-GCM.
- Telegram webhook có secret và idempotency.
- Chatbot tự động dùng chung orchestration/delivery cho Telegram Bot và Telegram cá nhân, có template, RAG đúng owner, fallback và bàn giao.
- REST conversation/message API và Socket.IO room authentication.
- Inbox Facebook Messenger thủ công cho tin nhắn văn bản mới: webhook xác minh chữ ký, lưu riêng conversation theo PSID, cập nhật realtime và gửi trả lời qua Messenger Send API.
- Workspace có vai trò owner/admin/staff; owner quản lý thành viên đã đăng ký, cấp quyền theo Facebook Page và có thể kết nối nhiều Page trong một Workspace.
- CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- CRUD mẫu trả lời nhanh dùng chung cho admin/agent tại `/api/v1/quick-replies`, hỗ trợ lưu một ảnh đính kèm qua Cloudinary.
- Knowledge chunking, TXT/Markdown/PDF/DOCX parser, provider-independent RAG.
- Bot Pause 30 phút; queue có chính sách retry 0s/1s/4s, riêng chatbot tự động chỉ gửi một lần để tránh trả lời trùng.
- Inbox React tối thiểu.
- Ghim tối đa 10 tin nhắn trong mỗi hội thoại, có thanh tin đã ghim và đồng bộ realtime cho admin/agent.
- Ghi chú nội bộ theo từng hội thoại; agent/admin có thể tạo, sửa, xóa và ghim ghi chú trong sidebar Thông tin.
- Trang `Cài đặt > Lịch sử` hiển thị Timeline thay đổi Cài đặt AI và kết nối/ngắt kết nối Facebook Page theo từng người dùng.
- Cài đặt `Giao diện` lưu riêng theo tài khoản, hỗ trợ Sáng/Tối/Theo thiết bị, 5 màu nhấn, mật độ hội thoại, cỡ chữ tin nhắn, xem trước trực tiếp và khôi phục mặc định.
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

## Deploy production

Frontend Vite chạy trên Vercel; API và Redis chạy trên Railway; MongoDB tiếp tục dùng Atlas. Cấu hình domain, môi trường và kiểm tra production được ghi tại [docs/deployment/vercel-railway.md](docs/deployment/vercel-railway.md).

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

Index hội thoại mới giữ uniqueness `(platform, channelId, ownerId)` cho các nền tảng hiện có; Facebook dùng thêm `customerId` để tách từng PSID trong cùng Page. Database cũ phải chạy migrations Facebook Page owner và Facebook conversation customer trước rollout Messenger như hướng dẫn tại [tài liệu triển khai](docs/deployment/vercel-railway.md); migration Zalo bên dưới vẫn áp dụng riêng. Index tin nhắn vẫn là `(platform, externalMessageId)`; connector Zalo cá nhân namespace ID inbound theo tài khoản, còn các connector khác vẫn cần đánh giá collision khi triển khai nhiều tài khoản. Instagram chưa có adapter gửi; Zalo cá nhân mới ở trạng thái thử nghiệm.

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

Migration tạo unique index `(platform, channelId, ownerId)` trước khi xóa legacy `(platform, channelId)`, không tự chạy khi startup và có thể chạy lại. Nếu đã có owner-scoped index dùng `partialFilterExpression`, `sparse` hoặc `collation`, migration dừng mà không xóa legacy index; người vận hành phải kiểm tra và sửa index không tương thích trước khi chạy lại. Khi rollout Facebook Messenger, chạy migration này trước `migrate:facebook-conversation-customer-index`; tuyệt đối không chạy lại sau migration Facebook vì nó sẽ tạo ràng buộc toàn cục cản nhiều PSID trên cùng Page.

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

### Đăng bài Facebook Page V1

Workspace và quyền Facebook Page được mô tả tại [docs/wiki/workspace-page-access.md](docs/wiki/workspace-page-access.md). Database hiện hữu cần backup và chạy lần lượt `migrate:workspaces` cùng `migrate:facebook-page-multi-connection-index`; cả hai lệnh mặc định dry-run và chỉ ghi khi có `--apply`. Không áp dụng migration production trước khi operator duyệt báo cáo.

Workspace owner có thể kết nối nhiều Facebook Page và chọn Page cho từng bài viết gồm text bắt buộc cùng tối đa một ảnh. Có thể kết nối bằng OAuth từ Dashboard hoặc nhập thủ công `Page ID` và `Page access token`; backend gọi Graph API để kiểm tra Page trước khi mã hóa token và lưu từng connection vào MongoDB. Không đặt Page ID/token trong `.env`, frontend storage, log hoặc response. Token chỉ được giải mã trong memory ngay trước khi gọi Meta. Cần dùng HTTPS và giữ Page access token như credential có quyền đăng bài; khi nghi ngờ lộ token, thu hồi/cấp token mới tại Meta rồi kết nối lại.

Trước khi dùng, cấu hình Cloudinary đủ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET`. Ảnh được upload qua Cloudinary trước khi đăng; chỉ nhận `image/jpeg`, `image/png` hoặc `image/webp`, tối đa 5 MiB (5 × 1024 × 1024 byte), một ảnh cho mỗi bài. Text là bắt buộc. V1 dùng Meta Graph API `v26.0` mặc định (`META_GRAPH_API_VERSION` có thể đổi theo cấu hình). Có thể kết nối bằng OAuth qua Dashboard với `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` và `WEB_APP_URL`; luồng nhập thủ công Page ID/Page Access Token vẫn được giữ nguyên. Khi app còn ở Development Mode, chỉ người dùng, Page và vai trò được cấp trong app mới có thể dùng, nên chưa phải luồng production/public.

Có ba cách lưu bài: `draft` (bản nháp, chưa gọi Meta), `scheduled` (hẹn đăng), và `now` (đăng ngay, chuyển qua `publishing`). Trạng thái kết quả là `publishing`, `published` hoặc `failed`; đây là toàn bộ tập trạng thái được hỗ trợ. Thời gian nhập/hiển thị dùng `Asia/Ho_Chi_Minh`, còn MongoDB persistence dùng `Date` UTC. Worker kiểm tra bài đến hạn mỗi 30 giây (`FACEBOOK_POST_SCHEDULER_INTERVAL_MS=30000`) và chạy một lượt recovery khi API khởi động, vì vậy bài `scheduled` quá hạn khi server tắt sẽ được xử lý sau restart. Lease mặc định là 120 giây (`FACEBOOK_POST_LEASE_MS=120000`) để phát hiện worker chết.

Bài `failed` có thể retry thủ công; không có retry tự động cho lỗi timeout của Meta vì request có thể đã được Meta nhận dù client không nhận được phản hồi. Hãy kiểm tra Page và bài đã publish trên Meta trước khi bấm retry để tránh đăng trùng. Lease hết hạn cũng chuyển bài sang `failed` và yêu cầu xác nhận thủ công. OAuth đã có trong Dashboard, nhưng app vẫn cần hoàn tất App Review và chuyển sang Live Mode trước khi phục vụ người dùng public; V1 chưa hỗ trợ nhiều Page trên một user, video, nhiều ảnh, link preview, lịch lặp/recurring schedules, chỉnh sửa hoặc xóa bài đã publish, hay bulk/calendar nâng cao.

### Lịch sử hoạt động cài đặt

Mở `Cài đặt > Lịch sử` hoặc `/settings/history` để xem Timeline thay đổi, giá trị cũ/mới, người thực hiện, thời gian và mã phiên bản. Bản hiện tại ghi nhận các thay đổi Cài đặt AI và thao tác kết nối/ngắt kết nối Facebook Page, gồm cả kết nối OAuth và nhập thủ công. Timeline có bộ lọc `Tất cả`, `Cài đặt AI`, `Kết nối Facebook` và phân trang 20 bản ghi; thao tác ngắt kết nối hiện nằm trong `Tất cả`.

Mở `Cài đặt > Giao diện` hoặc `/settings/appearance` để chọn chế độ màu, màu nhấn, mật độ hội thoại và cỡ chữ tin nhắn. Tuỳ chọn được lưu theo tài khoản qua API general settings hiện có; `Theo thiết bị` bám theo cấu hình sáng/tối của hệ điều hành. Khu vực xem trước phản ánh lựa chọn ngay khi thay đổi; nút `Khôi phục mặc định` đưa giao diện về Sáng, xanh dương, thoải mái và cỡ chữ vừa.

API đọc lịch sử là `GET /api/v1/setting-histories?page=1&pageSize=20&actionType=UPDATE_AI_SETTINGS`. Route yêu cầu phiên đăng nhập hợp lệ với role `admin` hoặc `agent`, ưu tiên access token trong HttpOnly cookie và vẫn hỗ trợ Bearer token cho client cũ. API không nhận `userId`; backend luôn lấy người dùng từ thông tin xác thực và chỉ trả lịch sử của người đó. `page` mặc định là `1`, `pageSize` mặc định là `20` và được giới hạn tối đa `50`; `actionType` tùy chọn nhận `UPDATE_AI_SETTINGS`, `CONNECT_FACEBOOK_PAGE` hoặc `DISCONNECT_FACEBOOK_PAGE`. Kết quả mới nhất đứng trước và có dạng `{ items, pagination: { page, pageSize, total, totalPages, hasNextPage } }`.

Lịch sử không lưu Page Access Token, OAuth token, cookie, password, secret hoặc trường xác thực nhạy cảm. Mỗi người dùng được giữ tối đa 500 bản ghi; sau khi tạo bản ghi vượt giới hạn, hệ thống tự xóa các bản ghi cũ nhất. Đây là lịch sử vận hành có giới hạn, không phải kho audit lưu vô thời hạn.

Snapshot trước/sau gắn với thao tác cập nhật thành công, kể cả khi có yêu cầu đồng thời; ngắt kết nối chỉ ghi Page thực sự bị xóa. Việc ghi và dọn lịch sử chạy bất đồng bộ sau thao tác chính: lỗi được log phía server, không làm thao tác chính thất bại, nhưng có thể khiến lịch sử bị thiếu hoặc chưa được dọn.

### Gửi ảnh và file từ Inbox

Composer hỗ trợ chọn một ảnh hoặc file, nhập chú thích tùy chọn rồi gửi tới hội thoại Zalo cá nhân hoặc Telegram cá nhân. Backend giới hạn 20 MB mỗi lần gửi, chặn `.exe`, `.js`, `.sh` và MIME nguy hiểm, lưu media qua Cloudinary để message còn tải được sau khi reload, đồng thời gửi buffer trực tiếp qua connector cá nhân. Các kênh khác vẫn chỉ hỗ trợ text.

Ảnh nhận JPG, PNG, GIF và WEBP; file nhận PDF, DOC/DOCX, XLS/XLSX, ZIP và file thông thường. Mỗi request chỉ có một file. Cần cấu hình ba biến Cloudinary ở mục trên để bật lưu media.

### Ghim tin nhắn

Admin và agent có quyền truy cập hội thoại có thể ghim tối đa 10 tin nhắn. Khi hover hoặc focus vào một tin, giao diện chỉ hiển thị thao tác `Ghim tin nhắn` hoặc `Bỏ ghim`; tin đã ghim có nhãn `Đã ghim`. Thanh ghim ở đầu khung chat hiển thị số thứ tự, trích dẫn nội dung và cho phép chuyển giữa các tin ghim; bấm vào nội dung sẽ cuộn mượt tới tin gốc đang có trong lịch sử đã tải.

Backend cung cấp `GET/POST /api/v1/conversations/:conversationId/pins` và `DELETE /api/v1/conversations/:conversationId/pins/:messageId`. Mỗi thao tác thành công phát event Socket.IO `chat:message_pin_updated` vào room của hội thoại để các client đang mở thay toàn bộ danh sách ghim theo dữ liệu canonical. Tính năng không cần biến môi trường riêng. Nếu tin gốc nằm ngoài page lịch sử hiện tại, thanh ghim vẫn hiện trích dẫn nhưng chưa tự tải page cũ để cuộn tới tin đó.

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
- `POST /api/v1/auth/login` trả thông tin user gồm role hiện tại và đặt access/refresh token trong HttpOnly cookie.
- Mỗi lần đăng ký/đăng nhập tạo một phiên xác thực riêng trong MongoDB; các thiết bị có kho cookie riêng có thể duy trì phiên đồng thời. API, tên/thuộc tính cookie và hỗ trợ Bearer token hiện có không đổi. Access token hết hạn sau 15 phút; refresh token hết hạn sau 7 ngày và thời hạn phiên được tính lại 7 ngày sau mỗi lần refresh thành công. `POST /api/v1/auth/logout` thu hồi đúng phiên của refresh cookie hiện tại và ngắt kết nối Socket.IO của phiên đó; phiên trên thiết bị khác tiếp tục hoạt động.
- `POST /api/v1/auth/forgot-password` nhận email và luôn trả cùng thông báo chung, không tiết lộ email có tài khoản; `POST /api/v1/auth/reset-password` nhận token cùng mật khẩu mới từ 8 ký tự. Token hết hạn sau 30 phút, dùng một lần; sau khi đặt lại, người dùng đăng nhập lại.
- Đặt lại mật khẩu thu hồi tất cả phiên đăng nhập, refresh token cũ và ngắt các kết nối Socket.IO của tài khoản. Refresh token legacy được nâng cấp thành phiên riêng khi dùng lần đầu; đăng nhập mới không xóa token legacy chưa chuyển đổi. Access token legacy không gắn phiên có thể còn hiệu lực đến khi tự hết hạn, tối đa 15 phút sau logout hoặc đặt lại mật khẩu.
- Tính năng phiên nhiều thiết bị hiện chỉ có ở backend: chưa có giao diện/API xem hoặc quản lý thiết bị và chưa giới hạn số thiết bị. Hai cửa sổ cùng browser profile dùng chung cookie nên dùng chung phiên. Trên một API instance, lệnh ngắt Socket.IO chỉ tác động socket tại instance đó; khi chạy nhiều instance cần bật Redis Socket.IO adapter hiện có để phân phối lệnh ngắt phiên giữa các instance.
- Để gửi email đặt lại, cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` và `SMTP_PASS` trong `apps/api/.env` (`SMTP_PASSWORD` cũng được hỗ trợ); `SMTP_USER` đồng thời được dùng làm địa chỉ người gửi. Ví dụ Gmail dùng `smtp.gmail.com`, cổng `587`, `SMTP_SECURE=false` và App Password. Có thể dùng nhà cung cấp SMTP khác; không cần đăng ký domain riêng nếu nhà cung cấp cho phép gửi từ hộp thư hiện có. `WEB_APP_URL` phải trỏ đúng frontend để tạo liên kết `/reset-password?token=...`. API giữ token dạng hash trong MongoDB, không ghi token hoặc thông tin SMTP vào log.
- Sau đăng nhập, mọi role được đưa vào Dashboard. Người dùng phải kết nối Telegram trước khi Inbox có dữ liệu.
- Telegram cá nhân cần `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` lấy từ `my.telegram.org`; QR được quét bằng ứng dụng Telegram đã đăng nhập.
- Thẻ hội thoại được quản lý qua API với payload `{ "name": "Mua hàng", "color": "#22c55e" }`; danh mục hiện dùng chung cho admin/agent. Việc gắn thẻ vào từng hội thoại chưa thuộc bước này.
- Telegram Bot API hiện tại vẫn là provider riêng, không dùng chung session cá nhân.

Test Mongo integration cần `MONGODB_TEST_URI` trỏ tới database test riêng trên Atlas; nếu không có URI này, test dùng fallback in-memory theo cấu hình hiện tại.

## Chưa hoàn tất trước production

- Chưa chạy Playwright E2E trên môi trường deploy thật.
- Redis adapter và Mongo integration cần xác minh trên Atlas/CI sạch.
- Vector store hiện là adapter in-memory cho MVP; Mongo Atlas Vector Search vẫn là lựa chọn production chưa triển khai.
- Chưa nghiệm thu live với Meta test Page cho luồng Messenger inbound/reply; cần cấu hình webhook, quyền phù hợp và Page/tài khoản tester như [tài liệu triển khai](docs/deployment/vercel-railway.md). Việc mở tích hợp Facebook Page cho người dùng public vẫn phụ thuộc app mode, quyền truy cập và quy trình review của Meta. Instagram OAuth, Zalo cá nhân production UI/live smoke/reconnect đầy đủ, WebRTC và load test thực tế nằm ngoài MVP hiện tại.

## Lệnh kiểm tra

```bash
pnpm test
pnpm exec vitest run tests/security/webhook.spec.ts
pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
pnpm --filter web build
git diff --check
```
