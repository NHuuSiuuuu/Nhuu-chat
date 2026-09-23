# Nhật ký thay đổi

Mọi thay đổi đáng chú ý của project sẽ được ghi lại trong file này.
Định dạng dựa trên Keep a Changelog và project tuân theo Semantic Versioning.

## [Unreleased]

- Đặc tả MVP Inbox Facebook Messenger thủ công qua webhook và Send API, tách khỏi giai đoạn AI tự trả lời.
- Lập kế hoạch triển khai Inbox Facebook Messenger theo từng lát kết nối, webhook, gửi tin và Inbox.
- Làm rõ kiểm tra quyền Messenger tại thao tác đăng ký webhook/gửi tin, tránh dùng Conversations API làm điều kiện kết nối Page.
- Giữ khóa sở hữu Page trong Mongo qua các lần đăng ký/gỡ webhook Messenger; thao tác đồng thời dùng compare-and-swap và lỗi xác định có thể thử lại an toàn.
- Đánh dấu các mục Cài đặt chưa hoàn thiện bằng nhãn “Sắp có”, làm mờ và vô hiệu hóa thao tác.
- Thêm các trang `/login`, `/register`, `/forgot-password` và `/reset-password` có Landing Header, liên kết SPA, xác nhận mật khẩu và luồng đặt lại mật khẩu qua Nodemailer/SMTP với token một lần; API luôn trả xác nhận chung, kể cả khi gửi email lỗi.
- Bổ sung kiểm tra dữ liệu phía trình duyệt cho trang đăng nhập/đăng ký và hiển thị lỗi bằng Sonner.
- Tách thông báo bỏ trống theo từng trường, Việt hóa lỗi xác thực API, hiển thị lỗi đăng nhập sai dưới ô mật khẩu và báo toast khi đăng nhập thành công.
- Bỏ style màu trắng/xám ghi đè Sonner để `richColors` hiển thị nền màu theo trạng thái toast.
- Thiết kế lại email đặt lại mật khẩu với logo NhuuChat, nút thao tác, thời hạn liên kết và lưu ý bảo mật.
- Làm mới minh họa Chatbot AI trên Landing Page với khung xoay, robot lơ lửng và thẻ trạng thái trả lời tự động.
- Phát toast tin nhắn khách qua Socket.IO toàn cục đến người nhận Inbox được phân quyền và dùng giao diện sáng theo cài đặt tài khoản.
- Cho phép click toast tin nhắn toàn cục để mở Inbox và chọn đúng hội thoại sau khi danh sách tải xong.
- Chuẩn hóa cursor và hover của nút, liên kết tương tác xuyên frontend; bổ sung hover rõ hơn cho nút xem mật khẩu và mục hội thoại.

## 2026-09-23

- Cấu hình triển khai frontend trên Vercel và API/Redis trên Railway, bổ sung Dockerfile đóng gói API và giữ MongoDB trên Atlas.
- Sửa khai báo trùng `ownerKey` khiến frontend không biên dịch được cho production.

## 2026-09-22

