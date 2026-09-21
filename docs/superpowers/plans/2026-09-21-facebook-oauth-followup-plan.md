# Facebook OAuth Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện kiểm chứng cho luồng Facebook OAuth mà không thay đổi luồng kết nối thủ công Page ID/Page Access Token.

**Architecture:** OAuth dùng state có TTL trong Redis, token tạm được mã hóa; callback chỉ trả selection token và metadata Page, còn việc chọn Page gọi lại `FacebookPageService.connect`. Frontend giữ form thủ công tại trang Bài viết và chỉ thêm OAuth vào modal Dashboard.

**Tech Stack:** Node.js, Express, Redis, TypeScript, React, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-21-facebook-page-publishing-design.md` và quyết định OAuth đã được xác nhận trong hội thoại.

## Global Constraints

- Không thay đổi `POST /api/v1/facebook-page/connection` hoặc form nhập thủ công.
- Không trả Page access token/User access token về browser.
- OAuth state và selection hết hạn sau 10 phút.
- Mọi OAuth route yêu cầu đúng user đã xác thực, ngoại trừ callback Meta.
- Chỉ cho chọn Page có task `CREATE_CONTENT`.
- Không stage hoặc sửa các file dirty ngoài phạm vi OAuth.

### Task 1: Backend OAuth flow

**Status:** complete in commit `068d1ca`.

- [x] Service tạo state, đổi code, lấy Page và chọn Page.
- [x] Route start/callback/pages/select.
- [x] Test state, token redaction, callback controller và owner scope.

### Task 2: Dashboard OAuth modal

**Status:** complete in commit `068d1ca`.

- [x] Nút đăng nhập Facebook trong modal.
- [x] Chọn Page sau callback.
- [x] Giữ nguyên luồng thủ công trong trang Bài viết.
- [x] Frontend build và regression tests.

### Task 3: Bổ sung test boundary cho Redis store và OAuth API client

**Files:**
- Create: `apps/api/src/services/facebook-oauth.store.test.ts`
- Modify: `apps/web/src/lib/facebook-publishing.api.test.ts`
- Modify: `apps/web/src/components/dashboard/ConnectModal.test.tsx`

**Acceptance:** test mã hóa/giải mã state trong store bằng fake Redis; test ba API OAuth gửi đúng method/path/body và credentials; test nguồn modal không chứa field token thủ công.

- [ ] Viết test đỏ.
- [ ] Chạy test tập trung và xác nhận fail đúng vì thiếu coverage/behavior.
- [ ] Implement tối thiểu nếu test phát hiện lỗi production.
- [ ] Chạy test xanh, build và diff check.
- [ ] Commit riêng task.

### Task 4: Sửa lifecycle selection OAuth

**Files:**
- Modify: `apps/api/src/services/facebook-oauth.service.ts`
- Modify: `apps/api/src/services/facebook-oauth.service.test.ts`

**Acceptance:** đọc danh sách không gia hạn quá hạn; sai owner không xóa selection; chọn Page có thể retry khi persistence thất bại; selection thành công chỉ consume một lần.

### Task 5: Tăng độ bền Redis OAuth

**Files:**
- Modify: `apps/api/src/services/facebook-oauth.store.ts`
- Modify: `apps/api/src/services/facebook-oauth.store.test.ts`
- Modify: `apps/api/src/server.ts`

**Acceptance:** Redis operation có timeout, lỗi được chuyển thành lỗi hữu hạn/sanitized và shutdown không bị treo khi Redis unavailable.

### Task 6: Hoàn thiện Page pagination và trạng thái modal

**Files:**
- Modify: `apps/api/src/services/facebook-oauth.service.ts`
- Modify: `apps/api/src/services/facebook-oauth.service.test.ts`
- Modify: `apps/web/src/components/dashboard/ConnectModal.tsx`
- Modify: `apps/web/src/components/dashboard/ConnectModal.test.tsx`

**Acceptance:** lấy đủ các trang Graph API với giới hạn an toàn; modal có success state, xử lý selection hết hạn và cho phép đăng nhập lại.

### Task 7: Bổ sung behavioral security tests

**Files:**
- Modify: `apps/api/src/controllers/facebook-page.controller.test.ts`
- Modify: `apps/api/src/services/facebook-oauth.service.test.ts`
- Modify: `apps/web/src/components/dashboard/ConnectModal.test.tsx`

**Acceptance:** test executable cho replay/expired state, wrong-owner, non-publishable Page, callback error redirect và modal completion.

### Task 8: Làm bền vòng đời Redis OAuth

**Acceptance:** timeout khi connect/handshake không để client ở trạng thái kẹt; shutdown luôn đóng socket hữu hạn; có test mô phỏng đúng lifecycle của Redis client.

### Task 9: Làm nhất quán thao tác chọn Page OAuth

**Acceptance:** sau khi lưu kết nối thành công, lỗi dọn selection không làm báo thất bại hoặc cho phép persistence lặp; trạng thái claim/consume được xử lý idempotent trong giới hạn kiến trúc hiện tại.

### Task 10: Giới hạn thời gian gọi Meta Graph

**Acceptance:** token exchange và từng request phân trang có abort/deadline hữu hạn, lỗi được chuẩn hóa, state đã consume không làm callback treo vô hạn.

### Task 11: Hoàn thiện retry và tài liệu OAuth

**Acceptance:** lỗi tạm thời khi chọn Page giữ picker để retry; selection hết hạn vẫn yêu cầu đăng nhập lại; không có Page publishable có hướng dẫn/recovery; README không còn mâu thuẫn với tính năng.

### Task 12: Hủy Redis connect đang chờ khi shutdown

**Acceptance:** shutdown hủy/đóng được cả kết nối Redis đã bắt đầu nhưng còn chờ DNS/TCP; không mở socket sau khi `close()` hoàn tất; có regression test lifecycle thực tế.

### Task 13: Giới hạn Graph validation khi chọn Page

**Acceptance:** thao tác OAuth select Page không bị treo ở bước validate Page; timeout/network được chuẩn hóa và không lưu kết nối muộn sau khi request đã hủy; luồng nhập thủ công vẫn giữ nguyên contract.

### Task 14: Đồng bộ tài liệu wiki OAuth

**Acceptance:** tài liệu wiki không còn nói Facebook OAuth ngoài MVP khi phần hướng dẫn đã mô tả luồng này; vẫn nêu đúng phạm vi Instagram OAuth chưa hỗ trợ.
