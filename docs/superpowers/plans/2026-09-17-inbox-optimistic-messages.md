# Inbox Optimistic Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị tin nhắn outbound ngay lập tức, đồng bộ response/socket không tạo duplicate, và retry được text/file khi delivery thất bại.

**Architecture:** Frontend tạo message tạm và quản lý payload retry trong `InboxPage`; helper realtime hợp nhất theo `clientMessageId` trước khi dùng id server. Backend nhận và lưu correlation ID trong `metadata`, rồi trả lại trên HTTP và Socket.IO. `ChatWindow` chỉ render trạng thái và phát callback retry.

**Tech Stack:** React, TypeScript, Vitest, Express, Zod, Mongoose, Socket.IO.

**Spec:** `docs/superpowers/specs/2026-09-17-inbox-optimistic-messages-design.md`

## Global Constraints

- Không thay đổi schema MongoDB hoặc thêm migration; correlation lưu trong `metadata.clientMessageId`.
- Giữ giới hạn upload 20 MB và validation file hiện có.
- Chỉ sửa flow gửi tin Inbox, contract liên quan, test và changelog.
- Giữ nguyên các file dirty ngoài phạm vi task.

### Task 1: Define correlation and realtime merge behavior

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/web/src/state/inbox-realtime.ts`
- Create: `apps/web/src/state/inbox-realtime.test.ts`

**Interfaces:**
- `ChatMessageContract.clientMessageId?: string`.
- `mergeMessage(current, incoming)` replaces an optimistic item with matching `clientMessageId`, otherwise replaces by server `id`.
- `appendUniqueMessage` uses the same correlation rule.

- [ ] Write tests for replacing an optimistic message by correlation ID, deduping HTTP/socket copies, and preserving unrelated messages.
- [ ] Run `pnpm exec vitest run apps/web/src/state/inbox-realtime.test.ts`; verify the new tests fail because helpers do not correlate messages.
- [ ] Implement the minimal correlation-aware helper behavior and contract field.
- [ ] Run the focused test again; verify it passes.

### Task 2: Preserve correlation through the outbound API

**Files:**
- Modify: `apps/api/src/schemas/message.schemas.ts`
- Modify: `apps/api/src/routes/messages.routes.ts`
- Modify: `apps/api/src/controllers/messages.controller.ts`
- Modify: `apps/api/src/services/message.service.ts`
- Modify: `apps/api/src/services/message.service.test.ts`
- Modify: `apps/api/src/controllers/conversation-message.controller.test.ts`
- Modify: `apps/api/src/routes/messages.routes.test.ts`

**Interfaces:**
- Multipart body accepts optional `clientMessageId`.
- `sendOutboundMessage` accepts the ID and stores it as `metadata.clientMessageId`.
- `toMessage` returns `clientMessageId` when present.

- [ ] Add failing service/contract assertions proving the ID is persisted and serialized.
- [ ] Run the focused backend tests and verify the assertions fail before implementation.
- [ ] Thread the ID through controller → service → persistence and error persistence paths.
- [ ] Run focused backend tests and verify they pass.

### Task 3: Add optimistic send, failed state, and retry payload

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/pages/InboxPage.test.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.test.tsx` (if present)

**Interfaces:**
- `InboxPage` creates local messages with `pending` status before API calls.
- `ChatWindow` accepts `onRetryMessage?: (messageId: string) => void`.
- `MessageComposer.onSend` returns `Promise<boolean>`; it clears content only when the send attempt succeeds.

- [ ] Add failing source/logic tests covering pending insertion, success replacement, failed preservation, and retry callback wiring.
- [ ] Run focused frontend tests and verify the new assertions fail.
- [ ] Implement retry payload storage keyed by optimistic message ID, multipart correlation, and object URL cleanup.
- [ ] Implement status indicator rendering and retry accessibility behavior.
- [ ] Run focused frontend tests and verify they pass.

### Task 4: Regression verification and changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add an Unreleased entry describing optimistic outbound messages and retry.
- [ ] Run frontend focused tests, backend focused tests, TypeScript/build, and `git diff --check`.
- [ ] Inspect the complete scoped diff, stage only task files, commit with a Vietnamese Conventional Commit description, and push the current feature branch.
