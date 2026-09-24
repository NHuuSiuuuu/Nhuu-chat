# Phân quyền thành viên Workspace theo Facebook Page

## Mục tiêu

Cho phép chủ Workspace thêm tài khoản NhuuChat đã đăng ký làm Quản trị viên hoặc Nhân viên, giới hạn Page mà Nhân viên được truy cập, và kết nối nhiều Facebook Page trong cùng Workspace. Thành viên làm việc trên dữ liệu của Workspace chủ sở hữu; các dữ liệu cũ và quyền hệ thống hiện tại tiếp tục hoạt động.

## Quyết định kiến trúc

- Giữ `User.role` hiện có (`admin`, `agent`, `customer`) làm quyền cấp hệ thống để không làm đổi các kiểm tra quyền hiện hữu. Vai trò Workspace là trường riêng (`owner`, `admin`, `staff`) trên quan hệ thành viên.
- Một tài khoản có thể là owner của Workspace riêng và là thành viên trong các Workspace khác. Tạo tài khoản mới vẫn có `User.role = customer`; Workspace do tài khoản tạo được khởi tạo với membership `owner`. Tài khoản hiện hữu được bootstrap thành owner Workspace riêng, giữ nguyên `ownerId` của dữ liệu hiện tại.
- Workspace có một chủ sở hữu không thể sửa/xóa qua API thành viên. Admin và Staff có thể được quản lý theo quyền của chủ Workspace; chỉ email đã đăng ký mới được thêm. Việc thêm user đang thuộc Workspace khác không thay đổi các membership hoặc dữ liệu hiện tại của user đó.
- `allowedPages: []` nghĩa là không giới hạn Page. Danh sách Page không rỗng giới hạn Staff đúng các Page trong danh sách. Admin và Owner có quyền trên tất cả Page trong Workspace.
- Facebook Page connection thuộc Workspace (giữ `userId` hiện tại làm định danh chủ dữ liệu để tương thích), có nhiều connection trên một `userId`; mỗi `pageId` vẫn chỉ thuộc một Workspace. Token tiếp tục mã hóa tại backend.
- Workspace đang hoạt động được gửi rõ trong request Facebook và handshake Socket.IO, rồi được backend xác thực theo membership của user. API/Socket phân giải membership thành Workspace owner trước khi truy vấn; quyền Page được kiểm tra phía server. Không dựa vào bộ lọc UI để bảo vệ dữ liệu.
- Phạm vi RBAC của thay đổi này là Facebook Page connections, Facebook Inbox, Facebook Publishing và quản lý thành viên Workspace. Các module Telegram, AI, cài đặt cá nhân và dữ liệu ngoài Facebook tiếp tục dùng owner scope hiện tại.

## Dữ liệu và di trú

- Thêm model Workspace và WorkspaceMember hoặc quan hệ tương đương, với `workspaceId`, `userId`, `role`, `allowedPages`; unique index trên cặp `workspaceId + userId` cho phép một user có nhiều membership, và mỗi Workspace chỉ có một owner.
- Mọi tài khoản hiện hữu được cấp Workspace riêng và owner membership trước khi API mới được bật. Migration phải idempotent, có chế độ báo cáo trước khi ghi, giữ nguyên `ownerId` hiện tại và có kiểm tra số lượng/đối chiếu sau migration.
- Không đổi enum `User.role`, không bỏ `aiSettings`, `generalSettings` hay các trường User hiện hữu.
- Gỡ unique index `FacebookPageConnection.userId`; giữ unique index `pageId`. Migration kiểm tra trùng `userId`/`pageId` và dừng an toàn nếu dữ liệu không thể chuyển tự động.

## Quản lý thành viên

- API danh sách thành viên trả email, vai trò Workspace và `allowedPages`.
- API dùng `GET /api/v1/workspaces` để liệt kê membership; `GET/POST /api/v1/workspaces/:workspaceId/members` để xem/thêm; `PATCH/DELETE /api/v1/workspaces/:workspaceId/members/:userId` để cập nhật/xóa. Chỉ owner được quản lý membership.
- API danh sách Workspace trả các Workspace user tham gia và role tương ứng; UI cho phép chọn Workspace Facebook đang thao tác. Không thay đổi Workspace mặc định cho module cá nhân.
- API thêm/cập nhật nhận `email`, `role` (`admin` hoặc `staff`) và `allowedPages`. Email chưa tồn tại trả HTTP 400 với thông báo `Tài khoản không tồn tại, yêu cầu đăng ký trước`.
- Chỉ owner Workspace được thêm, sửa hoặc xóa thành viên. Không thể chuyển quyền owner, sửa/xóa owner hoặc tự nâng quyền.
- Mọi Page trong `allowedPages` phải là Page connection thuộc Workspace; dữ liệu sai hoặc Page thuộc Workspace khác bị từ chối.
- Frontend có danh sách thành viên và modal thêm/sửa: email, role Quản trị viên/Nhân viên, checkbox Page hiện có; ghi chú rằng bỏ chọn toàn bộ có nghĩa là không giới hạn. Owner hiện nhãn “Chủ sở hữu” và không có thao tác sửa/xóa. Nhân viên có giới hạn Page thấy nhãn số Page được chọn.
- Request của Facebook API gửi Workspace ID đã chọn trong `X-Workspace-Id`; server yêu cầu membership đang hoạt động trước khi đọc/ghi. Khi header vắng mặt, tài khoản chỉ truy cập Workspace mình sở hữu; Workspace ID từ client không được xem là bằng chứng quyền.

