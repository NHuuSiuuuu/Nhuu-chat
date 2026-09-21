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
