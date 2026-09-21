# Thiết kế chuyển xác thực sang HttpOnly cookie

## Mục tiêu

Loại bỏ việc lưu access token và refresh token trong `localStorage`, chuyển phiên đăng nhập sang cookie do backend phát hành để JavaScript phía trình duyệt không đọc được token. Sau khi reload, frontend vẫn khôi phục được phiên, refresh token vẫn được xoay vòng và logout phải thu hồi cookie ở server.

## Phạm vi

Trong phạm vi:

- API đăng ký, đăng nhập, refresh, session và logout.
- Middleware xác thực HTTP.
- CORS credentials và kiểm tra Origin cho request dùng cookie.
- Frontend bootstrap phiên, gọi API, refresh, logout và trạng thái protected route.
- Socket.IO xác thực bằng cookie khi không truyền bearer token từ JavaScript.
- Test backend/frontend, CHANGELOG và hướng dẫn cấu hình môi trường.

Ngoài phạm vi:

- Thay đổi schema người dùng hoặc cách hash mật khẩu.
- Thay đổi thời hạn JWT hiện tại: access 15 phút, refresh 7 ngày.
- Thay đổi quyền role, logic nghiệp vụ hoặc các connector kênh.
- Xóa ngay khả năng đọc Bearer token ở backend; cơ chế fallback được giữ trong giai đoạn chuyển đổi để không phá các client/test hiện có.

## Quyết định kiến trúc

### Cookie

Backend phát hành hai cookie chứa JWT theo tên cấu hình cố định:

- `nhuu_access_token`: HttpOnly, thời hạn 15 phút, `Path=/`.
- `nhuu_refresh_token`: HttpOnly, thời hạn 7 ngày, `Path=/`.

Cookie dùng `Secure=true` trong production và `Secure=false` ở development để chạy được trên HTTP localhost. `SameSite` được cấu hình bằng `AUTH_COOKIE_SAME_SITE`; mặc định là `lax` ở development và `none` ở production để hỗ trợ frontend/API khác origin. Khi `SameSite=none`, production bắt buộc `Secure=true`.

Cookie không đặt `Domain`, để trình duyệt giới hạn cookie cho host API. Frontend không đọc cookie bằng `document.cookie` và không nhận token trong JSON response.

### API contract

Các route auth có behavior sau:

| Route | Request | Response | Cookie behavior |
| --- | --- | --- | --- |
| `POST /api/v1/auth/register` | thông tin đăng ký | `{ user }` | set access + refresh |
| `POST /api/v1/auth/login` | email, password | `{ user }` | set access + refresh |
| `POST /api/v1/auth/session` | không có body | `{ user }` | xác thực access cookie |
| `POST /api/v1/auth/refresh` | không có body | `{ user }` | đọc refresh cookie, xoay và set lại hai cookie |
| `POST /api/v1/auth/logout` | không có body | `204` | clear access + refresh, thu hồi refresh hash nếu hợp lệ |

Access token cookie được ưu tiên trong middleware; nếu không có cookie thì middleware tiếp tục chấp nhận `Authorization: Bearer` để tương thích chuyển đổi. Refresh không nhận refresh token từ JSON nữa.

### Frontend session

`auth.store.ts` không còn đọc/ghi/xóa `nhuu-chat-auth` trong `localStorage`. Auth state chỉ chứa user và trạng thái bootstrap trong memory. Khi App khởi động:

1. Gọi `/api/v1/auth/session` với `credentials: "include"`.
2. Nếu thành công, lưu user vào React state và render protected app.
3. Nếu access cookie hết hạn, gọi `/api/v1/auth/refresh`; nếu refresh thành công thì gọi lại session.
4. Nếu cả hai thất bại, render AuthPage.

Mọi request frontend dùng `credentials: "include"`. `apiRequest` không tự thêm bearer token khi flow cookie được dùng; refresh callback chỉ gọi cookie refresh và trả về trạng thái thành công/thất bại, không trả token cho component.

### Socket.IO

Frontend tạo socket với `withCredentials: true` và không truyền access token trong `auth`. Backend Socket.IO đọc access cookie từ handshake headers, đồng thời giữ fallback `handshake.auth.token` cho client cũ. Socket chỉ kết nối sau khi session bootstrap thành công.

### CSRF và CORS

Cookie auth khiến browser tự gửi credential, nên backend phải kiểm tra `Origin` cho request có thể thay đổi dữ liệu (`POST`, `PUT`, `PATCH`, `DELETE`). Origin phải nằm trong `WEB_ALLOWED_ORIGINS`; request không có Origin được cho phép cho server-to-server/test hiện tại. CORS response luôn trả `Access-Control-Allow-Credentials: true` cho origin hợp lệ.

Không dùng `Access-Control-Allow-Origin: *` cùng credentials. Preflight phải cho phép `Content-Type`, `Authorization`, `X-Request-Id` và xử lý ổn định trước auth middleware.

## Luồng lỗi và tương thích

- Đăng nhập/đăng ký sai thông tin giữ nguyên mã lỗi hiện tại.
- Session/refresh thiếu hoặc hết hạn trả `401`; frontend xóa auth memory và hiển thị AuthPage.
- Logout luôn clear cookie, kể cả khi refresh cookie đã hết hạn; lỗi thu hồi token không làm logout phía client bị kẹt.
- Các test/backend client đang gửi Bearer tiếp tục hoạt động trong giai đoạn chuyển đổi.
- Không đưa token vào error message, log hoặc response JSON.

## Kiểm thử nghiệm thu

Backend:

- Login/register trả user và `Set-Cookie` HttpOnly, không trả access/refresh trong JSON.
- Session xác thực được bằng access cookie.
- Middleware nhận cookie và vẫn nhận Bearer fallback.
- Refresh xoay cookie, cập nhật refresh hash và từ chối replay cookie cũ.
- Logout clear cookie và revoke refresh session.
- Origin không thuộc allowlist bị từ chối ở request mutation; preflight origin hợp lệ vẫn hoạt động.
- Socket xác thực bằng cookie và giữ fallback auth token.

Frontend:

- Không còn `localStorage` auth key hoặc JSON token persistence.
- Login gọi `credentials: "include"` và chỉ lưu user memory.
- Reload bootstrap bằng session/refresh cookie.
- API retry sau `401` gọi refresh cookie và retry request một lần.
- Logout gọi endpoint cookie rồi xóa state.
- Socket được tạo với `withCredentials: true` mà không truyền token trong `auth`.

Verification cuối: test tập trung backend auth/realtime, test frontend App/API/auth, production build frontend và `git diff --check`.

## Rủi ro và giới hạn đã chấp nhận

- Production frontend và API phải cấu hình đúng `WEB_ALLOWED_ORIGINS`, HTTPS và `AUTH_COOKIE_SAME_SITE=none`; thiếu cấu hình này sẽ khiến browser không gửi cookie cross-origin.
- Fallback Bearer làm tăng bề mặt tương thích trong giai đoạn chuyển đổi; sẽ được xóa ở một task bảo mật riêng sau khi các client cũ được nâng cấp.
- Nếu triển khai nhiều API host, cookie bị giới hạn theo từng host API; mọi request phải đi cùng host đã phát hành cookie.
