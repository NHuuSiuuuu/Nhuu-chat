# Cài đặt giao diện Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tuỳ chọn theme, màu nhấn, mật độ hội thoại, cỡ chữ tin nhắn, xem trước và khôi phục mặc định vào Cài đặt → Giao diện.

**Architecture:** Lưu cấu hình theo từng User trong `generalSettings` hiện có qua GET/PATCH hiện có. App áp dụng cấu hình vào thuộc tính `data-*` trên `documentElement`; CSS toàn cục và các component chat dùng các thuộc tính này. Panel lưu lạc quan theo field và có khu vực xem trước bám theo state hiện tại.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, Express, Mongoose, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-appearance-settings-design.md`

## Global Constraints

- Không thêm collection hoặc migration; dữ liệu thiếu field mới được chuẩn hoá về mặc định.
- Không đổi auth/API path; mở rộng contract của `/api/v1/me/general-settings`.
- Mặc định: `themeMode: light`, `accentColor: blue`, `interfaceDensity: comfortable`, `messageFontSize: medium`.
- Giữ các tuỳ chọn theo User, không chia sẻ giữa thành viên trong cùng Workspace.
- Giữ giao diện landing công khai ngoài thay đổi.

---

### Task 1: Contract, lưu trữ và áp dụng cấu hình

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/general-settings/general-settings.ts`
- Modify: `apps/api/src/general-settings/general-settings.test.ts`
- Modify: `apps/api/src/schemas/general-settings.schemas.ts`
- Modify: `apps/api/src/models/user.model.ts`
- Modify: `apps/api/src/services/general-settings.service.test.ts`
- Create: `apps/web/src/state/appearance-settings.ts`
- Create: `apps/web/src/state/appearance-settings.test.ts`
- Modify: `apps/web/src/styles/tailwind.css`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/ConversationList.tsx`

**Interfaces:**
- `GeneralSettingsContract` gains `themeMode`, `accentColor`, `interfaceDensity`, `messageFontSize` unions.
- `applyAppearanceSettings(settings: Pick<GeneralSettingsContract, ...>): void` applies `data-*` attributes and system-theme listener.
- `resetAppearanceSettings(): void` returns document styling to light/blue/comfortable/medium when logged out.

- [x] **Step 1: Write API and state tests** for legacy normalization, accepted enum values, invalid enum rejection, setting document attributes, and `system` theme response.
- [x] **Step 2: Run tests red** with `pnpm --filter api exec vitest run src/general-settings/general-settings.test.ts src/services/general-settings.service.test.ts` and `pnpm --filter web exec vitest run src/state/appearance-settings.test.ts`.
- [x] **Step 3: Extend contract/schema/model/normalizer** with defaults and enum validation; update existing full settings fixtures so TypeScript consumers remain complete.
- [x] **Step 4: Implement `applyAppearanceSettings` and root CSS attributes**; apply defaults when no authenticated account is active.
- [x] **Step 5: Add density and message-size selectors** to the conversation list and message body, then run the same focused API/state tests.

### Task 2: Giao diện Cài đặt và xem trước

**Files:**
- Create: `apps/web/src/components/settings/AppearanceSettingsPanel.tsx`
- Create: `apps/web/src/components/settings/AppearanceSettingsPanel.test.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/settings/GeneralSettingsPanel.tsx`
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/styles/tailwind.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Panel props follow `GeneralSettingsPanel`: `{ apiUrl, token, refresh? }`.
- Panel uses `loadGeneralSettings` and `patchGeneralSettings`; updates use the existing `publishGeneralSettingsUpdate` event so App and active pages apply changes without reload.
- Settings route `appearance` renders the panel and menu item is enabled on desktop/mobile.

- [x] **Step 1: Write panel tests** for all four option groups, selection causing immediate apply/save, preview values, reset values and save failure rollback.
- [x] **Step 2: Run focused panel test red** with `pnpm --filter web exec vitest run src/components/settings/AppearanceSettingsPanel.test.tsx`.
- [x] **Step 3: Implement accessible option cards/radio controls, sample inbox/message preview, and reset button**; persist each field through the existing settings API.
- [x] **Step 4: Enable the appearance route and wire App startup/update/reset**; preserve notification settings behavior in Inbox.
- [x] **Step 5: Run relevant API tests, appearance/general settings tests, Landing/Settings tests, `pnpm --filter web build`, and `git diff --check`.
- [x] **Step 6: Inspect and stage only scoped files, commit with a concise Conventional Commit message, then push current feature branch.**

## Verification record

- API general-settings, schema, service, controller, route, and User model tests: 28/28 passed.
- Web appearance state/panel, general settings, Settings page, and Inbox tests: 114/114 passed; App/state regression group: 22/22 passed.
- TypeScript check for changed application modules: passed.
- Web production build and `git diff --check`: passed.
- Full API suite was also attempted and reported failures in Telegram personal inbound integration tests; those failures are outside the changed general-settings modules and were not diagnosed in this task.
