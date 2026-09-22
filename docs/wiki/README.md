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
- Trợ lý AI có cấu hình model Gemini, gợi ý trả lời và phát hiện cảm xúc.
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
- Backend Zalo cá nhân thử nghiệm hỗ trợ QR, lưu credentials mã hóa, nhận direct/group media metadata và gửi text, ảnh hoặc file.
- Outbound media từ Inbox hỗ trợ một ảnh/file tối đa 20 MB kèm chú thích cho Zalo cá nhân và Telegram cá nhân; media được lưu qua Cloudinary và các định dạng nguy hiểm bị chặn.
- Socket.IO room authentication và event realtime cho message/conversation.
- API đọc/ghi hội thoại, message, customer và knowledge.
- API CRUD danh mục thẻ hội thoại dùng chung cho admin/agent tại `/api/v1/conversation-tags`.
- API CRUD mẫu trả lời nhanh dùng chung cho admin/agent tại `/api/v1/quick-replies`, hỗ trợ một ảnh đính kèm lưu trên Cloudinary.
- API ghi chú nội bộ theo hội thoại tại `/api/v1/conversations/:conversationId/notes`, hỗ trợ tạo, sửa, xóa và ghim cho admin/agent có quyền truy cập.
- API ghim tin nhắn theo hội thoại tại `/api/v1/conversations/:conversationId/pins`, giới hạn 10 tin và chỉ cho admin/agent có quyền truy cập.
- Chunking và parser cho TXT, Markdown, PDF, DOCX; RAG adapter độc lập với provider.
- Bot Pause 30 phút; queue hỗ trợ retry `0s`, `1s`, `4s`, nhưng chatbot tự động chỉ gửi một lần do connector chưa hỗ trợ khóa idempotency.
- Bot Pause 30 phút và retry outbound theo các mốc `0s`, `1s`, `4s`.
- Cấu hình Trợ lý AI được lưu theo tài khoản qua `GET/PATCH /api/v1/ai-settings`.
- Trang `Cài đặt > Lịch sử` và API đọc lịch sử đã hoạt động cho thay đổi Cài đặt AI cùng kết nối/ngắt kết nối Facebook Page.
- Mô hình Gemini có ba tier: `smart`, `balanced` và `economy`, tương ứng với model thông minh nhất, cân bằng và tiết kiệm.
- Gợi ý trả lời hỗ trợ các chế độ thủ công, khi mở hội thoại và khi khách nhắn tin; chế độ thủ công không tự gọi API khi mở hội thoại.
- Gợi ý dùng 6 tin nhắn cuối của cả khách hàng và nhân viên theo thứ tự thời gian, trả tối đa 3 câu và có fallback khi Gemini không khả dụng.
- Phát hiện cảm xúc hỗ trợ cửa sổ 3, 6 hoặc 10 tin nhắn gần nhất.
- Frontend đã chuyển sang Tailwind CSS v4; entry CSS duy nhất là `apps/web/src/styles/tailwind.css`.
- Các vùng cuộn chính của Inbox, gợi ý AI, sidebar và modal đã ẩn thanh scrollbar nhưng vẫn giữ thao tác cuộn.

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
  - toolbar file, ảnh, ghi chú và mẫu trả lời;
  - chọn một ảnh/file, xem tên hoặc preview, xóa lựa chọn và gửi kèm chú thích.
- Sidebar thông tin bên phải khung chat có:
  - tab `Thông tin` và `Tạo đơn`;
  - khu vực `Ghi chú`, hiển thị tác giả, nội dung, ngày/tháng/năm cùng thời gian cập nhật và thao tác sửa/xóa/ghim;
  - action ghi chú chỉ hiện đầy đủ khi hover/focus; ghi chú đã ghim giữ icon ghim màu vàng, không hiển thị nhãn chữ;
  - cụm action được thu gọn để giữ vùng hiển thị tên người ghi chú;
  - khu vực `Đơn hàng`;
  - desktop rộng tương đương sidebar hội thoại trái, co giãn từ `300px` đến tối đa `395px`;
  - responsive drawer trên màn hình hẹp dưới `1000px`.