- Thêm Cài đặt chung riêng từng tài khoản cho thông báo, âm thanh, ưu tiên hội thoại chưa đọc và thao tác đánh dấu đã đọc rồi mở hội thoại chưa đọc kế tiếp.
- Bổ sung thông báo rõ ràng khi chọn tab Cài đặt đang phát triển.
- Thêm hiệu ứng chữ chuyển sắc xanh–cyan cho tiêu đề AI Chatbot ở Landing Page.
- Scale Up Landing Page theo responsive: tăng typography, CTA, icon, mockup, spacing và khoảng cách grid trên desktop, giữ kích thước vừa phải trên mobile.
- Giảm độ dày typography trên Landing Page, đồng bộ các tiêu đề, nhãn và nút theo trọng lượng chữ nhẹ hơn.
- Sửa URL logo Zalo trong card Kênh tích hợp để không còn lỗi 404.
- Thay icon outline trong card Kênh tích hợp bằng logo thương hiệu thật qua `logoUrl`, bổ sung SVG quả địa cầu cho Website Webchat.
- Cập nhật Section Kênh tích hợp Landing Page theo thiết kế tham chiếu: 8 kênh, card bo lớn, nền sáng và typography mảnh hơn.
- Khôi phục logo riêng của Dashboard và chuyển thay đổi logo theo ảnh tham khảo sang đúng header Landing Page `/`.
- Đổi logo Landing Page sang màu xanh thương hiệu trên nền trong suốt để hiển thị rõ trên header trắng.
- Đồng bộ hình dạng logo Landing Page với logo đang dùng trong header Dashboard, giữ biến thể màu phù hợp nền trắng.
- Thay logo giả trong mockup Inbox của Landing Page bằng asset logo thật dùng trong header Dashboard.
- Thêm hai Floating Badge vào mockup Inbox Landing Page với hiệu ứng lơ lửng lệch nhịp, nhấn mạnh AI Auto-Reply và hiệu suất chốt đơn.
- Căn lại Floating Badge theo mockup tham chiếu: badge AI nhô khỏi mép trên phải và badge hiệu suất nhô khỏi mép dưới trái.
- Thay asset logo header bằng phiên bản ngang icon tròn và chữ `nhuu` theo thiết kế tham khảo.
- Căn lại logo Nhuu trên header Inbox theo thiết kế tham khảo và xác nhận badge tin chưa đọc nằm góc dưới phải avatar với viền trắng.
- Thay toàn bộ dữ liệu thật trong mockup Inbox bằng fake data: `admin_demo_01`, Mai Lan, Trần Kiên và nội dung hội thoại mẫu.
- Làm lại mockup Inbox trong Hero theo thiết kế tham khảo: thêm navbar xanh, sidebar điều hướng, danh sách hội thoại, khung chat và panel Tạo đơn bằng dữ liệu giả.
- Tinh chỉnh Hero Landing Page theo ảnh tham khảo: typography mảnh hơn, nền gradient nhẹ, badge NhuuChat AI 2.0, CTA đôi và mô tả sản phẩm mới.
- Tinh chỉnh Landing Page theo thiết kế NhuuChat trong `DEVELOPMENT_PROMPT.md`: bổ sung đủ 9 kênh, 9 tính năng, 4 gói giá, testimonial, thống kê và nội dung CTA/FAQ đồng nhất với ảnh tham khảo.
- Thêm Landing Page public tại `/` với mockup Inbox, giới thiệu đa kênh, AI, bảng giá, FAQ và điều hướng Dashboard qua user đã đăng nhập.
- Cập nhật nền cho tab Trợ lý AI: tab đang chọn dùng nền xanh, tab còn lại dùng nền xám nhạt.
- Bỏ bộ lọc trên trang Lịch sử hoạt động, hiển thị trực tiếp toàn bộ bản ghi theo từng trang và giữ nguyên phân trang.
- Thêm trang và API Lịch sử hoạt động cho thay đổi Cài đặt AI, kết nối/ngắt kết nối Facebook Page, có xác thực theo người dùng, phân trang và giới hạn lưu 500 bản ghi mỗi người dùng.
- Sửa snapshot lịch sử bị cũ khi nhiều yêu cầu cập nhật AI hoặc kết nối Facebook chạy đồng thời; chỉ ghi ngắt kết nối cho Page thực sự bị xóa. Diff giữ kiểu container và lọc dữ liệu nhạy cảm; bỏ nhãn `Hiện tại` vốn suy ra từ vị trí sự kiện trong Timeline.
- Khôi phục sidebar 7 mục Giới thiệu trên desktop, bổ sung icon thông tin cho tab; mobile tiếp tục dùng menu accordion chung.
- Thêm điều hướng URL riêng cho từng mục Giới thiệu trên mobile và Dashboard, đồng thời bỏ menu Giới thiệu bị lặp phía trên nội dung.
- Sửa điều hướng menu Cài đặt trên mobile: mục cha chỉ mở accordion, các mục con mới điều hướng đến từng trang.
- Cải thiện giao diện mobile trang Cài đặt: thêm accordion tab Cài đặt trong menu chính, ẩn sidebar phụ và tối ưu bố cục Trợ lý AI trên màn hình nhỏ.
- Thay thế toast tự xây dựng bằng `sonner`: thêm Toaster góc phải, thông báo tin nhắn đến, đăng bài, xóa bài và dọn component toast cũ.
- Bỏ nút Làm mới khỏi các tab Nháp, Đã lên lịch và Lịch sử trong trang đăng bài Facebook.
- Bỏ tiêu đề và mô tả lặp lại ở các tab Nháp, Đã lên lịch và Lịch sử; căn nút Làm mới về bên phải phía trên danh sách.
- Đồng bộ ID thật trên card kênh, lưu avatar Facebook từ Graph API và bổ sung fallback avatar an toàn.
- Cập nhật tiêu đề tab trình duyệt theo route và thay favicon mặc định bằng logo NhuuChat.
- Bổ sung Facebook Page vào Gộp trang và menu làm mới/ngắt kết nối trên card Dashboard.
- Hiển thị Facebook Page đã kết nối trên Dashboard, bổ sung bộ lọc Facebook và giữ đúng Page ID khi mở Inbox.
- Cập nhật trang Giới thiệu: bổ sung đăng bài Facebook vào các điểm nổi bật của Tổng quan và thêm tab hướng dẫn `Đăng bài`.
- Sửa avatar trong từng dòng tin nhắn của khách hàng dùng đúng `customerAvatarUrl` như avatar ở Header khung chat, tránh hiển thị fallback chữ cái khi ảnh vẫn có sẵn.
- Cập nhật modal kết nối Facebook: dùng icon SVG thương hiệu, bổ sung nút và biểu mẫu kết nối thủ công bằng Page ID + Page Access Token, giữ nguyên luồng OAuth hiện có.

