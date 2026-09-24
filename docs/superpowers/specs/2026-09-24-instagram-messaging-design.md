# Kết nối Instagram Messaging độc lập

## Mục tiêu

Cho phép Workspace kết nối tài khoản Instagram Professional (Business hoặc Creator) trực tiếp bằng Instagram Login, không yêu cầu liên kết Facebook Page, rồi nhận và trả lời tin nhắn trực tiếp trong Inbox NhuuChat.

## Quyết định sản phẩm

- Dùng **Instagram Login** độc lập với Facebook Login/Page OAuth. Không gắn thông tin đăng nhập hoặc token Instagram vào `FacebookPageConnection`.
- Chỉ hỗ trợ tài khoản Instagram Professional. Không hỗ trợ tài khoản cá nhân thường.
- MVP xử lý hội thoại DM một-một và gửi văn bản. Bài đăng, bình luận, nhóm chat, file/ảnh/video và AI tự động trả lời nằm ngoài phạm vi.
- Nhiều tài khoản Instagram khác nhau được kết nối vào một Workspace. Một tài khoản Instagram chỉ được sở hữu bởi một Workspace tại một thời điểm; không fan-out webhook sang nhiều Workspace.
- Kết nối/ngắt kết nối do chủ Workspace thực hiện. Staff chỉ nhận quyền xem/gửi trên tài khoản đã được cấp qua `allowedChannels`.
- Chỉ tạo lịch sử sau khi thao tác kết nối hoặc ngắt kết nối thành công, dùng sự kiện `CONNECT_CHANNEL` / `DISCONNECT_CHANNEL` hiện có và metadata không chứa token.

## Luồng kết nối

1. Chủ Workspace chọn Instagram trong modal kết nối.
2. Backend tạo OAuth state dùng một lần, có thời hạn, gắn với user và provider Instagram; state Instagram không thể dùng ở Facebook OAuth.
3. Chuyển hướng sang Instagram Login với các quyền tối thiểu cần cho hồ sơ cơ bản và quản lý tin nhắn. Tên scope cụ thể phải được đối chiếu lại với Meta Developer Docs trong lúc triển khai vì Meta có thể đổi tên/quyền truy cập.
4. Callback đổi authorization code lấy token, xác thực token và lấy Instagram-scoped account ID, username, tên hiển thị và avatar nếu API cung cấp.
5. Token được mã hóa lúc lưu. API, log, response và Socket không được trả token hoặc authorization code.
6. Backend đăng ký webhook cần thiết cho tin nhắn và xác nhận kết nối. Nếu subscription thất bại, không báo kết nối hoàn tất; lưu trạng thái lỗi có thể khôi phục để retry an toàn.
7. Frontend cập nhật danh sách kết nối và channel picker. Redirect/callback không được xem là thành công trước khi backend lưu connection.

## Mô hình dữ liệu và định danh

### InstagramAccountConnection

Collection riêng, tối thiểu gồm `ownerUserId`, `instagramUserId`, `username`, `displayName`, `avatarUrl`, encrypted access token, token expiry nếu Meta trả về, `status`, subscription/error metadata và timestamps.

- Unique index toàn cục trên `instagramUserId`, ngăn một tài khoản gắn với nhiều Workspace.
- Index tra cứu theo `ownerUserId` và trạng thái.
- Trường token được loại khỏi select mặc định; DTO chỉ trả metadata công khai và trạng thái.
- Có đường ngắt kết nối idempotent: unsubscribe webhook nếu được hỗ trợ, xóa/thu hồi credential theo khả năng API, gỡ channel directory access và ghi lịch sử sau khi hoàn tất.

### Conversation, customer và message

- Hội thoại dùng `platform="instagram"`, `channelId=instagramUserId` và `ownerId` là Workspace owner.
- Khách được định danh bằng Instagram-scoped ID (IGSID) trong namespace nội bộ riêng, không tái dùng ID khách Telegram/Facebook.
- Mỗi DM có customer/conversation riêng. Điều chỉnh migration/index hiện tại để unique Instagram conversation gồm `platform + channelId + ownerId + customerId`; giữ nguyên riêng biệt index Facebook và semantics của các nền tảng khác.
- Webhook/provider message ID cần được namespace theo account hoặc gắn với conversation để tránh collision; event và message được xử lý idempotent.
- Không import hội thoại cũ trong MVP. Hội thoại được tạo/cập nhật từ webhook hợp lệ sau khi kết nối.

## Nhận tin, gửi tin và realtime

