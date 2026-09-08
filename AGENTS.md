# AGENTS.md

Quy định dành cho coding agent làm việc trên project Nhuu-chat.

## Scope

Các quy định này áp dụng cho toàn bộ project `Nhuu-chat`.

## Project Context

- Đây là hệ thống quản lý chăm sóc khách hàng đa kênh và trợ lý AI RAG.
- MVP ưu tiên Telegram, inbox realtime, MongoDB, Redis và Socket.IO.
- Backend dùng Node.js, Express và TypeScript.
- Frontend dùng React, TypeScript và Socket.IO client.
- Các module chính gồm auth, channel connector, customer, conversation, message, realtime, knowledge, AI và jobs.
- Các giai đoạn sau có thể bổ sung Facebook, Instagram và Zalo; không tự ý triển khai ngoài phạm vi đã được duyệt.

## Required Workflow

- Đọc code và tài liệu liên quan trước khi thay đổi hành vi.
- Giữ thay đổi đúng phạm vi yêu cầu của người dùng.
- Tuân thủ cấu trúc, naming và quy ước hiện có của project.
- Không tích hợp Nhuu-chat vào repo shoe store.
- Không merge vào `main` nếu người dùng chưa yêu cầu rõ ràng.
- Không hoàn tác thay đổi của người dùng hoặc file dirty không liên quan.
- Sử dụng lệnh git không phá hủy dữ liệu.
- Chỉ đọc `DEVELOPMENT_PROMPT.md` khi người dùng yêu cầu trực tiếp.

## File Modification Rules

- Chỉ sửa các file cần thiết để hoàn thành yêu cầu.
- Không sửa file không liên quan.
- Không xóa file hiện có nếu chưa được yêu cầu rõ ràng.
- Không đổi tên hoặc di chuyển file nếu không cần thiết.
- Không sửa database schema hoặc migration nếu task không yêu cầu.
- Không sửa authentication, authorization hoặc security logic nếu task không yêu cầu.
- Không thay đổi API contract nếu chưa được yêu cầu rõ ràng.
- Không thêm hoặc thay đổi dependency/package version nếu không cần thiết và chưa giải thích rõ.
- Không sửa environment file hoặc secret.
- Không sửa test chỉ để làm test pass; chỉ sửa khi test sai và phải giải thích lý do.
- Không refactor hoặc viết lại code không liên quan.
- Không thay đổi UI/UX ngoài phạm vi yêu cầu.

## Changelog Rule

- Mọi thay đổi có ý nghĩa về code, UI, database, cấu hình hoặc tài liệu phải cập nhật `CHANGELOG.md`.
- Giữ tên file là `CHANGELOG.md`.
- Viết nội dung changelog bằng tiếng Việt.
- Đặt `CHANGELOG.md` tại thư mục gốc project.
- Thêm thay đổi hiện tại dưới mục `## Chưa phát hành`.
- Chỉ chuyển nội dung chưa phát hành sang mục ngày cụ thể khi người dùng yêu cầu release hoặc finalize.

## Documentation Rule

- Mỗi hệ thống hoặc feature mới phải cập nhật `README.md` với setup, cách dùng, trạng thái hiện tại và giới hạn đã biết.
- Mỗi hệ thống hoặc feature mới phải cập nhật Wiki từ nội dung README.
- Duy trì nguồn Wiki local dưới `docs/wiki/` trước khi đồng bộ lên repository Wiki.
- Tài liệu phải ghi rõ phần đã hoàn thành, phần đang làm và kế hoạch tiếp theo.

## Documentation Layout

- Dùng `docs/requirements/` cho PRD, SRS và yêu cầu nghiệp vụ.
- Dùng `docs/superpowers/specs/` cho product spec và quyết định kiến trúc.
- Dùng `docs/superpowers/plans/` cho implementation plan.
- Không dùng `docs/superpowers/` làm changelog chính của project.
- Không tự động đọc, sửa hoặc ghi đè `DEVELOPMENT_PROMPT.md`.

## Security and Reliability

- Không commit token Telegram, API key, JWT secret, encryption key hoặc dữ liệu bí mật.
- Token và secret phải được mã hóa at rest theo thiết kế đã duyệt.
- Webhook phải kiểm tra secret/signature và xử lý idempotency.
- API phải có xác thực, phân quyền, validation và rate limit phù hợp.
- RAG không được tự bịa thông tin khi knowledge base không có dữ liệu hỗ trợ.
- Outbound message phải có retry có giới hạn và trạng thái lỗi có thể truy vết.

## Verification

- Chạy test tập trung cho khu vực đã thay đổi khi khả thi.
- Chạy test rộng hơn/build khi thay đổi ảnh hưởng đến routing, auth, database, API contract hoặc user flow.
- Kiểm tra `git diff --check` trước khi báo hoàn tất.
- Nếu không chạy được một bước kiểm chứng, phải nêu rõ lý do.
- Không gọi là hoàn tất nếu mới chỉ kiểm tra trên local mà chưa nêu giới hạn môi trường.

## Communication

- Báo rõ file đã sửa, kết quả kiểm chứng và rủi ro còn lại.
- Nêu các file dirty không liên quan được giữ nguyên.
- Ưu tiên cập nhật ngắn gọn bằng tiếng Việt.