- Khi chiều rộng màn hình dưới breakpoint Inbox:
  - danh sách hội thoại bên trái được ẩn khỏi layout cố định;
  - khung chat chiếm phần còn lại;
  - nút danh sách cạnh avatar mở conversation list dạng drawer;
  - drawer có overlay và tự đóng sau khi chọn hội thoại.

### Ghim tin nhắn

Admin và agent có quyền truy cập hội thoại có thể ghim tối đa 10 tin. Khi hover hoặc focus vào message, cụm thao tác chỉ hiển thị `Ghim tin nhắn` hoặc `Bỏ ghim`; message đã ghim có nhãn `Đã ghim` nằm ngoài bubble. Thanh ghim cố định phía trên lịch sử chat hiển thị vị trí hiện tại trên tổng số tin ghim, trích dẫn một dòng và nút chuyển trước/sau. Bấm vào phần nội dung sẽ cuộn mượt tới tin gốc; nút X bỏ ghim không kích hoạt thao tác cuộn.

Các endpoint đều yêu cầu JWT role `admin` hoặc `agent` và kiểm tra quyền truy cập hội thoại trong service:

- `GET /api/v1/conversations/:conversationId/pins`: lấy danh sách ghim mới nhất trước.
- `POST /api/v1/conversations/:conversationId/pins` với body `{ "messageId": "..." }`: ghim một tin thuộc đúng hội thoại.
- `DELETE /api/v1/conversations/:conversationId/pins/:messageId`: bỏ ghim một tin.

Sau khi ghim hoặc bỏ ghim thành công, API phát `chat:message_pin_updated` vào Socket.IO room của hội thoại. Frontend thay toàn bộ danh sách ghim bằng payload canonical nên event và HTTP response đến khác thứ tự không tạo bản trùng. Không cần biến môi trường riêng. Nếu tin gốc chưa nằm trong page lịch sử đang tải, thanh ghim vẫn hiển thị trích dẫn nhưng chưa tự tải page cũ để cuộn tới tin đó.

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
- `GEMINI_CHAT_MODEL` tùy chọn; mặc định là `gemini-3.5-flash-lite`.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET` nếu muốn lưu ảnh đính kèm mẫu trả lời nhanh.

Không commit `.env`, token, secret hoặc encryption key.

`GEMINI_API_KEY` chỉ được lưu ở backend trong `apps/api/.env`; không đưa key vào frontend, request của trình duyệt hoặc repository. Endpoint `GET/PATCH /api/v1/ai-settings` dùng để đọc/cập nhật cấu hình Trợ lý AI cho tài khoản. Endpoint `POST /api/v1/conversations/:id/ai-suggestions` chỉ cho `admin` và `agent`, nhận trigger `manual`, `conversation_open` hoặc `customer_message`, đọc 6 tin nhắn cuối của cả khách hàng và nhân viên theo thứ tự thời gian, rồi trả tối đa 3 gợi ý kèm `source` là `gemini` hoặc `fallback`. Khi tính năng/model bị tắt, chế độ không khớp trigger, thiếu key, Gemini timeout/lỗi quota hoặc trả dữ liệu không hợp lệ, backend không tự tạo gợi ý hoặc dùng fallback phù hợp để không chặn composer. Prompt và response của request Gemini không được lưu vào database.

### Trả lời nhanh và ảnh Cloudinary

Khi dùng ảnh đính kèm, cần điền đủ các biến sau trong `apps/api/.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

