# Nhuu-chat Rules Supplement

Đọc và áp dụng `AGENTS.md` ở thư mục root trước. File này chỉ bổ sung quy tắc đặc thù cho hai folder trong cùng dự án, không thay thế hoặc lặp lại `AGENTS.md`.

## BE — `apps/api/`

- Giữ ranh giới hiện có giữa `routes`, `controllers`, `services`, `schemas`, `models` và `lib`.
- Không thêm hành vi Facebook, Instagram hoặc Zalo nếu task chưa cho phép rõ ràng.
- Với Telegram, giữ validation webhook, idempotency, retry có giới hạn và khôi phục session an toàn.
- Tin inbound/outbound phải chống ghi trùng, truy vết được và chỉ phát Socket.IO event sau khi persistence thành công.
- Lỗi avatar, provider hoặc đồng bộ Telegram không được làm dừng worker.
- Thay đổi controller/service/schema/connector/realtime phải có test Vitest tập trung cho behavior chính và failure path.

## FE — `apps/web/`

- Dùng React, TypeScript, Tailwind CSS v4 và pattern component/state hiện có.
- Giữ text giao diện tiếng Việt, nhận diện NhuuChat và cấu trúc Inbox hiện có.
- Mọi thay đổi UI phải kiểm tra desktop, narrow desktop và mobile; không tạo breakpoint riêng nếu không cần thiết.
- Giữ rõ các trạng thái loading, empty, error, disabled, fallback và realtime.
- Không hardcode dữ liệu API-backed; không tạo CSS page-specific khi utility Tailwind hiện có đáp ứng được.
- Khi sửa Inbox, phải bảo toàn avatar fallback, platform identity, message alignment và guard chống stale async response.
- Drawer, dialog, menu và resize handle phải dùng semantic control, aria label và hỗ trợ keyboard.
- Thay đổi behavior hoặc responsive phải có regression test frontend.

## Verification bổ sung

- BE: chạy test tập trung cho module backend đã sửa.
- FE: chạy test tập trung và production build khi sửa UI hoặc user flow.
