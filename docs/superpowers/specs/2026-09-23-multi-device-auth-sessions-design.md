# Thiết kế: Phiên đăng nhập nhiều thiết bị

## Mục tiêu

Cho phép cùng một tài khoản duy trì nhiều phiên đăng nhập độc lập. Đăng nhập hoặc làm mới token ở một thiết bị không thu hồi token và kết nối Socket.IO của thiết bị khác. Đăng xuất chỉ thu hồi phiên đang dùng; đặt lại mật khẩu thu hồi toàn bộ phiên.

## Phạm vi

- Backend Express/MongoDB quản lý vòng đời phiên theo từng lần đăng nhập.
- Access token, refresh token, middleware xác thực HTTP và handshake Socket.IO nhận diện cùng một phiên.
- Giữ tương thích với refresh token đơn đang được lưu trong `User.refreshTokenHash` để lần triển khai đầu không buộc mọi người dùng đăng nhập lại.
- Kiểm thử tích hợp login, refresh, logout, đặt lại mật khẩu và Socket.IO.

Không thay đổi giao diện, không thêm API liệt kê/quản lý thiết bị, không thêm giới hạn số thiết bị, không đổi cookie/API contract hiện có và không đổi thời hạn token hiện tại (access 15 phút, refresh 7 ngày trượt theo lần refresh).

## Nguyên nhân hiện tại

`User` có một trường `refreshTokenHash`. Đăng ký và mỗi lần đăng nhập đều ghi đè trường này. Khi thiết bị B đăng nhập, refresh token của A không còn khớp. Sau khi access token A hết hạn, `/auth/refresh` trả 401; frontend xóa trạng thái đăng nhập và cleanup socket. Socket handshake hiện xác minh access JWT độc lập, nên login B không trực tiếp ngắt socket A.

## Thiết kế dữ liệu

Thêm collection/model `AuthSession` với các trường:

- `sessionId`: UUID duy nhất, không phải credential.
- `userId`: tham chiếu user sở hữu phiên, có index để thu hồi mọi phiên.
- `refreshTokenHash`: SHA-256 digest của refresh token hiện hành, không lưu token thô.
- `createdAt`, `lastUsedAt`, `expiresAt`.

Tạo unique index cho `sessionId`, index cho `userId` và TTL index cho `expiresAt`. Mọi truy vấn xác thực vẫn phải so sánh `expiresAt > now`; TTL monitor chỉ dọn dữ liệu, không quyết định token còn hạn hay không. Thời hạn là rolling: mỗi lần refresh thành công đặt `expiresAt` thành thời điểm hiện tại cộng 7 ngày.

Không lưu IP hoặc user-agent trong MVP vì chúng không cần cho cô lập/thu hồi phiên và có thể chứa dữ liệu nhận dạng không cần thiết.

## Token và xác thực

- Mỗi lần đăng ký hoặc đăng nhập tạo UUID `sessionId`, ký access/refresh JWT với claim phiên đó, và tạo `AuthSession` chứa hash refresh token trước khi phát cookie.
- Access JWT và refresh JWT có cùng `sessionId`; refresh token chỉ được chấp nhận khi session còn tồn tại, chưa hết hạn và digest khớp.
- Rotation dùng cập nhật có điều kiện theo `sessionId` và digest hiện hành để chỉ một request đồng thời có thể tiêu thụ token cũ. Request replay hoặc session đã bị thu hồi trả 401.
- Middleware HTTP và Socket.IO xác minh chữ ký, mục đích token và phiên còn hoạt động. Socket sau khi xác thực tham gia room nội bộ dành riêng cho `sessionId` và room của user để hỗ trợ thu hồi toàn bộ phiên.
- Giữ hỗ trợ Authorization Bearer. Access JWT legacy không có claim phiên vẫn được chấp nhận cho tới khi tự hết hạn (tối đa thời hạn access token hiện tại); token mới sau refresh luôn có claim phiên.

## Tương thích phiên cũ

Refresh JWT hiện hành không có `sessionId` và hash của nó nằm ở `User.refreshTokenHash`. Trong lần refresh đầu sau khi triển khai:

1. Backend xác minh JWT và kiểm tra digest khớp `User.refreshTokenHash`.
2. Trong transaction MongoDB, backend xóa có điều kiện hash legacy, tạo `AuthSession` riêng cho thiết bị đó, và phát cặp token mới gắn với `sessionId`.
3. Nếu token không khớp, hết hạn hoặc transaction không hoàn tất thì không phát cookie mới.

Login mới không xóa trường legacy; nhờ vậy một thiết bị cũ chưa refresh vẫn có thể chuyển phiên của nó mà không bị login từ thiết bị mới ghi đè. Sau khi chuyển đổi, `User.refreshTokenHash` được bỏ trống và không còn dùng cho phiên mới. Không cần chạy migration phá hủy dữ liệu trước deploy.

## Vòng đời và Socket.IO

