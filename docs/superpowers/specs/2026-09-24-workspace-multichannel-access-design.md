# Phân quyền Workspace đa kênh

## Mục tiêu

Cho phép Chủ sở hữu Workspace cấp cho Nhân viên quyền vào một số kênh cụ thể thuộc cùng Workspace. Danh sách kênh và Inbox phải áp dụng cùng một quyền ở API; giao diện thêm thành viên nhóm kênh theo nền tảng.

## Quyết định

- Quyền có dạng `{ platform, channelId }`; ID chỉ duy nhất trong từng nền tảng. `allowedChannels: []` có nghĩa là không giới hạn.
- Owner và Admin Workspace có toàn quyền kênh. Staff bị giới hạn theo cặp platform/channelId đã chọn.
- `allowedPages` hiện tại được đọc như danh sách Facebook khi membership chưa có `allowedChannels`, và tiếp tục được cập nhật như projection các Page Facebook để tương thích API hiện hữu. Không xóa dữ liệu hay chạy migration sản xuất trong thay đổi này.
- Danh sách kênh Workspace gồm Facebook Page đã kết nối và các kênh không cá nhân có hội thoại gắn `ownerId` của Workspace (`facebook`, `instagram`, `zalo`, `telegram`). Kênh chưa có integration/record hoạt động sẽ không xuất hiện.
- `zalo_personal` và `telegram_personal` tiếp tục owner/assignment-scoped, không được đưa vào danh sách cấp quyền Workspace.
- Một filter helper chung tạo điều kiện Mongo cho các cặp được phép. API Inbox, object-level checks và Socket room join dùng cùng semantics. Request không có Workspace vẫn giữ quyền hiện tại.
- Endpoint `GET /api/v1/workspaces/:workspaceId/channels` chỉ liệt kê khi caller là thành viên Workspace; Staff chỉ nhận kênh họ được phép xem.
- Modal hiển thị checkbox theo nhóm nền tảng, icon/nhãn platform và gửi `allowedChannels`; bỏ chọn toàn bộ giữ semantics không giới hạn.

## Kiểm thử nghiệm thu

- Legacy `allowedPages` chỉ mở Facebook tương ứng; ID Facebook và Telegram trùng nhau không vượt quyền nền tảng.
- Owner/Admin và danh sách quyền rỗng thấy mọi kênh Workspace; Staff bị giới hạn đúng các cặp đã chọn.
- Shared-platform conversations trong Workspace hiển thị cho thành viên được phép; Workspace khác và channel khác bị chặn.
- Hội thoại Zalo/Telegram cá nhân giữ nguyên owner/assignment access.
- API channel list xác thực membership và lọc theo quyền; membership update từ chối cặp kênh ngoài Workspace.
- UI nhóm kênh theo platform, hiển thị icon và submit payload cặp platform/channelId.
