# Automation Template Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép import hàng loạt kịch bản trả lời tự động từ file `.xlsx` hoặc `.csv` với bốn cột tối giản, xem trước và xác nhận trước khi lưu.

**Architecture:** Frontend đọc file bằng parser dùng chung cho CSV/XLSX, chuẩn hóa thành các dòng có bốn trường và hiển thị lỗi trước khi gửi. Backend cung cấp endpoint bulk import được bảo vệ theo owner/assistant, kiểm tra lại dữ liệu và lưu một lần; các trường nâng cao dùng giá trị mặc định. CRUD hiện tại không thay đổi.

**Tech Stack:** React, TypeScript, Vitest, Express, Zod, Mongoose, thư viện `xlsx` phía web.

**Spec:** Phạm vi đã được người dùng chốt trong hội thoại ngày 2026-09-16: bốn cột `Tên mẫu`, `Từ khóa`, `Nội dung trả lời`, `Đang bật`; có xem trước và chỉ lưu sau xác nhận.

## Global Constraints

- Chỉ hỗ trợ bốn cột: `Tên mẫu`, `Từ khóa`, `Nội dung trả lời`, `Đang bật`.
- File phải có dòng tiêu đề; giới hạn tối đa 500 dòng dữ liệu.
- `Đang bật` nhận `Có/Không`, `Yes/No`, `true/false`, `1/0`; giá trị khác là lỗi dòng.
- Mỗi dòng phải có tên, ít nhất một từ khóa và nội dung trả lời.
- Mặc định khi import: `priority: 0`, `allowAiRewrite: false`, `channelScope: { mode: "all" }`.
- Không tự động lưu khi chọn file; chỉ gửi API sau khi người dùng bấm xác nhận.
- Không stage hoặc sửa các file dirty có sẵn ngoài phạm vi.

### Task 1: Parser và contract dữ liệu import

**Files:**
- Create: `apps/web/src/lib/automation-template-import.ts`
- Test: `apps/web/src/lib/automation-template-import.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces `parseAutomationTemplateFile(file: File): Promise<AutomationTemplateImportPreview>`.
- Mỗi dòng hợp lệ có `{ name: string; keywords: string[]; responseTemplate: string; enabled: boolean }`.
- Mỗi lỗi có `{ row: number; message: string }`.

- [ ] Viết test đỏ cho CSV hợp lệ, boolean hợp lệ, thiếu cột, dòng thiếu dữ liệu, từ khóa trùng trong cùng file và quá 500 dòng.
- [ ] Chạy `pnpm exec vitest run apps/web/src/lib/automation-template-import.test.ts` để xác nhận test chưa pass vì parser chưa tồn tại.
- [ ] Thêm dependency `xlsx` vào `apps/web/package.json` và cài lockfile tương ứng.
- [ ] Implement parser: đọc sheet đầu tiên của XLSX, đọc CSV qua cùng thư viện, map header không phân biệt hoa thường/dấu cách, chuẩn hóa keywords theo dấu phẩy, giữ số dòng Excel trong lỗi.
- [ ] Chạy lại test parser và kiểm tra file `.xlsx` mẫu tối thiểu được đọc đúng.
- [ ] Commit riêng task parser sau khi test pass.

### Task 2: API schema, service và endpoint bulk import

**Files:**
- Modify: `apps/api/src/schemas/automation-template.schemas.ts`
- Modify: `apps/api/src/services/automation-template.service.ts`
- Modify: `apps/api/src/controllers/automation-template.controller.ts`
- Modify: `apps/api/src/routes/assistants.routes.ts`
- Test: `apps/api/src/controllers/automation-template.controller.test.ts`
- Test: `apps/api/src/services/assistant.service.test.ts` hoặc test service automation template phù hợp

**Interfaces:**
- Endpoint: `POST /api/v1/assistants/:assistantId/templates/import`.
- Request body: `{ templates: Array<{ name: string; keywords: string[]; responseTemplate: string; enabled: boolean }> }`.
- Response: `{ imported: number; templates: AutomationTemplateContract[] }`.

- [ ] Viết test đỏ cho owner/assistant isolation, payload hợp lệ, payload quá 500 dòng, thiếu trường, và không tạo bản ghi khi payload lỗi.
- [ ] Chạy focused API tests để xác nhận test đỏ hoặc bị giới hạn bởi Mongo test runtime hiện tại.
- [ ] Thêm schema giới hạn 500 dòng và giới hạn độ dài từng trường; chuẩn hóa lỗi thành `INVALID_REQUEST`.
- [ ] Thêm service xác nhận assistant thuộc owner, dùng `insertMany` với defaults `priority: 0`, `allowAiRewrite: false`, `channelScope.mode: "all"`.
- [ ] Thêm controller và route đặt trước route `/:templateId` để không bị bắt nhầm tham số.
- [ ] Chạy controller/service tests; giữ nguyên endpoint CRUD hiện tại.
- [ ] Commit riêng task API sau khi test pass.

### Task 3: Modal import, preview và xác nhận trên Settings

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Test: `apps/web/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Nút `Import kịch bản` nằm cạnh `+ Thêm mẫu chào`.
- Modal nhận preview từ parser, hiển thị số dòng hợp lệ/lỗi, lỗi theo số dòng và hai nút `Hủy`/`Import`.
- Chỉ gọi endpoint bulk sau khi người dùng xác nhận; import xong cập nhật danh sách của trợ lý đang chọn.

- [ ] Viết regression test đỏ cho nút import, accept `.xlsx,.csv`, hiển thị preview và gọi đúng endpoint sau xác nhận.
- [ ] Implement input file ẩn, reset input sau mỗi lần chọn, trạng thái đang đọc/đang import và thông báo lỗi tiếng Việt.
- [ ] Không cho xác nhận nếu còn lỗi hoặc không có dòng hợp lệ; không đóng modal khi parser/API lỗi.
- [ ] Gửi `{ templates }` đến `/api/v1/assistants/${selected.id}/templates/import`, nối kết quả vào state hiện tại.
- [ ] Thêm comment tiếng Việt ngắn cho phần xử lý import có logic đáng chú ý.
- [ ] Chạy web focused tests và production build.
- [ ] Commit riêng task UI sau khi test pass.

### Task 4: Hậu kiểm và bàn giao

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Kiểm tra diff chỉ gồm các file của feature và không stage các thay đổi dirty có sẵn.
- [ ] Chạy parser/API/UI focused tests, production build web và `git diff --check`.
- [ ] Kiểm tra thủ công định dạng cột và trạng thái xác nhận bằng một CSV mẫu không chứa dữ liệu bí mật.
- [ ] Cập nhật changelog: import kịch bản tự động từ CSV/XLSX với preview và validation.
- [ ] Tạo commit cuối cho changelog/hậu kiểm nếu còn thay đổi chưa commit.
- [ ] Báo commit hash và hỏi người dùng trước khi push; không tự merge.