Các route `/api/v1/quick-replies` yêu cầu role `admin` hoặc `agent`, nhưng dữ liệu vẫn được giới hạn theo user đã xác thực: `GET` chỉ liệt kê mẫu của user đó, `PATCH` và `DELETE` không truy cập mẫu của user khác. `POST` tạo mẫu, `PATCH /:id` cập nhật một phần, và `DELETE /:id` xóa mẫu. Hai route ghi dữ liệu dùng `multipart/form-data` với field text `shortcut`, `message` và field file tùy chọn `attachment`; `PATCH` không có file sẽ giữ ảnh hiện tại.

`attachment` chỉ nhận MIME type `image/*`, tối đa 5 MiB (5 × 1024 × 1024 byte). Backend stream ảnh từ memory lên Cloudinary vào `nhuu-chat/quick-replies/<userId>` và lưu URL bảo mật, public ID, resource type, MIME type, số byte cùng metadata kích thước ảnh. Khi thay ảnh, xóa mẫu hoặc dọn upload mồ côi sau khi MongoDB thất bại, asset Cloudinary tương ứng được xóa theo cơ chế best-effort; lỗi cleanup được ghi log và không rollback trạng thái MongoDB đã quyết định. Nếu chưa cấu hình Cloudinary, các thao tác không kèm ảnh vẫn không cần khởi tạo media service, còn request có ảnh sẽ lỗi cấu hình.

### Đăng bài Facebook Page V1

Mỗi user chỉ có một kết nối Facebook Page trong V1. Người vận hành nhập thủ công `Page ID` và `Page access token` trong màn hình đăng bài; API xác thực metadata Page qua Meta Graph API trước khi lưu token đã mã hóa. Token không được trả về frontend, lưu trong browser, ghi log hoặc đưa vào `.env`; chỉ giải mã trong memory khi publish. Dùng HTTPS, giới hạn quyền truy cập vận hành và thu hồi token tại Meta nếu có dấu hiệu lộ.

