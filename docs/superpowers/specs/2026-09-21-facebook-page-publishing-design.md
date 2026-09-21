# Đăng bài Facebook Page V1

## Mục tiêu

Cho phép mỗi tài khoản NhuuChat kết nối một Facebook Page bằng Page ID và Page Access Token thủ công, tạo bài viết gồm text và tối đa một ảnh, đăng ngay hoặc đặt lịch theo múi giờ Việt Nam.

## Phạm vi V1

- Một user chỉ có một kết nối Facebook Page.
- Kết nối thủ công bằng `pageId` và `pageAccessToken`; chưa triển khai OAuth Meta.
- Bài viết bắt buộc có text và có thể có tối đa một ảnh.
- Ảnh nhận từ `multipart/form-data`, loại `JPG`, `PNG` hoặc `WebP`, tối đa 5 MiB.
- Ảnh được upload qua Cloudinary hiện có; MongoDB chỉ lưu metadata và URL an toàn.
- Hỗ trợ đăng ngay, lưu nháp và đặt lịch.
- Múi giờ hiển thị/nhập cố định `Asia/Ho_Chi_Minh`; thời gian persistence dùng UTC.
- Worker kiểm tra bài đến hạn mỗi 30 giây.
- Nếu server tắt tại thời điểm đến hạn, bài vẫn ở `scheduled` và được đăng ngay sau khi worker khởi động lại.
- Hỗ trợ retry thủ công cho bài `failed`.
- Trạng thái bài: `draft`, `scheduled`, `publishing`, `published`, `failed`.

Không thuộc V1: OAuth/App Review, nhiều Page trong một user, nhiều ảnh, video, link preview, chỉnh sửa/xóa bài đã publish, lịch lặp, phân quyền nhóm nâng cao và calendar kéo-thả.

## Thiết kế được chọn

Tách ba trách nhiệm độc lập:

1. `FacebookPageConnection` lưu thông tin Page và token đã mã hóa.
2. `FacebookPost` lưu nội dung, lịch, media metadata và kết quả publish.
3. `FacebookPostPublisher` gọi Graph API; `FacebookPostScheduler` claim và chạy các bài đến hạn.

API không đưa Page Access Token hoặc ciphertext token về frontend. Token chỉ được giải mã trong memory ngay trước khi gọi Meta, không ghi log và không lưu localStorage/cookie trình duyệt.

Worker dùng cơ chế claim nguyên tử trên MongoDB: chỉ một tiến trình được chuyển bài từ `scheduled` sang `publishing`. Nếu tiến trình chết sau khi claim, bài `publishing` quá thời hạn lease được đưa lại vào hàng chờ để tránh bị kẹt vĩnh viễn. Việc publish phải lưu `publishedPostId` và kiểm tra trạng thái trước retry để giảm nguy cơ đăng trùng.

## Mô hình dữ liệu

### `FacebookPageConnection`

- `userId`: ObjectId, bắt buộc, index.
- `platform`: cố định `facebook` để giữ khả năng mở rộng connector.
- `pageId`: string, bắt buộc.
- `pageName`: string tùy chọn, lấy khi validate token.
- `encryptedPageAccessToken`: string, bắt buộc, `select: false`, dùng `encryptSecret`/`decryptSecret` hiện có.
- `status`: `connected` hoặc `invalid`.
- `lastValidatedAt`: Date tùy chọn.
- `lastErrorCode`: mã lỗi ổn định, không lưu access token hay lỗi Graph API nguyên văn.
- timestamps.

Tạo unique index `{ userId: 1 }` vì V1 chỉ cho một Page trên mỗi user. `pageId` vẫn được lưu để làm định danh channel và mở rộng sang nhiều Page sau này.

### `FacebookPost`

