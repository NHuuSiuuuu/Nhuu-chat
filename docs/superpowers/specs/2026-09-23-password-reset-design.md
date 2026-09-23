# Thiết kế: Quên và đặt lại mật khẩu

## Mục tiêu

Hoàn thiện luồng quên mật khẩu đã có giao diện tại `/forgot-password`: gửi liên kết qua Resend, cho phép đặt mật khẩu mới bằng token dùng một lần và làm mất hiệu lực refresh token đang lưu của tài khoản.

## Phạm vi

- Backend API gửi yêu cầu đặt lại mật khẩu và xác nhận mật khẩu mới.
- Bộ lưu token đặt lại mật khẩu riêng trong MongoDB; chỉ lưu digest của token.
- Gửi email qua Resend API.
- Frontend nối form quên mật khẩu hiện có và bổ sung trang `/reset-password`.
- Cấu hình môi trường, README, Wiki và CHANGELOG.

Không bao gồm thay đổi đăng ký/đăng nhập, chính sách mật khẩu ngoài yêu cầu tối thiểu 8 ký tự hiện tại, xác minh email, đổi email hoặc quản lý nhiều phiên refresh token. Hiện hệ thống chỉ giữ một `refreshTokenHash` trên mỗi user; đặt lại mật khẩu sẽ xóa giá trị này, qua đó thu hồi refresh token hiện hành.

## Luồng và API

### Yêu cầu email đặt lại

`POST /api/v1/auth/forgot-password` nhận `{ "email": string }`.

- Chuẩn hóa email giống đăng nhập: trim và chữ thường.
- Trả cùng mã trạng thái và thông báo chung dù tài khoản có tồn tại hay không.
- Với email có tài khoản, tạo token ngẫu nhiên mật mã, hết hạn sau 30 phút; một yêu cầu mới vô hiệu token cũ của cùng user.
- Gửi liên kết `${WEB_APP_URL}/reset-password?token=<raw-token>` bằng Resend.
- Thêm giới hạn tốc độ riêng cho endpoint này bên cạnh giới hạn chung của nhóm auth.
- Không ghi raw token, liên kết có token hoặc API key vào log.

### Đặt mật khẩu mới

`POST /api/v1/auth/reset-password` nhận `{ "token": string, "password": string }`.

- Mật khẩu phải đạt validation hiện hành: tối thiểu 8 ký tự.
- Token sai, hết hạn hoặc đã dùng trả lỗi chung, không tiết lộ trạng thái tài khoản.
- Xác thực và tiêu thụ token theo thao tác nguyên tử để hai request đồng thời không thể dùng cùng token.
- Khi thành công, cập nhật `passwordHash` bằng hàm băm hiện có và đặt `refreshTokenHash` thành `null`.
- Không tự đăng nhập người dùng sau khi đặt lại mật khẩu; họ đăng nhập lại bằng mật khẩu mới.

## Thành phần và dữ liệu

- Thêm model riêng `PasswordResetToken` với `userId`, `tokenHash`, `expiresAt`, `createdAt`; unique index trên `userId` bảo đảm tối đa một token hoạt động mỗi tài khoản, unique index trên `tokenHash`, và TTL index dọn bản ghi hết hạn. Việc xác thực thời hạn vẫn kiểm tra `expiresAt` trong truy vấn; TTL cleanup không được coi là cơ chế kiểm soát hết hạn.
- Hash token bằng SHA-256, phù hợp với token ngẫu nhiên entropy cao; raw token chỉ tồn tại trong request và nội dung email.
- Thêm service Resend dùng HTTP API, không thêm thư viện gửi email. Cấu hình bắt buộc khi bật luồng gửi: `RESEND_API_KEY` và `AUTH_EMAIL_FROM`; dùng `WEB_APP_URL` đã có để dựng liên kết.
- Nếu thiếu cấu hình gửi email hoặc Resend lỗi, ghi lỗi vận hành đã lọc dữ liệu nhạy cảm và trả lỗi server chung. Không giả lập thành công khi gửi thất bại.

## Frontend

- Form `/forgot-password` gọi API và luôn hiển thị thông báo xác nhận chung sau phản hồi thành công.
- Thêm route `/reset-password`; trang đọc token từ query string, có trường mật khẩu mới và xác nhận mật khẩu, hiển thị trạng thái token lỗi/hết hạn và thành công.
- Sau thành công, xóa token khỏi URL/lịch sử hiển thị và đưa người dùng về đăng nhập.
- Giữ nguyên cấu trúc, visual language và xác thực hiện tại; không thêm thay đổi UI khác ngoài luồng này.

## Bảo mật và lỗi

- Giới hạn tốc độ endpoint quên mật khẩu riêng để giảm lạm dụng.
- Câu trả lời của endpoint quên mật khẩu không phân biệt email có tài khoản.
- Không lưu token thô, không đưa token vào log và không đưa API key vào client.
- Token dùng một lần, hết hạn cứng sau 30 phút; token cũ bị thay thế khi có yêu cầu mới.
- Phản hồi reset cho token không hợp lệ/hết hạn/đã dùng có cùng thông điệp.
- Cấu hình Resend và địa chỉ gửi được mô tả trong `.env.example`, README và Wiki; không sửa file môi trường đang chứa secret.

## Tiêu chí nghiệm thu

1. Email hợp lệ đã đăng ký nhận email chứa liên kết reset; email không tồn tại nhận cùng response chung nhưng không gửi email.
2. Token được lưu dạng hash, hết hạn sau 30 phút, token mới thay token cũ và token chỉ đặt lại mật khẩu thành công một lần.
3. Dùng token thành công đổi được mật khẩu, thu hồi refresh token cũ, và đăng nhập lại bằng mật khẩu mới được.
4. Thiếu cấu hình Resend hoặc Resend lỗi không tạo phản hồi thành công giả; lỗi không làm lộ token hoặc secret.
5. Rate limit chặn gọi dồn endpoint quên mật khẩu.
6. Frontend xử lý gửi yêu cầu, xác nhận chung, reset thành công, mật khẩu xác nhận không khớp và token lỗi/hết hạn.
7. API focused/full tests, frontend focused tests, TypeScript/build phù hợp, formatter/linter và `git diff --check` được chạy; kết quả và mọi lỗi nền được ghi rõ.

## Quyết định đã duyệt

Email provider: Resend API, gọi trực tiếp qua HTTP, không thêm dependency gửi email.