## 2026-09-21

- Bổ sung đăng nhập Facebook bằng OAuth trong modal Dashboard: lấy danh sách Page do tài khoản quản lý, chỉ cho chọn Page có quyền đăng bài và lưu kết nối qua service hiện có; giữ nguyên luồng nhập thủ công Page ID và Page Access Token.
- Sửa chatbot giữ ngữ cảnh khi khách trả lời viết tắt như “sv” hoặc xác nhận “có”, bổ sung lượt khách trước vào truy vấn knowledge để không trả fallback dù dữ liệu phù hợp đã có.
- Sửa AI gợi ý trả về rỗng khi model Gemini chính quá tải: tự chuyển sang model dự phòng khả dụng và cho phép nút làm mới gọi gợi ý ở mọi chế độ đang bật.
- Sửa gửi tin Zalo cá nhân bằng cách truyền text theo payload `{ msg }` mà `zca-js` yêu cầu; trước đó truyền chuỗi khiến Zalo trả mã tham số không hợp lệ `114`.
- Bổ sung log chẩn đoán an toàn cho lỗi gửi Zalo và lỗi gợi ý Gemini, giữ lại mã/tên/thông báo lỗi bên ngoài mà không ghi nội dung tin nhắn hoặc credential.
- Sửa kết nối Zalo cá nhân không tự rơi vào `ZALO_PERSONAL_REDIS_LEASE_LOST` khi Redis gián đoạn ngắn: bật reconnect và retry gia hạn lease trong TTL.
- Sửa Skeleton Loading bài viết để khớp card thực tế và bỏ polling tự động gọi API bài viết mỗi 5 giây.
- Thêm Skeleton Loading cho trang Bài viết: giữ Global Header/Sidebar ổn định và hiển thị 3 khung bài viết trong lúc chờ API.
- Bỏ cơ chế cố định và cuộn riêng của sidebar quản lý Facebook Page để sidebar cuộn cùng nội dung chính.
- Cập nhật card quản lý Facebook Page: chọn Page bằng dropdown, đồng bộ Page ID theo lựa chọn, đưa trạng thái kết nối vào card và bỏ các phần tử điều hướng thừa.
- Bỏ tiêu đề và phụ đề trùng lặp trong nội dung trang Đăng bài Facebook Page, giữ lại Global Header và layout sidebar.
- Refactor trang Đăng bài Facebook Page thành layout sidebar với các tab Soạn thảo, Nháp, Đã lên lịch và Lịch sử; bổ sung sửa/xóa bài, thử lại bài lỗi và xem bài đã đăng trên Facebook.
- Mở rộng xóa bài Facebook Page theo owner cho cả trạng thái đã đăng và thất bại, đồng thời dọn media liên quan.
- Sửa modal `Thêm kết nối` luôn nằm trên Header với backdrop `z-[100]`, căn giữa, nền tối, animation scale/fade và cập nhật logo Zalo nguyên bản.
- Căn lại icon Zalo và Telegram trong menu `Thêm kết nối` theo dạng ô vuông bo góc, đồng nhất với thiết kế tham chiếu.
- Refactor giao diện modal `Thêm kết nối`: thêm Website, đưa Booking xuống cuối, làm nổi bật trạng thái active/hover và dùng icon thương hiệu kích thước lớn không còn nền xám bao ngoài.
- Bổ sung hướng dẫn vận hành Facebook Page V1: kết nối thủ công Page ID/token, giới hạn Development Mode, Graph API `v26.0`, Cloudinary ảnh JPG/PNG/WebP tối đa 5 MiB, trạng thái bài, múi giờ `Asia/Ho_Chi_Minh`/UTC, worker 30 giây, recovery sau restart và xử lý timeout Meta mơ hồ.
- Bổ sung các biến cấu hình không bí mật cho Facebook Page scheduler; token Page vẫn chỉ nhập lúc kết nối và được mã hóa phía backend.
- Thêm giao diện đăng bài Facebook Page: kết nối token không lưu trên trình duyệt, soạn text/ảnh, đăng ngay/lưu nháp/hẹn đăng theo múi giờ `Asia/Ho_Chi_Minh`, xem trạng thái và thử lại/hủy lịch an toàn.
- Giữ nguyên `Host` của trình duyệt khi Vite proxy chuyển tiếp API và Socket.IO, để kiểm tra same-origin hoạt động đúng khi frontend chạy trên IP production.
- Sửa đăng nhập bị `403 CSRF_ORIGIN_REJECTED` khi frontend và API chạy cùng origin IP/port nhưng origin đó chưa có trong allowlist; middleware nay nhận diện đúng same-origin theo `Host` và vẫn chặn origin cross-site.
- Chuyển xác thực web sang HttpOnly access/refresh cookie: bỏ lưu JWT trong `localStorage`, thêm session bootstrap, refresh/logout bằng cookie, credentials cho API/Socket.IO và kiểm tra Origin cho request mutation; vẫn giữ Bearer fallback tạm thời cho client cũ.
- Bổ sung cấu hình `WEB_ALLOWED_ORIGINS` và `AUTH_COOKIE_SAME_SITE`; production yêu cầu HTTPS khi dùng cookie cross-origin.
- Căn lại ngưỡng sticky sidebar Cài đặt theo vị trí thực tế dưới header để sidebar không bị trôi một đoạn khi bắt đầu cuộn.
- Làm gọn danh sách trong Tổng quan, Trợ lý AI và Bảo mật & dữ liệu: giữ icon SVG ở tiêu đề, bỏ icon khỏi mục con và dùng bullet mặc định.
- Mở rộng nội dung Giới thiệu cho Tổng quan, Trợ lý AI và Bảo mật & dữ liệu; bổ sung hướng dẫn AI và sidebar Settings sticky có cuộn riêng.
- Thêm icon cảnh báo cho mục `Lưu ý quan trọng` và giữ sidebar Cài đặt cố định khi cuộn trên màn hình lớn.
- Cập nhật nội dung tab `Giới thiệu` với hướng dẫn đăng nhập nhiều tài khoản, chế độ Gộp trang, icon SVG, số thứ tự và các lưu ý vận hành Zalo.
- Thêm tab `Giới thiệu` trong Cài đặt với sidebar Tổng quan, Dashboard, Đa tài khoản, Quản lý tin nhắn, Trợ lý AI và Bảo mật & dữ liệu; nội dung được tổng hợp từ README và CHANGELOG.