- `userId`: ObjectId, bắt buộc, index.
- `connectionId`: ObjectId tham chiếu `FacebookPageConnection`.
- `pageId`: snapshot Page ID để giữ lịch sử nếu connection bị thay thế.
- `message`: text bắt buộc, đã trim.
- `media`: object tùy chọn gồm `secureUrl`, `publicId`, `resourceType`, `mimeType`, `bytes`, `width`, `height`.
- `status`: enum trạng thái V1.
- `scheduledAt`: Date UTC; bắt buộc với `scheduled`, rỗng với draft/immediate đã hoàn tất.
- `timezone`: cố định `Asia/Ho_Chi_Minh` để giải thích thời gian hiển thị.
- `publishedPostId`: string tùy chọn.
- `attempts`: number, mặc định 0.
- `lastErrorCode`: mã lỗi ổn định.
- `lastErrorMessage`: thông báo an toàn cho UI, không chứa token hoặc response đầy đủ từ Meta.
- `publishingLeaseUntil`: Date tùy chọn.
- `publishedAt`: Date tùy chọn.
- timestamps.

Index scheduler `{ status: 1, scheduledAt: 1 }`; mọi query đều lọc `userId` từ auth khi truy cập API.

## Kết nối và kiểm tra Page

`POST /api/v1/facebook-page/connection` nhận `pageId` và `pageAccessToken` qua JSON HTTPS. Backend gọi một request xác thực tối thiểu tới Graph API để lấy Page metadata trước khi lưu. Nếu token không hợp lệ, thiếu quyền publish hoặc Page ID không khớp, API trả lỗi 400/422 ổn định và không lưu token.

`GET /api/v1/facebook-page/connection` chỉ trả `pageId`, `pageName`, `status`, `lastValidatedAt` và lỗi an toàn nếu có. `DELETE` xóa connection sau khi không còn bài đang `publishing`; các bài `draft`/`scheduled` liên quan chuyển sang `failed` với mã `FACEBOOK_CONNECTION_REMOVED` để không tự đăng bằng token cũ.

Biến môi trường Graph API dùng version cấu hình, ví dụ `META_GRAPH_API_VERSION`; không hardcode token, App Secret hoặc URL môi trường trong source.

## API bài viết

```text
GET    /api/v1/facebook-posts
GET    /api/v1/facebook-posts/:id
POST   /api/v1/facebook-posts
PATCH  /api/v1/facebook-posts/:id
POST   /api/v1/facebook-posts/:id/retry
DELETE /api/v1/facebook-posts/:id
```

`POST` và `PATCH` dùng `multipart/form-data` với:

- `message`: text bắt buộc, tối đa theo giới hạn Meta hiện hành.
- `publishMode`: `draft`, `now` hoặc `scheduled`.
- `scheduledAt`: chuỗi datetime-local theo `Asia/Ho_Chi_Minh`, bắt buộc khi `publishMode=scheduled` và phải ở tương lai khi tạo.
- `image`: file tùy chọn, chỉ một file.

Hành vi:

- `draft`: lưu nội dung và media, chưa gọi Graph API.
- `now`: tạo bản ghi rồi publish ngay; thành công trả `published`, lỗi trả bản ghi `failed` và mã lỗi an toàn.
- `scheduled`: lưu `scheduled`; worker sẽ publish khi `scheduledAt <= now`.
- `PATCH` chỉ cho phép sửa `draft` hoặc `scheduled`; không sửa `publishing`/`published`.
- `retry` chỉ nhận `failed`, xóa lỗi cũ, đưa bài về `scheduled` nếu có lịch tương lai hoặc publish ngay nếu người dùng yêu cầu retry now.
- `DELETE` hủy `draft`/`scheduled`; nếu có media chưa dùng, gọi cleanup Cloudinary best-effort.

## Cloudinary

Tái sử dụng `CloudinaryMediaService` hiện có và upload vào thư mục `nhuu-chat/facebook-posts/{userId}`. Kiểm tra MIME và byte size trước upload; không tin extension do client gửi. Nếu MongoDB ghi thất bại sau khi upload, gọi destroy để dọn asset mồ côi. Nếu publish thất bại, giữ media để retry; cleanup chỉ xảy ra khi user xóa bài hoặc bài bị hủy.