## Kết nối nhiều Facebook Page

- OAuth vẫn chọn Page trong danh sách Meta; selection token được ràng buộc với user và Workspace bắt đầu luồng. Mỗi lựa chọn tạo/cập nhật connection theo `pageId` mà không ghi đè các Page khác của Workspace.
- Thêm `GET /api/v1/facebook-page/connections` để lấy Page đã kết nối và `DELETE /api/v1/facebook-page/connections/:pageId` để gỡ riêng một Page. Endpoint singular hiện có tiếp tục hoạt động với Page đầu tiên để tương thích.
- Webhook resolve chính xác connection theo Page ID; Page ID tiếp tục duy nhất toàn hệ thống và không fan-out.
- Facebook Publishing chọn Page đích rõ ràng, gắn post/schedule với đúng connection và chỉ liệt kê/quản lý bài thuộc Page thành viên được phép.
- Inbox và Publishing mặc định chỉ trả các Page được thành viên phép xem. Bộ lọc Page, số liệu, tìm kiếm, lịch sử, gửi tin, đăng bài và thao tác hội thoại đều phải dùng cùng access filter.

## Cô lập và realtime

- Hội thoại và customer giữ `ownerId` là chủ Workspace để tương thích dữ liệu cũ; Facebook request của thành viên được truy vấn trong phạm vi `ownerId` đó và Page được phép. Quy tắc này chỉ áp dụng cho Facebook scope; không đổi truy vấn của module khác.
- Mọi Facebook endpoint có `conversationId`, `customerId`, `postId`, `connectionId`, `pageId` hoặc `channelId` phải xác minh tài nguyên thuộc Workspace/Page được phép trước khi đọc hay ghi.
- Socket.IO handshake nhận Workspace ID đang chọn và server xác minh membership trước khi join. Sự kiện Messenger được phát cho owner/admin và các thành viên có quyền với Page tương ứng; không phát dữ liệu khách hàng hoặc nội dung tin nhắn cho thành viên không được phép. Workspace switch tạo socket context mới.
- Tác vụ nền và webhook giữ owner scope; không tin owner ID từ client hoặc payload Meta.
- Không đổi hành vi bot, assignment, pause, trạng thái tin nhắn và thiết lập cá nhân ngoài việc áp dụng quyền truy cập.

## Giao diện và phản hồi lỗi

- Trang thành viên hiển thị Chủ sở hữu, Quản trị viên, Nhân viên; owner không có nút sửa/xóa.
- Modal responsive, checkbox và nút có cursor tương tác; thông báo submit dùng Sonner.
- API trả lỗi an toàn, nhất quán khi email chưa đăng ký, membership xung đột, role không hợp lệ, Page ngoài Workspace hoặc người gọi không đủ quyền. Không đưa access token vào response/log.

## Kiểm thử và nghiệm thu

- Unit/integration: bootstrap Workspace cũ idempotent; tài khoản mới thành customer rồi thành owner Workspace; thêm thành viên đã đăng ký; từ chối email chưa tồn tại, membership Workspace khác và sửa/xóa owner.
- Page access: admin/owner thấy mọi Page; staff với `allowedPages` rỗng thấy mọi Page; staff có danh sách chỉ thấy đúng Page được cấp; không thể truy cập bằng ID Page/conversation/customer ngoài quyền.
- Facebook connections: một Workspace kết nối nhiều Page; Page trùng Workspace khác bị từ chối; cập nhật/gỡ một Page không tác động connection khác; OAuth selection giữ đúng Workspace.
- Inbox/Publishing/realtime: lọc Page áp dụng cho list, detail, send, search, counts, create/edit/schedule/publish và socket recipients; webhook route đúng Workspace theo Page ID.
- Migration được chạy trên fixture nhiều tài khoản cũ, chạy lặp không đổi kết quả, phát hiện dữ liệu xung đột mà không làm mất/ghi đè dữ liệu.
- Chạy test focused, suite/build liên quan auth/database/API/realtime, lint file sửa và `git diff --check`.

## Ngoài phạm vi

- Vai trò tùy biến hoặc quyền nhỏ hơn theo thao tác (chỉ đọc, chỉ trả lời, chỉ xem báo cáo).
- Chia sẻ Page giữa nhiều Workspace.
- Thay đổi `User.role` hệ thống hoặc các chính sách chatbot ngoài quyền truy cập cần thiết.
- Áp dụng RBAC Workspace cho Telegram, AI, cài đặt cá nhân hoặc các module ngoài Facebook Inbox.
- Production migration/deploy; cần kế hoạch backup, chạy thử, rollback và xác nhận vận hành riêng.