- Webhook xác minh challenge và chữ ký theo yêu cầu Instagram Login hiện hành; route dùng raw body khi cần để chữ ký được tính trên bytes gốc.
- Resolve chính xác một connection từ Instagram account ID, kiểm tra trạng thái/subscription, rồi ghi nhận tin nhắn. Event lặp không tăng unread nhiều lần.
- Lưu customer, conversation và message theo quy ước hiện có; cập nhật snippet/unread và phát Socket event đúng owner, Workspace members và channel grant.
- Mọi API Inbox, tìm kiếm, lịch sử, thao tác hội thoại và Socket room/join tiếp tục dùng cùng workspace/channel access filter.
- Gửi văn bản qua Instagram Send API bằng token server-side, recipient IGSID và quyền hội thoại hiện hành. Kiểm tra điều kiện người dùng đã khởi tạo hội thoại, cửa sổ/giới hạn nhắn tin và chính sách Meta theo tài liệu hiện hành khi triển khai; lỗi policy phải trả mã lỗi ổn định, không retry vô hạn.
- Trước khi gửi phải kiểm tra quyền thành viên trên cặp `{ platform: "instagram", channelId: instagramUserId }`; tuyệt đối không tin channel ID/owner do client tự khai.

## Workspace và giao diện

- Bổ sung Instagram account vào `GET /api/v1/workspaces/:workspaceId/channels` từ connection đang hoạt động để quyền thành viên hiện có có thể cấp channel chính xác.
- Owner/Admin thấy các Instagram account trong Workspace; Staff chỉ thấy account được cấp. Ngắt kết nối loại channel khỏi directory và quyền hiệu lực.
- Modal kết nối hiện tại mở Instagram Login; trạng thái kết nối hiển thị username/tên, trạng thái lỗi và thao tác ngắt kết nối.
- Dashboard nhận danh sách Instagram connections để filter/chọn hội thoại; Inbox compose gửi văn bản qua luồng message service hiện có.
- Không hiển thị mục giả hoặc báo “đã kết nối” nếu OAuth, lưu token hoặc webhook subscription chưa xong.

## Bảo mật và vận hành

- OAuth state one-time, TTL, chống CSRF, redirect URI cố định allowlisted và bảo vệ chống callback lặp.
- Secrets chỉ ở backend config; dự kiến `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_GRAPH_API_VERSION` cùng encryption key hiện hành. Không đưa secret/token vào frontend hoặc changelog.
- Giới hạn thời gian/kích thước request ra Meta, che token khỏi log, kiểm tra chữ ký webhook, idempotency và retry có giới hạn.
- Cần cấu hình Meta App, Instagram Login, webhook fields/subscription, HTTPS callback/domain, test user/account và App Review/Advanced Access phù hợp trước khi nghiệm thu production.
- Migration index phải có preflight phát hiện bản ghi trùng, hỗ trợ chạy lại và fail an toàn; không tự chạy trên production. Chụp backup và xác minh rollback trước khi vận hành migration production.

## Ngoài phạm vi

- Facebook Login yêu cầu Page liên kết; Facebook Page publishing hiện có.
- Instagram publishing, comments, story/reactions, chatbot/AI auto reply, attachment, group DM, đồng bộ lịch sử cũ, phân tích marketing.
- Chuyển ownership Instagram giữa Workspace hoặc kết nối cùng Instagram account vào nhiều Workspace.

## Điều kiện nghiệm thu

- OAuth success, cancel, expired/replayed state, token/API error và account đã thuộc Workspace khác được xử lý đúng; secret không xuất hiện ở client/log.
- Nhiều Instagram accounts cùng Workspace được liệt kê riêng; kết nối độc lập với Facebook Page.
- Webhook signature sai/bad account bị từ chối; event lặp không tạo tin nhắn/conversation hoặc unread trùng.
- Nhiều khách nhắn cùng một Instagram account tạo các conversation riêng; index migration bảo toàn dữ liệu Facebook và các nền tảng khác.
- Tin nhắn mới hiện trong đúng Inbox và realtime; gửi text thành công, policy/Meta error có trạng thái rõ và không retry vô hạn.
- Staff không thể xem/gửi trên Instagram channel chưa được cấp; Owner/Admin và các grant hợp lệ hoạt động đúng qua REST lẫn Socket.
- Connect/disconnect history được ghi một lần, không chứa credential.
- Frontend hỗ trợ connect, loading/cancel/error, connected state, chọn/filter account, disconnect và state rỗng.
- Unit/integration tests, API typecheck, focused Web tests/build, toàn bộ kiểm tra bảo mật và migration preflight đạt. Live Meta acceptance chỉ thực hiện sau khi app config, quyền và test account sẵn sàng.

## Tài liệu Meta cần đối chiếu khi triển khai

- [Instagram API with Instagram Login — Meta Postman](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
- [Instagram API — Meta Postman](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Messenger Platform API for Instagram — Meta Postman](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a)

Các scope, payload webhook, quyền App Review, send policy và endpoint version phải được xác minh lại theo tài liệu Meta đang hiệu lực trước khi code/deploy; các đường dẫn trên là điểm bắt đầu nghiên cứu, không thay cho nghiệm thu tài khoản/app thực tế.