## Graph API publisher

Publisher nhận `{ pageId, decryptedPageAccessToken, message, mediaUrl }` và không để token đi qua controller/frontend. Với text, gọi endpoint feed của Page; với ảnh, gọi endpoint photo của Page kèm caption và URL Cloudinary. Graph API version lấy từ cấu hình.

Publisher chuẩn hóa lỗi thành các mã như `FACEBOOK_TOKEN_INVALID`, `FACEBOOK_PERMISSION_DENIED`, `FACEBOOK_PAGE_NOT_FOUND`, `FACEBOOK_RATE_LIMITED`, `FACEBOOK_MEDIA_REJECTED` và `FACEBOOK_PUBLISH_FAILED`. Response Graph API chi tiết chỉ được log ở dạng đã lọc request ID/mã lỗi, tuyệt đối không log access token.

## Scheduler và khôi phục

`FacebookPostScheduler` được khởi động cùng lifecycle API và có hàm `start()`/`stop()` để test không để lại timer. Mỗi 30 giây:

1. Tìm một bài `scheduled` có `scheduledAt <= now` hoặc bài `publishing` đã hết lease.
2. Claim bằng `findOneAndUpdate` có điều kiện status/lease.
3. Nạp connection cùng `userId`, giải mã token trong memory.
4. Gọi publisher.
5. Thành công: `published`, lưu `publishedPostId` và `publishedAt`.
6. Lỗi: `failed`, lưu mã lỗi an toàn và tăng `attempts`.

Worker xử lý tuần tự trong V1 để tránh đăng trùng và không tạo tải lớn. Việc claim nguyên tử vẫn cần dù hiện chỉ chạy một instance. Nếu Meta trả kết quả timeout sau khi có khả năng bài đã được tạo, không tự động retry mù; đánh dấu lỗi cần kiểm tra thủ công để tránh duplicate post.

## Frontend

Thêm khu vực `Đăng bài Facebook` trong Dashboard/Settings với:

- Form kết nối Page, chỉ hiển thị token dạng password.
- Form soạn bài text + preview một ảnh.
- Chọn `Đăng ngay`, `Lưu nháp` hoặc `Đặt lịch`.
- Hiển thị thời gian theo `Asia/Ho_Chi_Minh`.
- Danh sách bài với filter trạng thái và các nút sửa/hủy/thử lại phù hợp.
- Hiển thị lỗi an toàn, không render token hoặc raw Graph API response.

## Kiểm thử và nghiệm thu

- Schema/model: unique connection theo user, index scheduler, enum/status transitions.
- Cloudinary: MIME/size validation, upload metadata, cleanup khi persistence lỗi.
- Facebook publisher: text/photo request mapping, success, invalid token, permission, rate limit, timeout và không leak token.
- Connection API: auth, token validation, user isolation và response không chứa secret.
- Post API: draft/schedule/now, ownership, field validation, status transitions và retry.
- Scheduler: claim nguyên tử, publish bài đến hạn, khôi phục bài quá lease và xử lý server restart/missed schedule.
- Frontend: form, preview, timezone, status list và retry/error states.
- Chạy focused Vitest, TypeScript/build, `git diff --check`; integration thật với Graph API chỉ thực hiện khi có Page test và token hợp lệ, không commit token.

## Giới hạn vận hành

- V1 cần cấu hình Cloudinary và Page Access Token hợp lệ ở backend.
- Token thủ công có thể hết hạn/revoke; UI phải cho phép cập nhật lại connection.
- Development Mode của Meta chỉ phù hợp test với tài khoản/Page đủ vai trò; production users vẫn phụ thuộc quyền Meta.
- Worker 30 giây không đảm bảo đăng đúng từng giây; bài được xử lý ở lần polling kế tiếp.
