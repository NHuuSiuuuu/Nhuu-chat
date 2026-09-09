# Telegram Personal QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng kết nối tài khoản Telegram cá nhân bằng QR MTProto, sau đó đồng bộ và gửi tin nhắn qua Inbox.

**Architecture:** Backend tạo QR login token bằng GramJS/MTProto, giữ client session theo từng user và mã hóa session trước khi lưu MongoDB. Frontend chỉ nhận QR URL và trạng thái kết nối; Bot API hiện tại được giữ độc lập.

**Tech Stack:** Node.js, Express, TypeScript, MongoDB/Mongoose, React/Vite, GramJS (`telegram`), QR URL `tg://login`.

**Spec:** `docs/superpowers/specs/2026-09-08-nhuu-chat-design.md` và Telegram QR Login API chính thức.

## Global Constraints

- Không dùng QR để lấy cookie hoặc mật khẩu; chỉ dùng MTProto QR Login chính thức.
- `api_id`, `api_hash` và MTProto session chỉ tồn tại ở backend; session phải mã hóa at rest.
- QR login token phải có thời hạn và trạng thái lỗi rõ ràng.
- Telegram Bot API và Telegram Personal API là hai provider riêng.
- Không tự động đọc/gửi dữ liệu ngoài tài khoản Telegram đã được người dùng xác nhận.
- Mọi thay đổi phải ghi vào `CHANGELOG.md` bằng tiếng Việt.

### Task 1: Personal Telegram session model and QR service

**Files:**
- Create: `apps/api/src/channels/telegram-personal/telegram-personal.model.ts`
- Create: `apps/api/src/channels/telegram-personal/telegram-personal.service.ts`
- Create: `apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts`
- Modify: `packages/config/src/env.ts`, `.env.example`, `apps/api/package.json`

- [ ] Write failing tests for QR expiry, per-user session ownership, and encrypted session persistence.
- [ ] Run focused tests and verify they fail for the missing service/model.
- [ ] Add GramJS dependency and environment validation for `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`.
- [ ] Implement QR session lifecycle and encrypted storage.
- [ ] Run focused tests and TypeScript.

### Task 2: Authenticated API and Dashboard onboarding

**Files:**
- Create: `apps/api/src/channels/telegram-personal/telegram-personal.routes.ts`
- Modify: `apps/api/src/app.ts`, `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/pages/TelegramPersonalPage.tsx`
- Test: `apps/web/src/state/onboarding.test.ts`

- [ ] Test unauthenticated denial and the dashboard decision when no channel exists.
- [ ] Implement `POST /api/v1/channels/telegram-personal/qr`, polling/status, and disconnect endpoints.
- [ ] Route successful login to Dashboard; show QR only from the Telegram connection page.
- [ ] Verify frontend build and focused tests.

### Task 3: Personal message synchronization and outbound adapter

**Files:**
- Modify: `apps/api/src/channels/telegram-personal/telegram-personal.service.ts`
- Create: `apps/api/src/channels/telegram-personal/telegram-personal.sync.test.ts`
- Modify: `apps/api/src/conversations/conversation.service.ts`, `apps/api/src/messages/message.routes.ts`

- [ ] Test normalization, idempotency, and outbound delivery through the personal provider.
- [ ] Subscribe to authorized MTProto updates and persist canonical customer/conversation/message records.
- [ ] Route personal-platform outbound messages through the owning user's client.
- [ ] Verify full tests, build, and diff check; document credentials required for live QR verification.