## 2026-09-18

- Thu gọn thẻ tag trên thanh gắn thẻ: padding dọc `py-1`, cỡ chữ `10px` và font thường.
- Sửa thanh tag phía trên ô nhập tin nhắn tự động xuống dòng trên màn hình hẹp, thêm khoảng cách giữa các tag và bỏ cuộn ngang gây cắt nội dung.
- Sửa thanh điều hướng mở đúng Hộp thư tại `/inbox` thay vì rơi vào trang tính năng đang phát triển.
- Đổi animation loading Inbox sang mẫu 2 chấm xanh mới, vẫn tách nền trong suốt và giữ kích thước `size-8`.
- Dùng animation loading gradient đã tách nền trong suốt, hiển thị gọn ở kích thước `size-8`.
- Thu nhỏ animation loading tin nhắn thành badge `size-8`, đồng nhất trên mobile và desktop.
- Sửa Inbox không nháy dòng `Chưa có tin nhắn` khi mở hội thoại: hiển thị spinner trong lúc tải, giữ vùng tin nhắn cuộn được và cố định ô nhập ở đáy khung chat.
- Tối ưu header Inbox mobile: giảm padding/gap và cho cụm tên người dùng nhận phần chiều rộng còn lại để hạn chế truncate quá sớm.
- Sắp xếp lại header Inbox trên mobile: tên người dùng luôn một dòng, icon nền tảng nằm bên dưới và cụm switch bot/menu bám sát mép phải.
- Sửa layout Inbox mobile: danh sách hội thoại sát dưới header, bỏ bo góc trái trên và ẩn khung chat khi đang mở danh sách để không bị chồng khi quay lại.
- Thêm trạng thái loading xoay tròn cho nút làm mới Dashboard trong thời gian tải lại dữ liệu và chặn click lặp.
- Thêm modal `Chọn pages để chat` từ nút `Gộp trang`: tìm kiếm, chọn từng Page, chọn tất cả Page đang hiển thị và xác nhận mở Inbox.
- Sửa nút `Gộp trang` dùng Flexbox để icon SVG và chữ luôn nằm cùng hàng, căn giữa theo chiều dọc.
- Thêm hamburger menu mobile cho header Dashboard với sidebar trượt từ trái, overlay đóng menu và giữ nguyên điều hướng desktop.
- Thay ký tự mũi tên trong bộ lọc Dashboard mobile bằng icon SVG `chevron-up/chevron-down`.
- Chuyển bộ lọc nền tảng trên Dashboard mobile thành nút dropdown gọn; giữ thanh lọc ngang trên desktop.
- Sửa khoảng cách mobile của Dashboard bị cộng đúp dưới header và hiển thị avatar tài khoản kết nối từ `avatarUrl` của API.
- Làm gọn giao diện tài khoản kết nối trên Dashboard bằng grid responsive, card avatar vuông bo góc và menu thao tác ở góc phải.
- Đồng bộ avatar tài khoản và khách hàng Zalo từ hồ sơ `zca-js`, giúp danh sách hội thoại hiển thị ảnh thật thay vì fallback chữ cái.
- Sửa danh sách hội thoại giữ lại URL avatar hợp lệ khi event realtime trả về dữ liệu avatar rỗng và truyền URL đã chuẩn hóa vào thẻ ảnh.
- Bỏ nút X khỏi thanh ghim thu gọn; thao tác bỏ ghim vẫn có trong danh sách tin ghim và trên từng tin nhắn.
- Cập nhật thanh tin ghim: nút mũi tên đổi chiều khi mở/thu danh sách, mỗi tin ghim hỗ trợ bỏ ghim và sao chép nội dung.
- Thêm ghim tối đa 10 tin nhắn cho mỗi hội thoại dành cho admin/agent: nút ghim khi hover, thanh tin đã ghim có điều hướng và cuộn tới tin gốc, API ghim/bỏ ghim cùng đồng bộ Socket.IO realtime.

