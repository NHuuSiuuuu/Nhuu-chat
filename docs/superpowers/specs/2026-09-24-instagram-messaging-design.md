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
3. Chuyển hướng đến Instagram OAuth với `response_type=code`, redirect URI đã đăng ký và scope tối thiểu `instagram_business_basic` + `instagram_business_manage_messages`.
4. Callback đổi authorization code tại `api.instagram.com/oauth/access_token`, sau đó đổi short-lived token sang long-lived token bằng Instagram Graph API; lưu ngày hết hạn và refresh token khi còn hợp lệ.
5. Lấy Instagram professional account ID và hồ sơ bằng API Instagram Login. Kiểm tra lại field names với tài liệu hiện hành; không lấy nhầm Facebook Page ID hoặc nhầm `id` với `user_id`.
6. Token được mã hóa lúc lưu. API, log, response và Socket không được trả token hoặc authorization code.
7. Đăng ký `messages` webhook cho object `instagram` ở App Dashboard và subscribe từng account qua `graph.instagram.com/{version}/{ig-user-id}/subscribed_apps`. Nếu subscription thất bại, không báo kết nối hoàn tất; lưu trạng thái lỗi có thể khôi phục để retry an toàn.
8. Frontend cập nhật danh sách kết nối và channel picker. Redirect/callback không được xem là thành công trước khi backend lưu connection.

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

- Webhook xác minh challenge (`hub.mode`, verify token, trả `hub.challenge`) và kiểm tra `X-Hub-Signature-256` trên raw body. Payload chuẩn có `object="instagram"`, `entry[]` và `messaging[]`; parser phải chấp nhận batches hợp lệ và xử lý riêng inbound với echo (`message.is_echo`). Dùng app secret theo contract Meta đã kiểm nghiệm; tài liệu công khai không chỉ rõ đầy đủ biến thể app secret nào được dùng.
- Resolve chính xác một connection từ Instagram account ID, kiểm tra trạng thái/subscription, rồi ghi nhận tin nhắn. Event lặp không tăng unread nhiều lần.
- Lưu customer, conversation và message theo quy ước hiện có; cập nhật snippet/unread và phát Socket event đúng owner, Workspace members và channel grant.
- Mọi API Inbox, tìm kiếm, lịch sử, thao tác hội thoại và Socket room/join tiếp tục dùng cùng workspace/channel access filter.
- Gửi văn bản qua `POST graph.instagram.com/{version}/{ig-user-id}/messages` bằng token server-side và recipient IGSID. Recipient phải nhắn Professional account trước; standard response window là 24 giờ và text tối đa 1000 UTF-8 bytes theo tài liệu đang được dùng. Lỗi policy phải trả mã lỗi ổn định, không retry vô hạn.
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

- [Instagram Login OAuth and setup — Meta Developers](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login.md)
- [Instagram Messaging API — Meta Developers](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api.md)
- [Instagram Webhooks — Meta Developers](https://developers.facebook.com/documentation/instagram-platform/webhooks.md)
- [Instagram Webhook examples — Meta Developers](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples.md)
- [Instagram account and customer profile — Meta Developers](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile.md)
- [Instagram API with Instagram Login — Meta Postman](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)

Meta có điểm không nhất quán giữa webhook examples về bọc payload gốc; triển khai theo object payload cụ thể `{ object: "instagram", entry: [...] }` và chấp nhận batching `entry[]`/`messaging[]`. Tài liệu cũng chưa chỉ rõ app secret variant cần dùng cho signature; cần xác minh bằng test app thật. Kiểm tra lại version, scope, quyền Advanced Access/App Review, webhook contract và messaging policy trước deploy; tài liệu không thay nghiệm thu app/account thực tế.
