# Phân quyền Workspace đa kênh

## Mục tiêu

Cho phép Chủ sở hữu Workspace cấp cho Nhân viên quyền vào một số kênh cụ thể thuộc cùng Workspace. Danh sách kênh và Inbox phải áp dụng cùng một quyền ở API; giao diện thêm thành viên nhóm kênh theo nền tảng.

## Quyết định

- Quyền có dạng `{ platform, channelId }`; ID chỉ duy nhất trong từng nền tảng. `allowedChannels: []` có nghĩa là không giới hạn.
- Owner và Admin Workspace có toàn quyền kênh. Staff bị giới hạn theo cặp platform/channelId đã chọn.
- `allowedPages` hiện tại được đọc như danh sách Facebook khi membership chưa có `allowedChannels`, và tiếp tục được cập nhật như projection các Page Facebook để tương thích API hiện hữu. Không xóa dữ liệu hay chạy migration sản xuất trong thay đổi này.
- Danh sách kênh Workspace gồm Facebook Page đã kết nối, các kênh dùng chung có hội thoại gắn `ownerId` Workspace và phiên Zalo/Telegram cá nhân đang kết nối của chủ Workspace.
- Kênh cá nhân được định danh quyền bằng `{ platform, channelId: ownerUserId }`, vì một phiên tài khoản nhận nhiều hội thoại có `channelId` riêng. ID tài khoản bên ngoài chỉ là thông tin hiển thị; không dùng làm khóa truy cập.
- Staff được gán phiên cá nhân chỉ xem các hội thoại có đúng `ownerId` Workspace và platform đó. Không chọn kênh nào vẫn là quyền tất cả kênh trong Workspace.
- API và Socket không trả credentials; khi staff gửi tin, backend kiểm tra quyền hội thoại trước rồi dùng client phiên của chủ Workspace. Các request không có Workspace vẫn yêu cầu chủ tài khoản phiên như trước. Quản lý phiên, đăng xuất và thao tác kết nối vẫn chỉ thuộc tài khoản chủ.
- Một filter helper chung tạo điều kiện Mongo cho các cặp được phép. API Inbox, object-level checks và Socket room join dùng cùng semantics. Request không có Workspace vẫn giữ quyền hiện tại.
- Endpoint `GET /api/v1/workspaces/:workspaceId/channels` chỉ liệt kê khi caller là thành viên Workspace; Staff chỉ nhận kênh họ được phép xem.
- Modal hiển thị checkbox theo nhóm nền tảng, icon/nhãn platform và gửi `allowedChannels`; bỏ chọn toàn bộ giữ semantics không giới hạn.

## Kiểm thử nghiệm thu

- Legacy `allowedPages` chỉ mở Facebook tương ứng; ID Facebook và Telegram trùng nhau không vượt quyền nền tảng.
- Owner/Admin và danh sách quyền rỗng thấy mọi kênh Workspace; Staff bị giới hạn đúng các cặp đã chọn.
- Shared-platform conversations trong Workspace hiển thị cho thành viên được phép; Workspace khác và channel khác bị chặn.
- Staff được cấp Zalo/Telegram cá nhân chỉ truy cập hội thoại theo Workspace owner và đúng platform; platform không được cấp hoặc Workspace khác bị chặn.
- Outbound Zalo/Telegram được gửi qua session owner sau khi kiểm tra quyền; request không có Workspace vẫn giữ owner-only.
- Realtime cá nhân fan-out tới owner/admin và staff có grant tương ứng, không dùng phòng admin toàn cục.
- API channel list xác thực membership và lọc theo quyền; membership update từ chối cặp kênh ngoài Workspace.
- UI nhóm kênh theo platform, hiển thị icon và submit payload cặp platform/channelId.
