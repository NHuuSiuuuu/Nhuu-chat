# Nhật ký công việc 10 tuần — Nhuu-chat

> **Quan trọng:** Repository không cung cấp ngày bắt đầu/kết thúc kỳ thực tập hoặc nhật ký đã được đơn vị xác nhận. Bảng dưới đây là **lộ trình mẫu 10 tuần**, suy ra từ phạm vi và kiến trúc của source theo yêu cầu lập báo cáo; không phải bằng chứng lịch sử rằng các hoạt động đã diễn ra đúng tuần này. Hãy thay thời gian, nội dung và kết quả bằng nhật ký thực tế trước khi nộp.

| Tuần | Thời gian | Nội dung công việc | Kết quả đạt được |
|---:|---|---|---|
| 1 | `[Ngày bắt đầu – ngày kết thúc]` | Tìm hiểu bài toán chăm sóc khách hàng đa kênh; khảo sát cách shop tiếp nhận tin từ Facebook, Telegram và các kênh liên quan; đọc README, PRD/SRS; xác định actor, phạm vi MVP và yêu cầu bảo mật. | Hoàn thiện bản mô tả bài toán, nhóm yêu cầu chức năng/phi chức năng và sơ đồ actor. Cần bổ sung biên bản/ghi chú khảo sát thực tế nếu có. |
| 2 | `[Ngày bắt đầu – ngày kết thúc]` | Khởi tạo/đọc cấu trúc workspace pnpm; tìm hiểu React/Vite/Tailwind ở frontend, Express/TypeScript ở backend; cấu hình môi trường local, MongoDB Atlas và Redis nếu dùng. | Nắm được luồng chạy web/API và các biến môi trường cần thiết; lập danh sách module và rủi ro cấu hình. Kết quả thực tế cần đính kèm lệnh chạy hoặc ảnh môi trường đã che secret. |
| 3 | `[Ngày bắt đầu – ngày kết thúc]` | Phân tích mô hình dữ liệu MongoDB/Mongoose: User, AuthSession, Workspace, WorkspaceMember, Conversation và Message; xem xét index và quan hệ owner/channel. | Có sơ đồ collection và giải thích vì sao session nhiều thiết bị được tách khỏi User; xác định `allowedPages` là tương thích cũ trong membership, còn `allowedChannels` là biểu diễn đa kênh tổng quát. |
| 4 | `[Ngày bắt đầu – ngày kết thúc]` | Phân tích luồng đăng ký/đăng nhập, cookie HttpOnly, access/refresh token, ProtectedRoute và API session bootstrap; kiểm tra logout/reset mật khẩu theo phiên. | Có sequence diagram Auth; xác định cách tạo/revoke phiên riêng theo lần đăng nhập. Ghi kết quả test auth thực tế, không suy ra từ sơ đồ. |
| 5 | `[Ngày bắt đầu – ngày kết thúc]` | Xây dựng hoặc rà soát UI nền: route public/private, Dashboard, Inbox, Settings; thống nhất component và trạng thái loading/error/empty. | Các màn hình chính được liên kết với route phù hợp; có quy tắc điều hướng private và hành vi responsive ban đầu. Ghi rõ phần cá nhân trực tiếp thực hiện. |
| 6 | `[Ngày bắt đầu – ngày kết thúc]` | Phân tích và triển khai API phân quyền Workspace; kiểm tra membership, owner/admin/staff; lọc channel directory, conversation query và các thao tác liên quan. | Quyền được xây từ WorkspaceMember và owner scope thay vì hardcode Page trong frontend; tạo ca kiểm thử cho phép/từ chối. Đính kèm kết quả test ở commit được đánh giá. |
| 7 | `[Ngày bắt đầu – ngày kết thúc]` | Hoàn thiện modal quản lý thành viên và phân quyền đa kênh; gom danh sách theo platform; xử lý trạng thái thêm/sửa/xóa và bảo vệ owner trên UI/API. | Modal thể hiện channel theo nền tảng, vai trò và phạm vi quyền; owner không có điều khiển sửa/xóa; kiểm tra responsive và lỗi API. Không coi UI là biện pháp bảo vệ duy nhất. |
| 8 | `[Ngày bắt đầu – ngày kết thúc]` | Tích hợp/kiểm tra luồng realtime Socket.IO: handshake xác thực, chọn Workspace, room Inbox/conversation, nhận event và reconnect; kiểm tra recipient permission. | Client nhận event phù hợp với channel access; socket join được kiểm tra quyền. Ghi riêng test cục bộ, test nhiều process/Redis và kiểm thử provider live vì đây là mức xác nhận khác nhau. |
| 9 | `[Ngày bắt đầu – ngày kết thúc]` | Tối ưu trải nghiệm mobile: lưu route/conversation/tab trên URL, lưu trạng thái tạm bằng sessionStorage, chuyển Workspace không hard reload, điều chỉnh form tránh auto zoom. | Khi reload hoặc khôi phục tab, ứng dụng có thể phục hồi ngữ cảnh từ URL/storage rồi xác minh lại dữ liệu qua API; không tuyên bố có thể ngăn browser kill tab. Ghi thiết bị/trình duyệt dùng thử. |
| 10 | `[Ngày bắt đầu – ngày kết thúc]` | Chạy regression test, typecheck/build, rà quyền REST/Socket, `git diff --check`; hoàn thiện tài liệu, ảnh minh họa, hướng dẫn triển khai và báo cáo. | Bộ hồ sơ có kết quả kiểm chứng đúng phiên bản, danh sách giới hạn và hướng dẫn chạy. Migration production/live chỉ ghi nhận hoàn thành nếu có phê duyệt, backup và log vận hành thực tế. |

## Hướng dẫn thay bằng nhật ký thực tế

1. Điền mốc thời gian cho từng tuần theo hồ sơ thực tập.
2. Tách việc cá nhân khỏi việc nhóm/việc có sẵn trong repository.
3. Gắn mỗi kết quả với bằng chứng: commit, test log, ảnh đã khử dữ liệu nhạy cảm hoặc xác nhận của người hướng dẫn.
4. Ghi trung thực các tuần không triển khai hoặc bị chặn; không tự tạo số liệu hiệu suất.
5. Nếu tiến độ thực tế không theo thứ tự trên, đổi tuần/nội dung cho đúng, giữ lại cột kết quả có thể kiểm chứng.
