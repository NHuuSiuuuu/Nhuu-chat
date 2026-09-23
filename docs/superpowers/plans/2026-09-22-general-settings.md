# Cài đặt chung theo tài khoản Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tab “Cài đặt chung” lưu preference riêng từng user và áp dụng chúng cho thông báo, âm thanh và hành vi hội thoại trong Inbox.

**Architecture:** Nhúng `generalSettings` vào User với default/normalizer tương tự `aiSettings`; expose GET/PATCH dưới `/api/v1/me/general-settings`. Frontend có panel Settings riêng, còn Inbox đọc preference qua state dùng chung và áp dụng tại realtime message/conversation update.

**Tech Stack:** TypeScript, Express, Mongoose, Zod, React, Tailwind CSS, Vitest, Testing Library, Sonner, Web Notification API/Web Audio API.

**Spec:** `docs/superpowers/specs/2026-09-22-general-settings-design.md`

## Global Constraints

- Cấu hình là riêng từng tài khoản đăng nhập, không dùng chung workspace.
- API phải lấy user từ `request.auth.id`; không nhận `userId` từ client.
- Không thay đổi luồng đăng nhập, Facebook Page ID/access token, OAuth Facebook, AI Settings hoặc audit-history contract.
- Không thêm dependency UI/audio mới.
- Giữ nguyên dirty changes ngoài phạm vi và chỉ stage file của task.
- Cập nhật `CHANGELOG.md` bằng tiếng Việt trong mục `Unreleased`.
- Mỗi task phải theo RED → GREEN, có test focused và commit riêng.

### Task 1: Backend contract, model và service

**Files:**
- Create: `apps/api/src/general-settings/general-settings.ts`
- Create: `apps/api/src/general-settings/general-settings.test.ts`
- Modify: `apps/api/src/models/user.model.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces `NotificationSound`, `GeneralSettings`, `DEFAULT_GENERAL_SETTINGS`, `normalizeGeneralSettings(value: unknown)` và `GeneralSettingsPatch` cho route/service tasks.

- [ ] **Step 1: Write failing tests** cho enum sound, default object và normalize dữ liệu thiếu/sai kiểu.
- [ ] **Step 2: Run focused test** và xác nhận fail vì module/interface chưa tồn tại.
- [ ] **Step 3: Implement** constants, types, normalizer và thêm subdocument `generalSettings` vào User schema với defaults/enum.
- [ ] **Step 4: Add contract** `GeneralSettingsContract` và `NotificationSound` tương ứng vào packages/contracts.
- [ ] **Step 5: Run focused API/contract tests** và xác nhận pass.
- [ ] **Step 6: Commit** bằng Conventional Commit tiếng Anh, mô tả tiếng Việt.

### Task 2: Backend authenticated GET/PATCH API

**Files:**
- Create: `apps/api/src/schemas/general-settings.schemas.ts`
- Create: `apps/api/src/services/general-settings.service.ts`
- Create: `apps/api/src/controllers/general-settings.controller.ts`
- Create: `apps/api/src/routes/general-settings.routes.ts`
- Create: tests cạnh schema/service/controller/route theo convention hiện tại
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes Task 1 `GeneralSettings`, `GeneralSettingsPatch`, `normalizeGeneralSettings`.
- Produces `GET /api/v1/me/general-settings` and `PATCH /api/v1/me/general-settings`.

- [ ] **Step 1: Write failing tests** cho GET defaults, PATCH partial update, reject invalid enum/type, 401 without auth và isolation bằng user auth khác.
- [ ] **Step 2: Run focused tests** và xác nhận fail do route/service chưa tồn tại.
- [ ] **Step 3: Implement** Zod schema, service dùng `findById`/`findByIdAndUpdate` theo auth user, controller error mapping và route có auth middleware.
- [ ] **Step 4: Mount route** tại `/api/v1/me/general-settings`.
- [ ] **Step 5: Run focused tests plus existing profile/app tests** và xác nhận pass.
- [ ] **Step 6: Commit** riêng task backend API.

### Task 3: Frontend General Settings panel

**Files:**
- Create: `apps/web/src/components/settings/GeneralSettingsPanel.tsx`
- Create: `apps/web/src/components/settings/general-settings.ts`
- Create: `apps/web/src/components/settings/GeneralSettingsPanel.test.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes `GeneralSettingsContract` and `/api/v1/me/general-settings` from Task 2.
- Produces a controlled panel rendered when active tab is `Cài đặt chung`.

- [ ] **Step 1: Write failing component tests** cho title/sections, four controls, load state, PATCH save, rollback/error toast và accessible labels.
- [ ] **Step 2: Run focused frontend test** và xác nhận fail vì tab vẫn là placeholder/panel chưa tồn tại.
- [ ] **Step 3: Implement** panel, API load/save, optimistic update, rollback và Notification permission warning; giữ layout theo ảnh và responsive.
- [ ] **Step 4: Replace placeholder branch** trong SettingsPage chỉ cho `Cài đặt chung`; các tab placeholder khác vẫn toast “Chức năng đang được phát triển”.
- [ ] **Step 5: Run focused tests** và existing SettingsPage tests.
- [ ] **Step 6: Commit** riêng frontend panel.

### Task 4: Inbox notification, sound và unread behavior integration

**Files:**
- Create: `apps/web/src/state/general-settings.ts`
- Create: `apps/web/src/state/general-settings.test.ts`
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/pages/InboxPage.test.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.test.tsx`
- Modify: `apps/web/src/components/conversations/ConversationList.tsx` only if sorting cannot remain in Inbox state

**Interfaces:**
- Consumes `GeneralSettingsContract` and API client behavior from Task 3.
- Produces deterministic helpers for notification gating, sound selection, unread ordering and next-unread selection, plus an explicit “Đánh dấu đã đọc & mở tiếp theo” action in the chat header when enabled and a next unread conversation exists. Navigation occurs only after the mark-read request succeeds; merely opening a conversation never auto-advances.

- [x] **Step 1: Write failing unit/integration tests** for customer-only notification, sound `off`, unread sort enabled/disabled and next unread selection.
- [x] **Step 2: Run focused tests** and confirm fail against current unconditional toast/current ordering.
- [x] **Step 3: Implement** loading of general settings in Inbox, realtime gate, browser Notification fallback, minimal Web Audio sound mapping, stable unread ordering and explicit mark-read-then-open-next navigation.
- [x] **Step 4: Run focused Inbox/state tests** and existing realtime tests.
- [ ] **Step 5: Commit** integration task.

### Task 5: Documentation and scoped verification

**Files:**
- Modify: `CHANGELOG.md`
- Create: `.superpowers/sdd/2026-09-22-general-settings/task-5-report.md`

- [x] **Step 1: Add Vietnamese Unreleased entry** describing per-user General Settings, API and Inbox behavior.
- [x] **Step 2: Run backend focused/full tests and frontend focused/full tests** with counts recorded.
- [x] **Step 3: Run production build and `git diff --check`**.
- [x] **Step 4: Verify diff scope and ensure unrelated dirty files were not staged.**
- [ ] **Step 5: Commit changelog/report only after fresh verification.**

## Final Review Checklist

- [ ] Every requirement in the design spec maps to a task and test.
- [ ] Authenticated user isolation is proven by test.
- [ ] Existing placeholder tabs and manual Facebook login flow remain unchanged.
- [ ] Whole-branch review is clean or findings are explicitly adjudicated.
