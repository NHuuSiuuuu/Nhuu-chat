# Instagram Inbox

## Phạm vi

Instagram Login kết nối trực tiếp tài khoản Instagram Professional Business hoặc Creator; không cần nối Facebook Page. Inbox hiện nhận và gửi tin nhắn Direct một-một dạng văn bản. Media, group chat và chatbot trên Instagram chưa được hỗ trợ. Mỗi Instagram user ID thuộc duy nhất một Workspace. Owner/admin thấy các tài khoản đã kết nối; Staff phụ thuộc quyền `{ platform: "instagram", channelId: instagramUserId }`. Ngắt account thu hồi quyền Staff chính xác account đó, kể cả với grant rỗng mang nghĩa không giới hạn; kết nối lại cùng account gỡ deny entry để grant đã lưu có hiệu lực lại.

## Cấu hình backend

Sao chép các biến này vào môi trường API (không đưa app secret, verify token hoặc credential vào frontend):

```dotenv
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_OAUTH_REDIRECT_URI=https://<api-domain>/api/v1/instagram/oauth/callback
INSTAGRAM_GRAPH_API_VERSION=v26.0
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
WEB_APP_URL=https://<web-domain>
```

`INSTAGRAM_WEBHOOK_VERIFY_TOKEN` có thể dùng chung `META_WEBHOOK_VERIFY_TOKEN` nếu biến riêng không đặt. OAuth state dùng Redis và có thời hạn; callback phải trùng tuyệt đối với URI đăng ký trong Meta app. Access token được mã hóa server-side và không xuất hiện trong API response, app log, browser storage, history hay Socket payload.

## Meta Developer app

1. Tạo/bật Instagram Login cho app và thiết lập Instagram Business Login.
2. Đăng ký OAuth redirect URI tương ứng với `INSTAGRAM_OAUTH_REDIRECT_URI`.
3. Yêu cầu `instagram_business_basic` và `instagram_business_manage_messages` theo chế độ/app access cần dùng.
4. Đăng ký webhook URL `https://<api-domain>/api/v1/webhooks/instagram`, verify token khớp backend, Instagram object và field `messages`.
5. Mỗi tài khoản professional được kết nối sẽ subscribe tới trường `messages`; backend xác minh chữ ký POST bằng raw body và `INSTAGRAM_APP_SECRET`.
6. Trong Development Mode, chỉ app roles/test accounts phù hợp mới đăng nhập được. Mở cho user ngoài test cần hoàn tất quyền/access review và kiểm thử theo chính sách Meta.

Các tên scope mới, yêu cầu tài khoản professional không cần Facebook Page liên kết và endpoint gửi tin được đối chiếu với [Instagram API collection do Meta xuất bản trên Postman](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00). Hành vi với app thực tế vẫn phải nghiệm thu ở staging.

Các luồng live hiện chưa được nghiệm thu với Meta app: callback scope/access, webhook app-secret variant, subscription response/payload thật, token refresh và Send API policy/error mapping. Tài liệu triển khai vì vậy không thay thế staging acceptance. Meta có thể cập nhật scope, endpoint/version, hạn mức và điều kiện nhắn tin; xác nhận lại tài liệu chính thức trước phát hành.

## API và giao diện

- `GET /api/v1/instagram/oauth/start`: khởi tạo Instagram Login cho Workspace đang chọn.
- `GET /api/v1/instagram/oauth/callback`: xác minh state, lưu kết nối và trả về Dashboard.
- `GET /api/v1/instagram/connections`: danh sách safe profile metadata trong phạm vi Workspace.
- `DELETE /api/v1/instagram/connections/:connectionId`: ngắt đúng kết nối của owner Workspace.
- `GET /api/v1/webhooks/instagram`: Meta webhook challenge.
- `POST /api/v1/webhooks/instagram`: xác minh chữ ký và xử lý inbound.
- `POST /api/v1/messages/send`: gửi text cho một cuộc hội thoại Instagram mà user có quyền truy cập.

Modal kết nối tải lại danh sách từ API sau OAuth và chỉ báo thành công khi thấy đúng `instagram_user_id` vừa được callback xác nhận. Composer cho Instagram là text-only; upload/attachment actions bị khóa có giải thích.

History lưu metadata connect/disconnect một lần cho mỗi thay đổi hiệu lực; không lưu token. Realtime conversation/message vẫn đi qua quyền Workspace hiện hành. Ngắt account đánh dấu deny chính xác channel trên các membership Staff và ngắt socket Staff đang cache quyền cũ. Các API và reconnect socket kiểm tra lại quyền.

## Database rollout

Migration index Instagram không chạy ở startup. Nó preflight duplicate `(platform, channelId, ownerId, customerId)` trước khi tạo partial unique index Instagram/Zalo/Telegram rồi bỏ index non-Facebook cũ. Nếu phát hiện duplicate, script in IDs và dừng mà không xóa dữ liệu. Script sửa index thật, không có chế độ dry-run riêng; cần có backup/restore đã kiểm chứng và maintenance plan trước khi chạy với URI database.

```bash
MONGODB_URI='mongodb+srv://…' pnpm --filter api run migrate:instagram-conversation-customer-index
```

Trước rollout, kiểm tra các migration/index trước đó của môi trường, snapshot dữ liệu và ghi lại index hiện có. Chạy migration trên bản sao cô lập trước; xử lý duplicate report thủ công rồi mới lập lịch production. Không deploy code/schema yêu cầu index mới trước khi thứ tự migration đã được duyệt. Chưa áp dụng migration production trong lần triển khai tính năng này.

## Local verification và nghiệm thu

Local tests/build kiểm tra hợp đồng OAuth/webhook/send, Workspace authorization, lifecycle/history, realtime và giao diện, nhưng không chứng minh Meta app đã cấp quyền hoặc gửi sự kiện thật. Trước release, staging cần xác nhận tuần tự: connect → inbound DM → Staff grant/revoke → realtime → text reply → history → disconnect → reconnect. Kiểm thử timeout/duplicate webhook và xác minh không account nào khác bị ảnh hưởng. Production backup, migration, deploy, rollback và Meta approval là các bước vận hành riêng.
