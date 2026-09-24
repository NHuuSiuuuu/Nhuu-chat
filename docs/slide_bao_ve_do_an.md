# Kịch bản slide bảo vệ đồ án Nhuu-chat

> Dàn ý dưới đây gồm 18 slide, phù hợp bài trình bày khoảng 12–18 phút. Thay placeholder bằng thông tin thật; mọi ảnh chụp cần loại bỏ token, email khách hàng và dữ liệu nhận diện. Chỉ trình diễn chức năng đã được kiểm chứng ở đúng phiên bản được bảo vệ.

## Slide 1 — Tên đề tài

- **Tiêu đề:** Xây dựng hệ thống quản lý hội thoại khách hàng đa kênh Nhuu-chat.
- Họ tên, mã sinh viên, lớp, khoa, trường.
- Giảng viên hướng dẫn và đơn vị thực tập (nếu có).
- Thời gian thực hiện.
- **Hình:** Logo sản phẩm hoặc ảnh Inbox đã che dữ liệu thật.
- **Lời dẫn:** Giới thiệu ngắn vấn đề quản lý hội thoại phân tán và mục tiêu của đề tài.

## Slide 2 — Đặt vấn đề

- Khách hàng liên hệ qua nhiều nền tảng.
- Nhân viên phải chuyển ứng dụng, khó bàn giao và dễ bỏ sót tin.
- Quyền truy cập từng Page/kênh chưa chắc giống nhau.
- Nhu cầu xem hội thoại tập trung và realtime.
- **Hình:** Sơ đồ nhiều kênh → một Inbox.

## Slide 3 — Mục tiêu và phạm vi

- Tập trung hội thoại trong một web app.
- Xác thực an toàn và phiên đăng nhập riêng theo thiết bị.
- Workspace quản lý thành viên và quyền channel.
- Cập nhật Inbox qua REST + Socket.IO.
- Ghi rõ mức hỗ trợ thực tế của từng connector: Facebook Messenger, Telegram, Telegram cá nhân, Zalo cá nhân thử nghiệm; không gộp các trạng thái thành một cam kết production.

## Slide 4 — Đối tượng sử dụng và nghiệp vụ

- Owner: quản lý Workspace/kết nối/thành viên.
- Admin: quyền vận hành Workspace theo mô hình hiện tại.
- Staff: làm việc trong các channel được cấp.
- Agent/customer: các role hệ thống hiện hữu, khác với Workspace role.
- **Hình:** Use case rút gọn: login, chọn Workspace, xem Inbox, xử lý tin, phân quyền thành viên.

## Slide 5 — Sơ đồ cơ sở dữ liệu

- Trình bày entity: `User`, `AuthSession`, `Workspace`, `WorkspaceMember`, `Conversation`, `Message` và channel connection.
- Nêu các quan hệ: User có nhiều AuthSession; Workspace có WorkspaceMember; Conversation có nhiều Message.
- **Điểm cần nói chính xác:** User không chứa `allowedPages`; quyền nằm trên WorkspaceMember. `allowedChannels` là dạng đa kênh; `allowedPages` là tương thích cũ.
- **Hình:** Dùng ER diagram ở `bao_cao_do_an_tot_nghiep.md`, rút gọn để chữ đọc được.

## Slide 6 — Kiến trúc tổng thể

- React/Vite/Tailwind SPA.
- Express/TypeScript API.
- MongoDB Atlas qua Mongoose.
- Socket.IO cho realtime; Redis adapter tùy chọn khi cấu hình.
- Provider connector/webhook.
- **Hình:** Browser ↔ API/Socket ↔ MongoDB/Redis ↔ nền tảng.

## Slide 7 — Công nghệ lựa chọn

- React và React Router: component UI, SPA routing, protected routes.
- Node.js/Express/TypeScript: API và middleware theo miền.
- MongoDB/Mongoose: tài liệu, schema và index.
- Tailwind CSS v4 + Vite: styling utility-first và build frontend.
- Socket.IO: event hai chiều, room, reconnect.
- Với mỗi lựa chọn, nêu một ưu điểm và một giới hạn; tránh mô tả công nghệ chung chung.

## Slide 8 — Xác thực và Auth Guard

- Login tạo access/refresh cookie HttpOnly.
- App bootstrap gọi session API, thử refresh khi access hết hạn.
- ProtectedRoute điều hướng UX; backend middleware vẫn quyết định quyền thật.
- Logout thu hồi AuthSession tương ứng.
- **Hình:** Sequence browser → session API → AuthSession.

## Slide 9 — Multi-device Auth

- Mỗi lần đăng nhập có AuthSession độc lập.
- Lưu hash refresh token, thời điểm dùng gần nhất và hạn phiên.
- Xoay refresh token theo session; logout một thiết bị không nhất thiết logout các thiết bị khác.
- Reset mật khẩu thu hồi các phiên theo luồng hiện tại.
- **Điểm cần nói chính xác:** không dùng mảng refreshTokens trong User làm thiết kế chính; User có trường legacy riêng để tương thích.

## Slide 10 — Demo chức năng