## 2026-09-17
- Thay badge Zalo tự dựng bằng SVG logo Zalo thật ở cả biến thể có nền và trong suốt.
- Thêm tooltip khi hover cho các nút hướng dẫn, đính kèm, mẫu trả lời nhanh và gửi tin nhắn trong ô soạn tin.
- Cho phép gửi một ảnh hoặc file kèm chú thích từ Inbox tới Zalo cá nhân và Telegram cá nhân; giới hạn 20 MB, chặn định dạng nguy hiểm và lưu media qua Cloudinary.
- Sửa lỗi upload ảnh/file bị từ chối `400 INVALID_ATTACHMENT` do giới hạn multipart không đủ cho payload gửi từ trình duyệt.
- Sửa lỗi Zalo gửi ảnh thành công nhưng API trả `502` vì ID tin media nằm trong `attachment` thay vì `message`.
- Hiển thị tin nhắn gửi đi ngay trong Inbox, đồng bộ theo `clientMessageId` giữa HTTP/Socket.IO và cho phép gửi lại text/file khi delivery thất bại.
- Hiển thị trạng thái đang gửi, đã gửi và gửi thất bại trực tiếp trên bubble; ảnh/file có indicator overlay và hỗ trợ retry từ dấu `!`.
- Căn indicator trạng thái gửi vào một cột cố định bên phải để không đè lên nội dung và không lệch giữa các message.
- Đồng bộ sidebar thông tin bên phải với sidebar hội thoại bên trái: desktop co giãn trong khoảng `300px`–`395px`, tự thu theo viewport và chuyển sang drawer dưới `1000px`.
- Thu gọn cụm nút sửa/xóa/ghim của ghi chú để không che tên người ghi; icon ghim đang bật dùng màu vàng và không còn nhãn `Đã ghim`.
- Hiển thị ngày/tháng/năm cùng dòng với thời gian cập nhật ghi chú và đánh dấu `• Đã sửa` khi nội dung đã được chỉnh sửa.
- Sửa layout card ghi chú trong sidebar: tên/thời gian dài không còn làm tràn cụm icon sửa, xóa và ghim.
- Thêm ghi chú nội bộ theo từng hội thoại: agent/admin có thể tạo bằng Enter, xem người ghi và nội dung, sửa, xóa hoặc ghim ghi chú trong sidebar `Thông tin`.
- Sửa giữ nguyên kênh Inbox sau khi tải lại trang bằng cách lưu lựa chọn kênh trong phiên làm việc; `Gộp trang` vẫn xóa bộ lọc kênh.
- Thêm bộ lọc hội thoại theo các tag đã tạo và lựa chọn `Không gắn thẻ` trong sidebar Inbox.
- Sửa điều hướng Hội thoại giữ nguyên kênh đang chọn khi quay lại từ Dashboard; URL luôn dùng `/inbox`, chỉ `Gộp trang` mới mở toàn bộ kênh.
- Sửa Trợ lý AI ghi nhớ chatbot đang được chọn theo từng tài khoản; sau khi refresh vẫn mở đúng trợ lý đã chọn, chỉ fallback về mặc định nếu trợ lý đó đã bị xóa.
- Đưa logo nền tảng về bên phải dòng hội thoại và bỏ chữ tên nền tảng; chỉ giữ tên/avatar tài khoản thật khi có dữ liệu.
- Thay glyph `Z` tự dựng trong dòng hội thoại bằng wordmark Zalo SVG không nền, giữ kích thước đồng nhất với logo Telegram.
## 2026-09-16