Cấu hình Cloudinary đủ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET`. Bài bắt buộc có text, tùy chọn tối đa một ảnh `JPG`/`PNG`/`WebP` không quá 5 MiB; ảnh được lưu qua Cloudinary và MongoDB chỉ giữ metadata/URL an toàn. Graph API mặc định là `v26.0`, qua `META_GRAPH_API_VERSION`. Có thể đăng nhập OAuth trong modal Dashboard với `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` và `WEB_APP_URL`; luồng nhập thủ công Page ID/Page Access Token vẫn được giữ nguyên. Khi Meta App còn ở Development Mode, chỉ tài khoản/Page và vai trò được cấp trong app mới có thể kiểm thử; cần hoàn tất cấu hình/quyền và quy trình Meta phù hợp trước khi mở cho người dùng production.

Chế độ và trạng thái được hỗ trợ: lưu `draft`, đăng `now`, hẹn `scheduled`, sau đó `publishing`, `published` hoặc `failed`. Nhập/hiển thị lịch theo `Asia/Ho_Chi_Minh`; MongoDB lưu thời điểm dưới dạng UTC. Worker kiểm tra mỗi 30 giây (`FACEBOOK_POST_SCHEDULER_INTERVAL_MS=30000`), chạy recovery ngay khi API khởi động, và dùng lease mặc định 120 giây (`FACEBOOK_POST_LEASE_MS=120000`), nên bài đến hạn trong lúc server tắt sẽ được xử lý sau restart.

Retry chỉ là thao tác thủ công trên bài `failed`. Timeout Meta là kết quả mơ hồ: Meta có thể đã tạo bài dù client không nhận được phản hồi, nên phải kiểm tra Page/Meta trước khi retry để tránh trùng bài. Lease hết hạn cũng cần xác nhận thủ công. Ngoài phạm vi V1: App Review production, nhiều Page trên một user, video, nhiều ảnh, lịch lặp, chỉnh sửa/xóa bài đã publish và các tính năng bulk/calendar nâng cao.

### Lịch sử hoạt động cài đặt

Người dùng mở `Cài đặt > Lịch sử` (`/settings/history`) để xem Timeline gồm giá trị cũ/mới, người thực hiện, thời gian và mã phiên bản. Phạm vi hiện tại gồm cập nhật Cài đặt AI, kết nối Facebook Page qua OAuth hoặc nhập thủ công, và ngắt kết nối Facebook Page. Giao diện dùng các bộ lọc `Tất cả`, `Cài đặt AI`, `Kết nối Facebook`, tải 20 bản ghi mỗi trang và có nút chuyển trang; thao tác ngắt kết nối hiện nằm trong `Tất cả`.

Route `GET /api/v1/setting-histories` yêu cầu xác thực với role `admin` hoặc `agent`, dùng access token trong HttpOnly cookie hoặc Bearer token tương thích client cũ. Backend lấy user từ phiên xác thực, không nhận `userId` trong query/body và không trả dữ liệu của người dùng khác. Query hỗ trợ:

- `page`: số trang dương, mặc định `1`.
- `pageSize`: mặc định `20`, tối đa `50`.
- `actionType`: tùy chọn `UPDATE_AI_SETTINGS`, `CONNECT_FACEBOOK_PAGE` hoặc `DISCONNECT_FACEBOOK_PAGE`.

Response có dạng `{ items, pagination: { page, pageSize, total, totalPages, hasNextPage } }` và sắp xếp bản ghi mới nhất trước. Lịch sử chỉ chứa metadata an toàn; Page Access Token, OAuth token, cookie, password, secret và trường xác thực nhạy cảm không được lưu hoặc trả về. Mỗi người dùng được giữ tối đa 500 bản ghi, bản ghi cũ nhất tự bị dọn khi vượt giới hạn; vì vậy đây không phải kho audit lưu vô thời hạn.

Snapshot trước/sau gắn với thao tác cập nhật thành công, kể cả khi có yêu cầu đồng thời; ngắt kết nối chỉ ghi Page thực sự bị xóa. Việc ghi và dọn lịch sử chạy bất đồng bộ sau thao tác chính: lỗi được log phía server, không làm thao tác chính thất bại, nhưng có thể khiến lịch sử bị thiếu hoặc chưa được dọn.

### Gửi media outbound

`POST /api/v1/messages/send` tiếp nhận JSON cho tin text hoặc `multipart/form-data` với các field `conversationId`, `type`, `content` và một file `attachment`. Backend giới hạn 20 MB, chặn `.exe`, `.js`, `.sh` cùng MIME nguy hiểm, upload media vào Cloudinary rồi gửi buffer qua connector. `telegram_personal` dùng GramJS `sendFile`; `zalo_personal` dùng attachment buffer của `zca-js`. Chỉ hai kênh cá nhân này được phép gửi media; Facebook, Instagram, Telegram Bot và Zalo khác vẫn text-only. Video chưa có nút riêng trong bản đầu.

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

Owner Telegram cá nhân lấy từ session. Đăng ký Telegram Bot qua `POST /api/v1/channels/telegram` lưu owner admin đã xác thực cùng token mã hóa; hội thoại mới kế thừa owner này, không lấy owner từ body/webhook. Adapter không dùng đăng ký có owner để gửi cho hội thoại của người khác. Hội thoại cũ không bị đổi owner; token legacy chưa có owner không được tự cấp owner cho hội thoại mới. Chỉ cấp owner legacy sau xác minh nguồn bằng quy trình vận hành có kiểm chứng. Một token chung vẫn là giới hạn hiện tại và đăng ký thứ hai không ghi đè bản ghi hiện có. Model hội thoại mới dùng unique index `(platform, channelId, ownerId)`; database đã tồn tại phải chạy migration Zalo thủ công trước rollout. Index message `(platform, externalMessageId)` vẫn cần đánh giá collision cho các connector nhiều tài khoản khác. Facebook/Instagram chưa có connector tự gửi; Zalo cá nhân mới ở trạng thái thử nghiệm.

### Zalo cá nhân thử nghiệm

Connector backend dùng `zca-js`, API không chính thức mô phỏng Zalo Web, nên chỉ dùng tài khoản thử nghiệm vì tài khoản có thể bị hạn chế hoặc khóa. Chưa hoàn tất smoke test tài khoản thật, reconnect WebSocket đầy đủ và UI quản lý production.

Để bật connector, mọi API process phải dùng chung `MONGODB_URI`, `REDIS_URL` và `ENCRYPTION_KEY` tối thiểu 32 ký tự. Credentials được mã hóa AES-256-GCM trong MongoDB; QR chỉ lưu tạm trong memory. Các route đều yêu cầu JWT role `admin`, lấy owner từ JWT và không nhận owner tùy ý:

- `POST /api/v1/channels/zalo-personal/qr`: tạo phiên QR.
- `GET /api/v1/channels/zalo-personal/qr/:id`: đọc trạng thái QR đúng owner.
- `GET /api/v1/channels/zalo-personal/status`: đọc trạng thái kết nối.
- `POST /api/v1/channels/zalo-personal/logout`: dừng listener và xóa session.

QR không tạo được trả trạng thái `error` với `ZALO_QR_CREATE_FAILED`. Inbound direct/group giữ caption, URL/thumbnail và metadata attachment đã lọc trường nhạy cảm; outbound hiện chỉ hỗ trợ text.

Trước rollout trên database cũ: sao lưu, mở maintenance window, chạy lệnh sau thành công rồi mới deploy/restart API:

```bash
MONGODB_URI='mongodb+srv://...' pnpm --filter api run migrate:zalo-personal-conversation-index
```

Migration tạo unique index `(platform, channelId, ownerId)` trước khi xóa legacy `(platform, channelId)`, không tự chạy ở startup và có thể chạy lại. Nếu owner-scoped index hiện có dùng `partialFilterExpression`, `sparse` hoặc `collation`, migration dừng an toàn trước khi tạo/xóa index; cần kiểm tra và sửa index đó rồi mới chạy lại.

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
- Thanh toán trong phần Trợ lý AI hiện mới là UI cố định; tích hợp ví và tính phí thực tế chưa triển khai.
- Nút `+ Tạo đơn`, ghi chú và một số toolbar hiện mới là UI placeholder; chưa có luồng persistence/order backend hoàn chỉnh.
- Gửi media trong message đã hỗ trợ một ảnh/file cho Zalo cá nhân và Telegram cá nhân; upload video chưa có nút riêng trong bản đầu.
- Instagram OAuth, Zalo cá nhân production UI/live smoke/reconnect đầy đủ, WebRTC và load test thực tế chưa thuộc MVP hiện tại.

## 8. Kế hoạch tiếp theo

- Hoàn thiện persistence cho ghi chú và đơn hàng trong sidebar.
- Hoàn thiện flow tạo đơn và liên kết sản phẩm/customer.
- Chạy E2E trên môi trường deploy thật với Telegram QR và realtime inbound/outbound.
- Chuẩn hóa Mongo integration trong CI bằng Mongo replica set test.
- Đánh giá MongoDB Atlas Vector Search cho RAG production.
- Hoàn thiện tích hợp thanh toán và ví cho các tính năng AI.
- Hoàn thiện UI, live smoke và reconnect production cho Zalo cá nhân; tích hợp Facebook và Instagram sau khi có spec được phê duyệt.

## 9. Tài liệu liên quan

- README dự án: `README.md`
- Quy định agent: `AGENTS.md`
- Prompt UI và handoff dài: `DEVELOPMENT_PROMPT.md`
- Yêu cầu sản phẩm: `docs/requirements/`
- Spec kiến trúc: `docs/superpowers/specs/`
- Implementation plan: `docs/superpowers/plans/`
- Nhật ký thay đổi: `CHANGELOG.md`