- Mở Dashboard/Inbox bằng tài khoản demo đã chuẩn bị.
- Chọn Workspace và xem danh sách channel.
- Mở hội thoại; gửi/nhận một tình huống demo đã được xác minh.
- Mở Cài đặt phân quyền, minh họa vai trò và channel assignment.
- **Kịch bản dự phòng:** video/ảnh chụp đã ghi trước; không dùng credential khách hàng.
- Nêu trước giới hạn demo: provider live phụ thuộc credential/network và mức hoàn thiện connector.

## Slide 11 — Thiết kế Workspace RBAC

- Tách role hệ thống khỏi role Workspace.
- Membership xác định user thuộc Workspace nào.
- Owner/admin xem kênh Workspace; staff theo quyền channel theo quy ước service.
- Danh sách channel rỗng được hiểu là unrestricted trong implementation hiện tại; UI phải giải thích rõ.
- **Hình:** bảng Role × Action và ví dụ channel scope.

## Slide 12 — Lọc API và bảo vệ dữ liệu

- Middleware xác minh user là member của Workspace.
- Service tạo channel filter theo `(platform, channelId)` và owner scope.
- Conversation API áp dụng filter ở server.
- Không tin `ownerId`/channel list do client tự gửi.
- Demo test âm tính: truy cập conversation ngoài quyền bị từ chối/không được trả.

## Slide 13 — Socket.IO và đồng bộ realtime

- Handshake xác minh token/session/Workspace.
- Join conversation được kiểm tra qua access policy.
- Inbox event chỉ phát tới recipients có quyền kênh.
- Socket reconnect khi mạng trở lại; Redis adapter tùy chọn cho nhiều process.
- **Hình:** event provider → backend → access lookup → socket room.

## Slide 14 — UI đa kênh và modal phân quyền

- Nhóm channel theo nền tảng, tránh nhầm Facebook/Zalo/Telegram.
- Hiển thị role và quyền đang cấp.
- Owner hiển thị tĩnh, không hiện thao tác sửa/xóa.
- Trình bày loading, validation, lỗi và trạng thái lưu.
- **Hình:** ảnh modal đã ẩn email thật.

## Slide 15 — Mobile và phục hồi trạng thái

- Route/tab/conversation được phản ánh qua URL.
- Trạng thái tạm dùng sessionStorage; Workspace selection có scope người dùng.
- Tối thiểu 16px cho input/select/textarea trên mobile để tránh auto zoom iOS.
- Chuyển Workspace xóa dữ liệu cũ và tái tạo socket trong SPA.
- Nêu giới hạn: browser vẫn có thể kill tab; mục tiêu là khôi phục sau reload và xác minh lại quyền.

## Slide 16 — Kiểm thử và bằng chứng

- Unit/service: filter Workspace/channel, session rotation.
- API: role cho phép và trường hợp ngoài quyền.
- Socket: handshake, join guard và recipient scope.
- Frontend: auth routing, persistence và mobile UI.
- Build/typecheck/diff check.
- Điền kết quả thực tế của đúng commit: `[lệnh]`, `[số test đạt/tổng]`, `[lỗi môi trường hoặc giới hạn]`. Không chép số liệu từ lần chạy khác.

## Slide 17 — Hạn chế và hướng phát triển

- Mức hoàn thiện connector không đồng đều; Zalo cá nhân thử nghiệm.
- Tích hợp live cần credential, policy/app review và nghiệm thu riêng.
- Migration production cần backup, báo cáo dry-run và rollback plan.
- Mở rộng observability, audit quyền, test multi-process/reconnect và trải nghiệm mobile.
- Phân biệt “đã có code”, “đã test”, “đã nghiệm thu production”.

## Slide 18 — Kết luận và hỏi đáp

- Tóm lược kết quả: Inbox đa kênh, auth phiên riêng, Workspace RBAC, realtime, responsive UI.
- Nêu đóng góp cá nhân đã xác minh.
- Cảm ơn hội đồng.
- **Lời kết:** “Em xin kết thúc phần trình bày và sẵn sàng trả lời câu hỏi.”

## Gợi ý thời lượng

| Phần | Slide | Thời lượng gợi ý |
|---|---:|---:|
| Bối cảnh, mục tiêu | 1–4 | 2 phút |
| Kiến trúc và công nghệ | 5–7 | 3 phút |
| Auth và demo | 8–10 | 3–4 phút |
| RBAC, API, realtime | 11–13 | 3–4 phút |
| UX, kiểm thử, kết luận | 14–18 | 3–4 phút |

## Checklist trước khi bảo vệ

- [ ] Điền họ tên, đơn vị, thời gian và đóng góp cá nhân.
- [ ] Chạy lại test/build trên commit sẽ trình bày; chép nguyên kết quả.
- [ ] Chuẩn bị tài khoản demo riêng và đường dẫn demo dự phòng.
- [ ] Ẩn PII, access token, email và dữ liệu khách hàng khỏi ảnh/video.
- [ ] Không khẳng định connector, migration hoặc production status chưa được kiểm chứng.
- [ ] Kiểm tra thời lượng, font chữ và khả năng đọc sơ đồ ở máy chiếu.