- Sửa trường hợp API trả tên tài khoản trùng tên nền tảng: không còn dựng avatar chữ `Z` cho Zalo, luôn hiển thị biểu tượng nền tảng thật.
- Sửa dòng thông tin hội thoại: dùng biểu tượng nền tảng thật thay cho avatar chữ và badge `Zalo` giả khi chưa có tên tài khoản cụ thể.
- Thay chữ thương hiệu ở màn hình loading bằng logo NhuuChat trong suốt, giữ nguyên nền loading sáng.
- Thay logo chữ trong header bằng logo NhuuChat chính thức, giữ liên kết về Dashboard và hiển thị rõ trên màn hình nhỏ.
- Tách nền xanh khỏi asset logo NhuuChat để logo hòa đúng vào nền header, không còn xuất hiện mảng nền nhỏ lệch bên trong header.
- Thêm công tắc `Bot tự động` trong Inbox; tắt công tắc tương đương tiếp quản hội thoại và được lưu bền theo từng hội thoại, không tự bật lại sau 30 phút.
- Thêm nút `Tiếp quản hội thoại` trong Inbox để gán hội thoại cho nhân viên hiện tại và hiển thị icon nền tảng thay cho badge chữ Zalo.
- Sửa chatbot giữ chủ đề khóa học khi khách gửi SĐT/Zalo, tránh dùng chuỗi liên hệ làm truy vấn knowledge độc lập rồi trả fallback thiếu thông tin.
- Bảo vệ quy tắc thu thập liên hệ: chatbot chỉ được cảm ơn và thông báo nhân viên liên hệ sau khi tin khách có SĐT hoặc định danh Zalo xác thực; không còn tin vào lời tự nhận của Gemini.
- Sửa chatbot giữ ngữ cảnh khi khách trả lời xác nhận ngắn như “có” hoặc “được”, giúp tiếp tục tư vấn theo câu hỏi ngay trước đó thay vì trả fallback thiếu thông tin.
- Sửa RAG ưu tiên từ khóa/cụm từ tiếng Việt trong câu hỏi khi xếp hạng knowledge, tránh lấy nhầm tài liệu khiến chatbot trả fallback dù tài liệu đúng đã được tải lên.
- Khôi phục nút `+ Thêm mẫu chào` bên cạnh `Import kịch bản` để người dùng vẫn có thể tạo mẫu riêng lẻ.
- Đưa nút `Lưu hướng dẫn` và `Import kịch bản` lên cùng dòng tiêu đề khu vực tương ứng trong Trợ lý AI, giúp người dùng dễ nhận biết.
- Thêm nút lưu nội dung Hướng dẫn cho từng trợ lý AI, tránh mất thay đổi khi đổi trợ lý hoặc tải lại trang.
- Thêm vùng cuộn ẩn thanh scrollbar cho danh sách mẫu chào trong Trợ lý AI.
- Thêm import kịch bản trả lời tự động từ Excel `.xlsx` hoặc CSV theo từng trợ lý, hỗ trợ xem trước, báo lỗi theo dòng và xác nhận trước khi lưu.
- Thêm độ trễ 2 giây trước khi gửi mẫu chào tự động để phản hồi tự nhiên hơn.
- Sửa layout danh sách mẫu chào trong Trợ lý AI: nội dung dài không còn đẩy mất nút Sửa/Xóa.
- Chỉ pause chatbot khi nhân viên gửi tin, nhân viên tiếp quản hội thoại hoặc khách chọn “Gặp nhân viên”; fallback và lỗi xử lý bot không còn tự pause.
- Sửa chatbot không tự pause sau fallback thiếu thông tin; khách có thể tiếp tục nhắn và bot vẫn xử lý.
- Sửa chatbot tự động cho Zalo cá nhân: bổ sung adapter gửi phản hồi qua session Zalo đang hoạt động và giữ đúng loại hội thoại direct/group.
- Thêm API `POST /api/v1/channels/telegram-personal/logout` để hủy kết nối Telegram cá nhân, dừng client/QR và xóa session nhưng giữ nguyên dữ liệu Inbox.
- Thêm nút tùy chọn trên tài khoản Zalo và Telegram đã kết nối cùng modal xác nhận hủy kích hoạt; dữ liệu hội thoại/tin nhắn vẫn được giữ nguyên.
- Nối màn hình `Kết nối → Zalo` với API QR cá nhân: tự tạo mã khi chọn Zalo, hiển thị QR thật, polling trạng thái và báo lỗi/hết hạn/kết nối thành công.
- Cho phép môi trường development dùng lease Zalo trong bộ nhớ khi Redis chưa chạy, giữ production fail-closed; giới hạn cleanup QR native để logout không bị treo vô hạn.
- Sửa polling QR Zalo không tạo nhiều interval và hiển thị đúng ảnh PNG base64 do `zca-js` trả về.
- Sửa lỗi sau khi quét QR Zalo: tương thích field tài khoản của `zca-js` 2.2 (`userId`, `displayName`, `username`) và giữ fallback cho bản cũ, tránh báo sai `ZALO_QR_CREATE_FAILED`.
- Hiển thị tài khoản Zalo cá nhân đã kết nối trên Dashboard; click từng tài khoản mở Hội thoại theo đúng kênh, còn `Gộp trang` mới mở chế độ xem chung nhiều kênh.
- Sửa listener Zalo coi lỗi WebSocket tạm thời là lỗi vĩnh viễn; cho phép `zca-js` tự retry và cho phép tạo QR mới khi session cũ cần kết nối lại.
- Sửa gửi tin Zalo cá nhân trả `502` sau khi người nhận đã nhận được tin: chuẩn hóa message id native dạng số hoặc chuỗi để lưu outbound thành công.
- Sửa gửi tin Zalo cá nhân trả `409` dù người nhận đã nhận được tin: nhận lại bản ghi đã được listener lưu trong race chống trùng message id.
- Hiển thị thông báo `Chức năng đang được phát triển` cho các tab Settings chưa triển khai: Cài đặt chung, Hỗ trợ trả lời, Giao diện, Cuộc gọi, Chế độ xoay vòng, Đồng bộ, Công cụ, Phân quyền và Lịch sử.
- Hiển thị trang `Chức năng đang được phát triển` khi chọn các tab header Đơn hàng, Bài viết hoặc Thống kê; mỗi tab có route riêng để giữ đúng trạng thái khi tải lại.
- Vô hiệu hóa các tab Settings chưa phát triển, hiển thị con trỏ không cho phép click và giữ nguyên các tab Thẻ hội thoại, Trợ lý AI đang hoạt động.
- Hiển thị custom toast khi người dùng click vào tab Settings chưa phát triển; tab không chuyển nội dung và thông báo tự đóng sau 5 giây.
- Sửa lỗi tiến trình API khởi động trùng mở listener Zalo trước khi kiểm tra port HTTP, gây `ZALO_PERSONAL_LISTENER_ERROR`; server chỉ restore listener sau khi bind HTTP thành công.
- Gắn URL thật cho các mục điều hướng header để truy cập trực tiếp Đơn hàng, Bài viết và Thống kê không bị rơi vào liên kết rỗng.
- Sửa drawer danh sách hội thoại trên mobile bắt đầu dưới header cố định và chỉ chiếm phần chiều cao còn lại.
- Sửa lỗi ô nhập tin nhắn bị xóa liên tục khi gõ sau khi thêm cơ chế draft theo từng conversation.
- Thêm skeleton loading cho danh sách hội thoại khi tải lại Inbox, tránh nháy trạng thái empty state.
- Sửa hiện tượng màn hình trắng nháy một nhịp trước khi CSS và ứng dụng web được nạp.
- Thêm intro NHuuChat ngắn khi khởi động, chờ font sẵn sàng và dùng Suspense skeleton để tránh flash trắng.

