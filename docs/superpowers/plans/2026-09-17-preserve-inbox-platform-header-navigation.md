# Preserve Inbox Platform Header Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giữ nguyên bộ lọc kênh hiện tại khi người dùng bấm `Hội thoại` trên header trong Inbox.

**Architecture:** `App` là nơi sở hữu `inboxPlatform` và xử lý điều hướng. Callback header sẽ truyền platform hiện tại khi đích vẫn là Inbox; Dashboard vẫn gọi Inbox không có platform để mở chế độ gộp trang.

**Tech Stack:** React, TypeScript, Vitest, Vite.

**Spec:** Yêu cầu người dùng trong phiên: chọn tài khoản Zalo vào `/inbox?platform=zalo_personal`, sau đó bấm `Hội thoại` trên header không được chuyển thành Inbox tổng hợp.

## Global Constraints

- Không thay đổi API, dữ liệu MongoDB hoặc trạng thái “Gộp trang”.
- Chỉ sửa luồng điều hướng và test hồi quy liên quan.
- Giữ nguyên các thay đổi dang dở không thuộc task trong workspace.

### Task 1: Preserve the selected inbox platform

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `inboxPlatform` state already initialized from the URL.
- Produces: Header navigation to `Hội thoại` calls `navigate("inbox", inboxPlatform)`; merge navigation continues to call `navigate("inbox")`.

- [ ] **Step 1: Write the failing regression assertion**

Assert the header callback forwards `inboxPlatform` and no longer drops it:

```ts
expect(source).toContain('if (item === "Hội thoại") return navigate("inbox", inboxPlatform)');
expect(source).not.toContain('if (item === "Hội thoại") return navigate("inbox")');
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing behavior**

Run: `pnpm exec vitest run apps/web/src/App.test.tsx`

Expected: FAIL because `App.tsx` currently calls `navigate("inbox")` without the selected platform.

- [ ] **Step 3: Implement the minimal callback change**

Change only the `Hội thoại` branch in `navigateFromHeader`:

```ts
if (item === "Hội thoại") return navigate("inbox", inboxPlatform);
```

- [ ] **Step 4: Run focused tests and production build**

Run: `pnpm exec vitest run apps/web/src/App.test.tsx apps/web/src/pages/DashboardPage.test.ts apps/web/src/pages/InboxPage.test.tsx`

Run: `pnpm --filter web build`

Expected: all focused tests pass and the web production build exits with code 0.

- [ ] **Step 5: Update changelog and verify the diff**

Add one Unreleased entry describing that header navigation preserves the selected channel. Run `git diff --check` and inspect the diff before staging only the three task files.
