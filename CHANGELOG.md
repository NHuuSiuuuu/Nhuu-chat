# Nhật ký thay đổi

Mọi thay đổi đáng chú ý của project sẽ được ghi lại trong file này.
Định dạng dựa trên Keep a Changelog và project tuân theo Semantic Versioning.

## [Unreleased]

- Sửa routing header bằng History API: logo điều hướng tới `/dashboard`, mục `Hội thoại` tới `/inbox`, đồng thời hỗ trợ back/forward của trình duyệt.
- Bỏ avatar khỏi message của agent/chính mình; chỉ giữ avatar ở message khách để khung chat gọn hơn.
- Căn chỉnh lại message: tin nhắn của chính mình nằm bên phải, action hover nằm bên trái bubble; message khách giữ hướng ngược lại.
- Cập nhật UI message theo `DEVELOPMENT_PROMPT.md`: avatar, tên người gửi thực tế, timestamp, mention `@All` và nhóm thao tác khi hover.
- Bổ sung `senderName` tùy chọn cho message contract và mapper Telegram để hiển thị đúng người gửi trong hội thoại nhóm.
- Kết nối điều hướng header: bấm logo `NhuuChat` về Dashboard và bấm `Hội thoại` mở Inbox.
- Cập nhật `docs/wiki/README.md` thành tài liệu Wiki chi tiết về trạng thái MVP, luồng Inbox responsive, cách cài đặt, kiểm thử, giới hạn và roadmap.
- Thêm sidebar thông tin bổ trợ bên phải khung chat với tab `Thông tin`/`Tạo đơn`, khu vực ghi chú, đơn hàng và responsive drawer cho màn hình nhỏ.
- Cải thiện responsive Inbox: ẩn danh sách hội thoại trái dưới breakpoint hẹp, thêm drawer danh sách và nút mở danh sách cạnh avatar trong khung chat.
- Làm mới form nhập tin nhắn: textarea nhiều dòng, gửi bằng Enter, xuống dòng bằng Shift+Enter, gợi ý mẫu trả lời/thành viên, thanh công cụ và modal phím tắt.
- Khôi phục quy ước lỗi validation trước refactor (`1e05c33`): giữ lỗi 400 có sẵn của auth/Telegram 2FA và lỗi 500 có sẵn của Telegram bot, QR-status thiếu id, auth thiếu body; không chuẩn hóa toàn bộ lỗi schema thành 400.
- Bổ sung kiểm thử không cần Mongo cho chuẩn hóa/loại trùng tag khách hàng, phản hồi và chuyển tiếp lỗi customer/knowledge, cùng vòng đời lưu/xóa knowledge.
- Chuyển toàn bộ xử lý gửi tin outbound vào message service; bổ sung kiểm thử hành vi gửi Telegram bot/cá nhân, lưu tin, phân quyền, lỗi và event controller.

## [Chưa phát hành] - 2026-09-09

Các ghi chú nâng cấp được viết rõ ràng để cả team dễ theo dõi và thực hiện.

### Đã thêm

- Thiết kế kiến trúc MVP cho Nhuu-chat.
- Implementation plan cho Telegram connector, inbox realtime, RAG, Bot Pause, bảo mật và kiểm thử.
- Telegram connector MVP với chuẩn hóa tin nhắn text, webhook xác thực secret và chống ghi trùng khi Telegram gửi lại update.
- Đăng ký bot Telegram, lưu trữ provider secret đã mã hóa và client `setWebhook` có timeout cùng kiểm tra response.
- Chat contract, REST API cho hội thoại và tin nhắn, cập nhật trạng thái, gán agent, quản lý tag khách hàng và Socket.IO room xác thực bằng JWT.
- Phân quyền room theo agent được gán, Redis adapter cho Socket.IO, event realtime và gửi tin outbound Telegram bằng bot token đã mã hóa.
- Knowledge ingestion và RAG grounded có metadata nguồn, vector store/provider có thể thay thế và handoff rõ ràng khi không đủ context.
- Bot Pause 30 phút và retry policy outbound deterministic tại các mốc 0 giây, 1 giây và 4 giây.
- Inbox React tối thiểu với danh sách hội thoại, timeline tin nhắn, composer và cập nhật realtime qua Socket.IO.
- Security headers, request ID, rate limit cho auth và tài liệu README/Wiki ghi rõ trạng thái MVP cùng giới hạn production.
- Bổ sung security test cho security headers, request ID, CORS allowlist, role guard và xác thực Telegram webhook.
- Bổ sung hướng dẫn chạy riêng API/web và cấu hình `apps/api/.env` trong README.
- Cấu hình Vite listen trên `0.0.0.0` để web truy cập được qua IPv4 và SSH tunnel, đồng thời tránh lỗi `ERR_CONNECTION_RESET` khi server chỉ bind vào IPv6 loopback.
- Sửa lỗi màn hình trắng trên frontend bằng cách cung cấp biến `React` cho JSX runtime của Vite.
- Bổ sung biến `React` cho toàn bộ component TSX để tránh lỗi runtime màn hình trắng khi Vite render JSX.
- Thay nút nhập access token tạm thời bằng form đăng nhập/đăng ký kết nối API auth; tài khoản đăng ký mới mặc định không có quyền agent/admin.
- Bổ sung tài liệu contract auth MVP và giới hạn role customer trong README/Wiki.
- Chuyển cấu hình database từ MongoDB local sang MongoDB Atlas, bỏ MongoDB khỏi Docker Compose và giữ Redis local.
- Gỡ MongoDB native 8.0 vừa cài trên server sau khi xác minh CPU máy chủ không hỗ trợ AVX.
- Sửa lỗi frontend gọi API qua `localhost:3000` trong VS Code Tunnel bằng URL tương đối và Vite proxy cho API/Socket.IO.
- Cho phép role `customer` vào inbox và sử dụng luồng hội thoại trong giai đoạn MVP; quyền sẽ được siết lại trước production theo yêu cầu.
- Thêm Dashboard onboarding; sau đăng nhập người dùng không còn bị đưa thẳng vào Inbox khi chưa có kênh.
- Thêm kết nối Telegram cá nhân bằng MTProto QR Login, mã hóa session tại backend và adapter gửi tin theo session cá nhân.
- Thêm luồng nhập mật khẩu 2FA Telegram sau khi quét QR; mật khẩu không được lưu hoặc ghi log, lỗi mật khẩu sai cho phép thử lại thay vì báo sai `AUTH_USER_CANCEL`.
- Cho phép hủy phiên QR Telegram cũ đang chờ 2FA và tạo phiên mới sau khi người dùng thay đổi thiết lập 2FA; bổ sung nút tạo lại phiên trên UI.
- Hoàn thiện realtime Inbox: phát event khi có tin Telegram inbound/outbound, cập nhật danh sách hội thoại và message không cần refresh, tự mở hội thoại đầu tiên và chống hiển thị trùng message.