## 2026-09-15

- Thêm backend thử nghiệm cho Zalo cá nhân: quản lý phiên QR, lưu credentials đã mã hóa, cô lập dữ liệu theo owner và chuẩn hóa tin nhắn inbound/outbound; đây là API không chính thức nên tài khoản có nguy cơ bị Zalo hạn chế hoặc khóa.
- Bổ sung migration thủ công, idempotent cho unique index conversation Zalo cá nhân; migration yêu cầu sao lưu database và chạy trong maintenance window trước khi rollout connector.
- Sửa Zalo cá nhân đọc caption/media từ attachment object thật của `zca-js`, dừng migration an toàn khi owner index không tương thích và chuẩn hóa lỗi tạo QR thành `ZALO_QR_CREATE_FAILED`; đồng bộ hướng dẫn vận hành trong README/Wiki.
- Hoàn thiện gán chatbot cho kênh đã kết nối, giữ lựa chọn chatbot sau khi tải lại và bảo vệ phạm vi owner/kênh.
- Thêm nút `Xuất bản`/`Gỡ xuất bản` để bật/tắt AI tự động trả lời theo từng chatbot.
- Cập nhật `lastMessageAt` và `lastMessageSnippet` của conversation sau khi nhân viên gửi tin, để sidebar sắp xếp đúng cả trước và sau khi reload.
- Sửa sidebar hội thoại: khôi phục khả năng cuộn, sắp xếp hội thoại mới nhất lên trước và xử lý khóa gửi tin cũ.
- Bổ sung kế hoạch và tài liệu cho tính năng gán chatbot vào kênh.
- Resolve entity Telegram cá nhân trước khi gửi tin để xử lý hội thoại không có user entity trong cache GramJS.

## 2026-09-14

- Kích hoạt chatbot tự động trên các kênh Telegram đã kết nối, có RAG đúng owner và cơ chế handoff/pause an toàn.
- Hoàn thiện xử lý ownership Telegram, media/file, knowledge legacy và các lỗi replay/concurrent inbound.
- Bổ sung chuẩn hóa dữ liệu, chống echo/trùng reply và giữ tin khách khi connector gửi lỗi.

