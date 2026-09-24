# Kế hoạch: thao tác hàng loạt hội thoại

## Mục tiêu

Cho phép chọn nhiều hội thoại trong Inbox để đánh dấu đã đọc, chưa đọc hoặc xóa; giữ header và thao tác từng hội thoại hiện có khi chưa bật chế độ chọn.

## Các bước

1. Thêm kiểm thử cho schema/route bulk và helper quản lý lựa chọn; xác nhận kiểm thử thất bại trước khi triển khai.
2. Thêm endpoint có kiểm tra quyền truy cập Workspace hiện hành, giới hạn 100 ID, cập nhật trạng thái đọc và xóa hội thoại cùng dữ liệu phụ thuộc.
3. Thêm toolbar, checkbox từng dòng/chọn tất cả hội thoại đang lọc, trạng thái đang xử lý và nút thoát chế độ chọn.
4. Nối giao diện với endpoint, đồng bộ xóa/cập nhật trạng thái trong Inbox và realtime.
5. Chạy focused tests, build, `git diff --check`; rà soát diff, commit và push nhánh hiện tại.

## Giới hạn và quyết định

- “Chọn tất cả” chỉ chọn các dòng đang hiển thị sau lọc/tìm kiếm.
- Bulk API từ chối toàn bộ thao tác nếu thiếu hoặc không được phép truy cập bất kỳ ID nào.
- Xóa bản ghi hội thoại, tin nhắn, ghi chú và trạng thái BotProcessing; giữ hồ sơ khách hàng dùng chung và tài nguyên đính kèm bên ngoài.
