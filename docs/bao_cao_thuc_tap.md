# Báo cáo thực tập: Phân tích và phát triển hệ thống Nhuu-chat

> **Lưu ý điền thông tin:** Tài liệu này mô tả sản phẩm và quy trình kỹ thuật dựa trên source repository. Tên đơn vị thực tập, người hướng dẫn, thời gian, nhật ký thực tế và minh chứng cá nhân chưa được cung cấp nên được để dạng placeholder. Nội dung về quy trình là khung báo cáo cần đối chiếu với hoạt động thực tế, không tự nhận là nhật ký đã diễn ra.

## Thông tin thực tập

| Trường thông tin | Nội dung |
|---|---|
| Sinh viên | `[Bổ sung họ tên, mã sinh viên]` |
| Trường / khoa / ngành | `[Bổ sung]` |
| Đơn vị thực tập | `[Bổ sung tên đơn vị]` |
| Người hướng dẫn tại đơn vị | `[Bổ sung]` |
| Giảng viên hướng dẫn | `[Bổ sung]` |
| Thời gian thực tập | `[Bổ sung ngày bắt đầu – ngày kết thúc]` |
| Đề tài | Phân tích và phát triển hệ thống quản lý hội thoại đa kênh Nhuu-chat |

## 1. Giới thiệu đơn vị và bài toán

### 1.1 Bối cảnh nghiệp vụ

Shop và doanh nghiệp nhỏ thường tiếp nhận câu hỏi, đơn hàng và yêu cầu hỗ trợ từ nhiều kênh. Khi mỗi kênh được xử lý trong một ứng dụng riêng, nhân viên phải chuyển đổi liên tục, khó theo dõi tin chưa đọc, dễ bỏ lỡ hội thoại và thiếu một lịch sử tập trung để bàn giao.

Nhuu-chat hướng tới một Inbox hợp nhất để nhân viên có thể xem và xử lý hội thoại trong cùng giao diện. Hệ thống cũng cần phản ánh đúng nguồn tin, Page/kênh tương ứng, chủ sở hữu dữ liệu và người có quyền truy cập. Các connector trong source gồm Facebook Messenger, Telegram Bot, Telegram cá nhân và Zalo cá nhân thử nghiệm; hỗ trợ cụ thể khác nhau theo connector.

### 1.2 Mục tiêu nghiệp vụ

- Tập trung luồng hội thoại thay vì buộc nhân viên thao tác từng nền tảng riêng.
- Cho phép Workspace cấp thành viên theo Page/kênh phù hợp với công việc.
- Cập nhật Inbox gần thời gian thực khi backend nhận sự kiện.
- Giữ dữ liệu và thông tin xác thực ở đúng phạm vi owner/Workspace.
- Cung cấp giao diện dùng được trên desktop và điện thoại.

### 1.3 Phạm vi thực tập cần xác nhận

Sinh viên cần bổ sung phần việc bản thân thực hiện, phần việc nhóm thực hiện và các mốc đã được đơn vị xác nhận. Repository phản ánh trạng thái source hiện tại, nhưng không cho biết chính xác ai đã viết từng phần hoặc ngày thực hiện. Không nên quy toàn bộ implementation hiện hữu thành kết quả cá nhân nếu chưa đối chiếu lịch sử git, phân công và xác nhận người hướng dẫn.

## 2. Quy trình làm việc

### 2.1 Phân tích yêu cầu

Quy trình đề xuất bắt đầu bằng việc xác định tác nhân (owner, admin, staff, khách hàng), luồng dữ liệu và ranh giới tin cậy. Với yêu cầu phân quyền, cần trả lời: ai chọn Workspace, quyền gắn với user hay membership, danh sách kênh biểu diễn ra sao, API nào trả hội thoại và Socket room nào có thể tham gia.

Đối với yêu cầu giao diện mobile, cần phân tách trạng thái điều hướng có thể khôi phục (route, tab, conversation ID) với trạng thái tạm thời (modal đang mở, sidebar/list đang bật). Trạng thái quan trọng nên nằm trên URL hoặc storage có scope rõ; server vẫn phải xác minh session sau khi trang khởi động lại.

### 2.2 Lập kế hoạch và chia lớp triển khai

Một quy trình triển khai phù hợp với kiến trúc này:

1. Đọc `README.md`, PRD/SRS, tài liệu Workspace và source liên quan.
2. Xác định model/service/router/middleware/frontend cần thay đổi.
3. Viết acceptance criteria, đặc biệt cho quyền cho phép và từ chối.
4. Bổ sung test tập trung cho trường hợp thành công, sai Workspace, channel không được cấp và session hết hiệu lực.
5. Triển khai backend trước ranh giới bảo mật, rồi nối UI vào API đã lọc.
6. Kiểm tra Socket.IO cùng quyền REST để tránh hai đường truy cập khác nhau.
7. Chạy test liên quan, typecheck/build và kiểm tra diff; lưu lại lỗi môi trường riêng.
8. Cập nhật tài liệu/changelog theo quy ước repository và chỉ đưa đúng file của task vào commit.

Các bước trên là quy trình kỹ thuật phù hợp; trong báo cáo chính thức cần thay bằng quy trình thực tế của kỳ thực tập nếu khác.

## 3. Nghiệp vụ phân quyền Workspace

### 3.1 Phân biệt vai trò

`User.role` (`admin`, `agent`, `customer`) là role hệ thống. Vai trò trong Workspace được lưu trên `WorkspaceMember` (`owner`, `admin`, `staff`). Quyền kênh được lưu theo membership, không nằm trên User.

Trong mô hình hiện tại, owner và admin có thể xem các kênh của Workspace; staff có thể bị giới hạn vào các channel đã gán. `allowedChannels` biểu diễn danh sách đa kênh theo platform và channel ID. `allowedPages` là trường tương thích cho Facebook Page cũ và được chuyển thành quyền Facebook khi đọc. Danh sách quyền rỗng theo quy ước hiện hành biểu thị không giới hạn; vì cách hiểu “rỗng = tất cả” dễ gây nhầm, UI cần ghi rõ ý nghĩa khi cấp quyền.

### 3.2 Các bước xử lý truy cập

1. Người dùng đăng nhập và backend xác minh AuthSession.
2. Request chỉ định Workspace; middleware kiểm tra membership của user trong Workspace đó.
3. Service xây phạm vi kênh theo role và danh sách kênh được gán.
4. API truy vấn conversation với đồng thời điều kiện owner và channel scope.
5. Socket handshake xác minh cùng identity/Workspace; join conversation và phát Inbox event tiếp tục qua kiểm tra quyền.

Sai sót thường gặp cần tránh là chỉ ẩn một Page trong dropdown frontend trong khi endpoint danh sách hội thoại vẫn trả dữ liệu; hoặc chỉ lọc theo Page ID mà thiếu điều kiện owner. Quyền phải được áp dụng từ query/backend và được kiểm tra lại cho thao tác realtime.

## 4. Trải nghiệm người dùng và giao diện mobile

### 4.1 Chống zoom ngoài ý muốn

Trên Safari iOS, input có cỡ chữ nhỏ hơn 16px có thể khiến trình duyệt phóng to trang khi người dùng focus. Source áp dụng cỡ chữ tối thiểu 16px cho input, select và textarea ở màn hình nhỏ. Đây là điều chỉnh CSS tại component/global style, không phải JavaScript chặn thao tác pinch zoom; không nên vô hiệu hóa khả năng phóng to accessibility của trình duyệt.

### 4.2 Modal phân quyền

Modal thêm thành viên cần diễn đạt rõ email, vai trò và phạm vi kênh. Khi danh sách có nhiều nền tảng, nhóm kênh theo platform giúp giảm nhầm lẫn giữa Facebook Page, Zalo OA, Telegram hoặc tài khoản cá nhân. Trạng thái lưu/đang gửi/lỗi phải có phản hồi, overlay không nên làm mất ngữ cảnh đang quản lý và modal cần đóng được bằng nút rõ ràng.

Phần quyền nên trình bày phạm vi được cấp và ý nghĩa danh sách rỗng một cách tường minh. Không nên để một dropdown trông như có thể sửa owner nếu backend không cho phép; owner nên được thể hiện dạng badge tĩnh và không hiển thị thao tác xóa.

### 4.3 Khôi phục giao diện sau khi quay lại trình duyệt

URL là nơi phù hợp cho route cài đặt và ID hội thoại. Session storage phù hợp cho trạng thái tạm thời trong một tab như sidebar/list mở hay đóng. Workspace đang hoạt động có thể lưu theo người dùng; khi đổi Workspace, cần xóa dữ liệu/hội thoại cũ và khởi tạo socket mới. Storage chỉ phục hồi giao diện, không cấp quyền: server vẫn phải kiểm tra session và membership.