## 2026-09-11

- Kết nối cài đặt Trợ lý AI với backend: model Gemini, gợi ý trả lời, trigger và cửa sổ cảm xúc 3/6/10 tin.
- Cập nhật fallback model Gemini, ngữ cảnh 6 tin nhắn và sửa responsive giao diện cài đặt.
- Ẩn scrollbar trên các vùng cuộn nhưng vẫn giữ thao tác cuộn.

## 2026-09-10

- Bổ sung gợi ý trả lời AI, quản lý thẻ hội thoại và UI Inbox responsive.
- Bổ sung hồ sơ người dùng, header cố định, avatar, nhận diện nền tảng và toast realtime.
- Cập nhật Wiki, tài liệu cấu hình Gemini và các kiểm thử liên quan.

## 2026-09-09

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
- Thêm route `/settings` và trang Cài đặt theo `DEVELOPMENT_PROMPT.md`, giữ nguyên header NhuuChat ở phía trên.
- Bổ sung tùy chọn chọn màu custom khi thêm thẻ hội thoại và lưu màu đã chọn cùng tag.
- Đặt `Cài đặt chung` làm tab hoạt động mặc định vì là mục đầu tiên trong Settings.
- Cập nhật icon riêng tương ứng cho từng option trong sidebar Cài đặt.
- Thêm gắn/bỏ nhiều thẻ trên từng hội thoại trong Inbox qua API có phân quyền admin/agent.

### Đã sửa

- Sửa lỗi GramJS biến yêu cầu mật khẩu 2FA thành `AUTH_USER_CANCEL`.
- Sửa lỗi gửi tin Telegram cá nhân trả `409 TELEGRAM_PERSONAL_DISCONNECTED` sau khi API restart bằng cách khôi phục session đã mã hóa từ MongoDB trước khi gửi.
- Khôi phục và đăng ký listener inbound cho toàn bộ session Telegram cá nhân đang active ngay khi API khởi động để tin nhắn từ Telegram được đồng bộ lên Inbox kể cả trước khi người dùng gửi tin từ web.
- Sửa lỗi Inbox mất message Telegram vừa nhận khi response lịch sử về sau ghi đè state realtime; lịch sử nay được merge không trùng và tự chọn hội thoại mới nhận qua Socket.IO.
- Thiết kế lại Dashboard kết nối kênh theo giao diện tham chiếu: bộ lọc nền tảng, card tài khoản, trạng thái rỗng và modal chọn kênh có QR Telegram cùng hướng dẫn 2FA.
- Bổ sung header NhuuChat màu navy trên Dashboard với logo thương hiệu, menu điều hướng và thông tin owner để khớp thiết kế tham chiếu.
- Căn lại Dashboard theo ảnh tham chiếu: bỏ margin mặc định của body, dùng font Arial, nền #F0F2F7 và giới hạn vùng nội dung trung tâm.
- Thay ký hiệu Unicode bằng SVG icon theo đúng nền tảng, gồm Telegram paper-plane, Zalo, Facebook, Instagram và WhatsApp; tăng kích thước chữ menu header.
- Làm lại modal “Thêm kết nối” theo prompt mới: backdrop blur, modal rộng 2 cột, sidebar 260px, item 64px, QR có corner bracket và hướng dẫn Telegram bằng tiếng Việt.
- Bổ sung bộ logo SVG màu thương hiệu cho các nền tảng kết nối và icon minh họa trong hướng dẫn QR.
- Cố định màu logo theo brand và thêm animation mở/đóng modal với fade, scale nhẹ, hover transition và hỗ trợ giảm chuyển động.
- Chuẩn hóa toàn bộ vị trí logo vào ô vuông bo góc 32px, dùng nhất quán trong sidebar, bộ lọc và hướng dẫn Telegram theo ảnh tham chiếu.
- Làm lại trang Hội thoại theo phương án 1: navigation sidebar 44px, conversation sidebar 395px, toolbar tìm kiếm/lọc/thêm, danh sách hội thoại có selected/unread/hover state và empty state Livechat ở vùng chat chính.
- Khi bấm tài khoản Telegram đã kết nối trên Dashboard, chuyển vào trang Hội thoại với bố cục Livechat mới; thêm composer và header hội thoại theo presentation layer hiện có.
- Giữ header NhuuChat dùng chung khi chuyển từ Dashboard sang trang Hội thoại; layout inbox nằm bên dưới header và tự chiếm phần chiều cao còn lại.
- Thêm `DEVELOPMENT_PROMPT.md` ở thư mục gốc để lưu prompt và handoff dài; agent chỉ đọc file khi người dùng yêu cầu trực tiếp.