### Đã thay đổi

- Tổ chức lại API theo các tầng toàn cục `routes`, `controllers`, `services` và `schemas` mà không thay đổi hành vi runtime.
- Trạng thái QR Telegram cá nhân bổ sung `password_required` và endpoint xác minh mật khẩu theo đúng session của người dùng.
- Chuyển toàn bộ styling frontend sang Tailwind CSS v4, loại bỏ các file CSS giao diện cũ và giữ lại duy nhất entry `apps/web/src/styles/tailwind.css`.
- Sửa các chi tiết hậu kiểm Tailwind: loại bỏ class nền xung đột, bổ sung accessibility cho modal/composer, giới hạn viewport modal và áp dụng utility classes cho form đăng nhập.
- Cải thiện Inbox: tự cuộn tới tin nhắn mới nhất khi mở hội thoại, thêm nút cuộn mượt khi người dùng xem tin cũ, xóa badge chưa đọc khi mở và hiển thị badge nền tảng.
- Bổ sung tên thật, avatar, nhận diện hội thoại nhóm và metadata nền tảng trong conversation contract.
- Thu gọn sidebar hội thoại desktop xuống chế độ avatar-only kiểu Telegram và giảm chiều cao composer nhập tin nhắn.
- Đổi sidebar hội thoại desktop sang kéo-thả ở mép để điều chỉnh độ rộng liên tục, không thu gọn bằng nút click.

### Đã sửa

- Sửa lỗi GramJS biến yêu cầu mật khẩu 2FA thành `AUTH_USER_CANCEL`.
- Sửa lỗi gửi tin Telegram cá nhân trả `409 TELEGRAM_PERSONAL_DISCONNECTED` sau khi API restart bằng cách khôi phục session đã mã hóa từ MongoDB trước khi gửi.
- Khôi phục và đăng ký listener inbound cho toàn bộ session Telegram cá nhân đang active ngay khi API khởi động để tin nhắn từ Telegram được đồng bộ lên Inbox kể cả trước khi người dùng gửi tin từ web.
- Sửa lỗi Inbox mất message Telegram vừa nhận khi response lịch sử về sau ghi đè state realtime; lịch sử nay được merge không trùng và tự chọn hội thoại mới nhận qua Socket.IO.
- Thiết kế lại Dashboard kết nối kênh theo giao diện tham chiếu: bộ lọc nền tảng, card tài khoản, trạng thái rỗng và modal chọn kênh có QR Telegram cùng hướng dẫn 2FA.
- Bổ sung header Hchat màu navy trên Dashboard với logo thương hiệu, menu điều hướng và thông tin owner để khớp thiết kế tham chiếu.
- Căn lại Dashboard theo ảnh tham chiếu: bỏ margin mặc định của body, dùng font Arial, nền #F0F2F7 và giới hạn vùng nội dung trung tâm.
- Thay ký hiệu Unicode bằng SVG icon theo đúng nền tảng, gồm Telegram paper-plane, Zalo, Facebook, Instagram và WhatsApp; tăng kích thước chữ menu header.
- Làm lại modal “Thêm kết nối” theo prompt mới: backdrop blur, modal rộng 2 cột, sidebar 260px, item 64px, QR có corner bracket và hướng dẫn Telegram bằng tiếng Việt.
- Bổ sung bộ logo SVG màu thương hiệu cho các nền tảng kết nối và icon minh họa trong hướng dẫn QR.
- Cố định màu logo theo brand và thêm animation mở/đóng modal với fade, scale nhẹ, hover transition và hỗ trợ giảm chuyển động.
- Chuẩn hóa toàn bộ vị trí logo vào ô vuông bo góc 32px, dùng nhất quán trong sidebar, bộ lọc và hướng dẫn Telegram theo ảnh tham chiếu.
- Làm lại trang Hội thoại theo phương án 1: navigation sidebar 44px, conversation sidebar 395px, toolbar tìm kiếm/lọc/thêm, danh sách hội thoại có selected/unread/hover state và empty state Livechat ở vùng chat chính.
- Khi bấm tài khoản Telegram đã kết nối trên Dashboard, chuyển vào trang Hội thoại với bố cục Livechat mới; thêm composer và header hội thoại theo presentation layer hiện có.
- Giữ header Hchat dùng chung khi chuyển từ Dashboard sang trang Hội thoại; layout inbox nằm bên dưới header và tự chiếm phần chiều cao còn lại.
- Thêm `DEVELOPMENT_PROMPT.md` ở thư mục gốc để lưu prompt và handoff dài; agent chỉ đọc file khi người dùng yêu cầu trực tiếp.
