# Thiết kế cài đặt giao diện

## Mục tiêu

Biến mục **Cài đặt → Giao diện** từ trạng thái “Sắp có” thành nơi mỗi tài khoản chọn cách hiển thị NhuuChat, xem trước thay đổi và khôi phục giá trị mặc định.

## Phạm vi đã duyệt

- Chế độ giao diện: Sáng, Tối, Theo thiết bị.
- Màu nhấn: Xanh dương (mặc định), Cyan, Tím, Xanh lá, Hồng.
- Mật độ danh sách hội thoại: Thoải mái (mặc định) hoặc Gọn.
- Cỡ chữ nội dung tin nhắn: Nhỏ, Vừa (mặc định), Lớn.
- Khu vực xem trước cập nhật theo các lựa chọn hiện tại.
- Khôi phục mặc định đưa mọi tuỳ chọn về giá trị mặc định và lưu lại.

## Thiết kế kỹ thuật

- Dùng endpoint `GET/PATCH /api/v1/me/general-settings` hiện có. Thêm các trường giao diện vào `GeneralSettingsContract`, bộ chuẩn hoá, schema Mongoose và Zod patch schema; dữ liệu cũ thiếu các trường mới nhận mặc định khi đọc, không cần migration.
- Tuỳ chọn thuộc `User.generalSettings`, vì vậy mỗi thành viên tự chọn giao diện và lựa chọn được đồng bộ khi đăng nhập trên thiết bị khác.
- `App` áp dụng cấu hình lúc tải phiên và nghe sự kiện cập nhật cài đặt chung. `themeMode: system` theo dõi `prefers-color-scheme`; đăng xuất đặt document về mặc định.
- Gắn `data-theme`, `data-accent`, `data-density` và `data-message-size` lên `document.documentElement`. CSS dùng các thuộc tính này cho màu nền/văn bản/border chính, màu nhấn, chiều cao/dãn cách item hội thoại và cỡ chữ nội dung tin.
- Panel cập nhật giao diện ngay khi người dùng chọn và lưu lần lượt theo field qua API. Khi lưu lỗi, phục hồi giá trị đã lưu gần nhất, hiển thị lỗi và cho phép thử lại. Nút mặc định gửi một patch chứa toàn bộ giá trị mặc định.
- Phần xem trước là mẫu danh sách hội thoại và bong bóng tin, dùng cùng `data-*` hiện hành để phản ánh lựa chọn đang thử.

## Ngoài phạm vi

- Tuỳ chỉnh mã màu tự do, font toàn ứng dụng, giảm animation, layout dashboard hoặc thay đổi quyền Workspace.
- Đổi giao diện landing page công khai theo tuỳ chọn đã đăng nhập.

## Tiêu chí nghiệm thu

- Mục Giao diện có thể mở từ điều hướng desktop và mobile.
- Mỗi lựa chọn được áp dụng tức thì, lưu theo tài khoản; cấu hình Theo thiết bị phản ứng khi hệ điều hành đổi theme.
- Xem trước phản ánh theme, màu nhấn, mật độ và cỡ chữ; khôi phục mặc định áp dụng và lưu đủ bốn trường.
- Dữ liệu người dùng cũ nhận mặc định hợp lệ. Patch giá trị ngoài enum bị từ chối.
- Test API, test panel/state, build web và `git diff --check` đạt.