Trình duyệt di động có thể hủy tab khi thiếu bộ nhớ. Không thể bảo đảm tab luôn còn trong RAM; mục tiêu thực tế là khi tab được khởi động lại, URL/storage đưa người dùng về ngữ cảnh gần nhất và API khôi phục dữ liệu hợp lệ. Khi workspace hoặc quyền đã thay đổi, dữ liệu cũ không được giữ như bằng chứng quyền.

## 5. Kinh nghiệm kỹ thuật và xử lý lỗi

### 5.1 Debug theo nguyên nhân

Khi Dashboard nhân viên không hiển thị kênh, cần kiểm tra lần lượt: membership đã được tạo chưa; header Workspace có đúng ID không; API directory có lọc quyền không; service có ánh xạ `allowedPages` cũ không; frontend có đang gọi endpoint của session cá nhân thay vì endpoint Workspace không; và conversation API có dùng cùng access filter không.

Khi tin realtime không tới, phân biệt lỗi provider webhook, lưu message, phát Socket event, quyền nhận room và trạng thái kết nối client. Một reconnect thành công không tự chứng minh user có quyền đọc conversation; join và recipient selection vẫn phải authorize.

### 5.2 Hiệu suất và độ tin cậy

- Dùng index cho định danh session, quan hệ membership và các truy vấn có tần suất cao.
- Tránh tải toàn bộ danh sách message/conversation khi chỉ cần phần hiện tại; dùng phân trang nếu endpoint hỗ trợ.
- Tách reconnect Socket khỏi reload toàn trang; dọn socket cũ khi chuyển Workspace.
- Không đưa secret lên frontend; token refresh chỉ lưu dưới dạng hash trong persistence theo session.
- Ghi nhận trạng thái gửi message (pending/sent/delivered/failed) để người vận hành phân biệt lỗi gửi với lỗi hiển thị.
- Kiểm thử quyền âm tính: nhân viên không được gán kênh không thể lấy conversation bằng cách tự sửa URL/API.

### 5.3 Bài học

1. **UI không phải ranh giới bảo mật.** Quyền cần được kiểm tra tại API và Socket.
2. **Vai trò hệ thống và vai trò tổ chức là hai khái niệm khác nhau.** Tách User và WorkspaceMember giúp mô hình rõ hơn.
3. **Trạng thái trống cần có ngữ nghĩa được giải thích.** `allowedChannels=[]` mang nghĩa unrestricted theo convention hiện tại, không phải không được truy cập.
4. **Realtime cần cùng một access policy với REST.** Nếu không, UI có thể lọc đúng ban đầu nhưng vẫn lộ dữ liệu qua event.
5. **Khả năng khôi phục khác với khả năng ngăn tab bị hủy.** URL/sessionStorage giảm mất ngữ cảnh nhưng không kiểm soát bộ nhớ của trình duyệt.
6. **Tài liệu phải phân biệt yêu cầu và implementation.** PRD/SRS là nguồn yêu cầu; source, test và vận hành mới chứng minh trạng thái hoàn thành.

## 6. Kết quả và giới hạn

Source hiện thể hiện một ứng dụng full-stack có auth, Workspace RBAC, các connector đa kênh, Inbox realtime và giao diện responsive. Tuy nhiên mức độ sẵn sàng khác nhau theo kênh; Instagram chưa được khẳng định có adapter gửi đầy đủ, Zalo cá nhân được đánh dấu thử nghiệm, còn các tích hợp live phụ thuộc credential/app review và môi trường. Cần điền kết quả thực tập cá nhân, ảnh màn hình/test log và xác nhận đơn vị trước khi nộp.

## 7. Đề xuất hoàn thiện báo cáo chính thức

- Điền thông tin trường, sinh viên, đơn vị và người hướng dẫn.
- Thay các mô tả quy trình đề xuất bằng sự kiện thực tế có ngày và minh chứng.
- Chọn đúng commit/version được hội đồng đánh giá; chạy lại test/build trên version đó.
- Chụp ảnh UI và sơ đồ chỉ từ dữ liệu không nhạy cảm; che email, token, Page ID thật nếu thuộc khách hàng.
- Xin xác nhận đơn vị về nội dung được phép công bố.

## Tài liệu nội bộ

- [README](../README.md)
- [Wiki Workspace/Page access](wiki/workspace-page-access.md)
- [Báo cáo đồ án tốt nghiệp](bao_cao_do_an_tot_nghiep.md)
- [Nhật ký công việc 10 tuần — lộ trình mẫu](nhat_ky_cong_viec_10_tuan.md)