- **Login/register:** tạo phiên mới; không sửa hay xóa phiên đang hoạt động khác của cùng user.
- **Refresh:** xoay hash và thời hạn của đúng session.
- **Logout:** với phiên mới, thu hồi đúng session được xác định bởi refresh cookie rồi yêu cầu Socket.IO ngắt room của session đó. Với refresh token legacy, backend chỉ thu hồi hash legacy và không ngắt room user (điều đó sẽ ảnh hưởng phiên mới trên thiết bị khác); client hiện tại xóa cookie và tự đóng socket. Access JWT legacy không liên kết được với refresh token nên một bản sao token vẫn có thể dùng tới khi hết hạn, tối đa 15 phút. Cookie vẫn được xóa như hiện tại kể cả khi refresh cookie thiếu/hết hạn.
- **Đặt lại mật khẩu:** trong transaction hiện có, cập nhật mật khẩu, xóa tất cả `AuthSession` của user và xóa hash legacy. Các HTTP request và handshake mới của phiên có claim `sessionId` bị từ chối; socket hiện hữu của user bị ngắt sau khi transaction thành công. Access JWT legacy không có `sessionId` không thể ánh xạ về phiên cũ nên còn hiệu lực tối đa đến hạn tự nhiên (15 phút).
- **Phiên khác:** giữ nguyên refresh token, access token và socket khi một thiết bị đăng nhập/refresh/logout trên thiết bị riêng.

Nếu socket chưa được nối adapter liên máy chủ, thao tác ngắt socket tác động các socket trên instance hiện tại. Khi hệ thống chạy nhiều API instance, Redis Socket.IO adapter hiện có phải được bật để lệnh ngắt phiên được phân phối giữa instance.

## API và cookie contract

Không đổi URL, method, body, response JSON, tên cookie hoặc thuộc tính cookie. Các route hiện hữu tiếp tục dùng:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/reset-password`

Không trả `sessionId`, token hoặc digest trong response public. Session ID chỉ nằm trong JWT đã ký và dữ liệu backend.

## Lỗi và bảo mật

- Chỉ lưu SHA-256 digest refresh token; token có entropy cao từ JWT ký bằng secret hiện tại.
- Dùng thao tác compare-and-swap khi rotate/revoke để tránh hai request cùng refresh tạo hai token hợp lệ.
- Không để logout của token cũ xóa một refresh token mới hơn trong cùng session.
- Chỉ disconnect socket sau khi thu hồi phiên đã commit thành công.
- Lỗi lưu session khi login/register/refresh không được phát cookie xác thực thành công.
- Không log cookie, JWT, hash hoặc dữ liệu phiên nhạy cảm.
- Giữ hành vi cookie clearing và thông báo lỗi công khai hiện có.

## Tiêu chí nghiệm thu

1. Đăng nhập hai lần cùng user tạo hai phiên; refresh thiết bị A và B độc lập, mỗi phiên chỉ xoay token của chính nó.
2. Login B không làm mất hiệu lực access/refresh token hoặc socket của A.
3. Logout A thu hồi refresh/session A và ngắt socket A; B vẫn xác thực, refresh và giữ socket.
4. Logout bằng refresh token legacy thu hồi hash legacy, client hiện tại đóng socket, không ngắt socket phiên mới của user khác và access JWT legacy hết hiệu lực tự nhiên trong tối đa 15 phút.
5. Replay refresh token cũ của một phiên bị từ chối mà không ảnh hưởng phiên khác.
6. Đặt lại mật khẩu thu hồi mọi session mới và refresh token legacy trong cùng transaction; access JWT legacy còn hiệu lực tối đa 15 phút, còn access JWT gắn session bị từ chối ngay.
7. Refresh legacy hợp lệ được nâng cấp an toàn đúng một lần; refresh replay và legacy token sai/hết hạn bị từ chối.
8. Bearer token legacy còn hạn giữ tương thích tới khi hết hạn; cookie/API contract không đổi.
9. Test tập trung và full backend suite, typecheck/lint theo cấu hình dự án, cùng `git diff --check` được chạy; lỗi nền ngoài phạm vi được ghi rõ.

## Giả định và giới hạn

- “Nhiều thiết bị” nghĩa là các thiết bị có cookie store riêng. Hai cửa sổ dùng chung cùng browser profile vẫn chia sẻ cookie như hiện tại và do đó là cùng một phiên.
- Không bổ sung màn hình xem/đặt tên/thu hồi thiết bị trong phạm vi backend này.
- Không thay đổi thời hạn access/refresh hiện tại hoặc cơ chế bearer compatibility.
- Khi chạy nhiều API instance, cần bật Redis adapter hiện có để logout/reset password ngắt socket trên toàn cụm.

## Quyết định đã duyệt

- Dùng collection `AuthSession` riêng, mỗi lần đăng nhập một bản ghi.
- Refresh và logout theo từng phiên; đặt lại mật khẩu thu hồi tất cả phiên.
- Giữ backend-only, không thêm UI/API quản lý danh sách thiết bị.
