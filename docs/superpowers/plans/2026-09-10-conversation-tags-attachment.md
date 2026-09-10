# Conversation Tags Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép admin/agent gắn, bỏ và xem nhiều thẻ trên từng hội thoại trong Inbox.

**Architecture:** Conversation lưu `tagIds` tham chiếu tới `ConversationTag`. API cập nhật toàn bộ danh sách tag theo kiểu idempotent, kiểm tra quyền truy cập conversation, populate tag khi list/read conversation. Inbox tải danh sách tag dùng chung, mở menu chọn nhiều tag trên từng item và cập nhật state optimistic.

**Tech Stack:** Node.js, Express, MongoDB/Mongoose, Zod, React, TypeScript, Tailwind CSS, Vitest.

**Spec:** Thiết kế đã được duyệt trong hội thoại ngày 2026-09-10.

## Global Constraints

- Chỉ admin/agent được gắn hoặc bỏ tag.
- Agent chỉ thao tác conversation được phân công; admin thao tác mọi conversation.
- Không thêm dependency.
- Không xóa hoặc đổi API CRUD tag hiện có trong Settings.
- UI text mới dùng tiếng Việt.
- Không đưa `DEVELOPMENT_PROMPT.md` vào commit.

### Task 1: Conversation tag persistence and contract

**Files:**
- Modify: `apps/api/src/models/conversation.model.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/api/src/conversations/conversation.service.test.ts`

- [x] **Step 1: Write the failing contract/mapper test**

Assert that a conversation row with populated `tagIds` is returned as `tags` with `id`, `name`, and `color`.

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm exec vitest run apps/api/src/conversations/conversation.service.test.ts`

- [x] **Step 3: Add `tagIds` reference and contract field**

Add `tagIds: [{ type: Schema.Types.ObjectId, ref: "ConversationTag", default: [] }]` and `tags?: ConversationTagContract[]` to the public contract. Update `toConversation` to normalize populated tags.

- [x] **Step 4: Run the focused test and confirm it passes**

Run: `pnpm exec vitest run apps/api/src/conversations/conversation.service.test.ts`

### Task 2: Authorized tag attachment API

**Files:**
- Modify: `apps/api/src/schemas/conversation.schemas.ts`
- Modify: `apps/api/src/services/conversation.service.ts`
- Modify: `apps/api/src/controllers/conversations.controller.ts`
- Modify: `apps/api/src/routes/conversations.routes.ts`
- Test: `apps/api/src/services/conversation.service.test.ts`
- Test: `apps/api/src/controllers/conversations.controller.test.ts`

- [x] **Step 1: Write failing service/controller tests**

Cover replacing tags for an authorized admin/assigned agent, rejecting an unassigned agent, rejecting an unknown tag id, and returning the updated conversation.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run apps/api/src/services/conversation.service.test.ts apps/api/src/controllers/conversations.controller.test.ts`

- [x] **Step 3: Implement `PUT /:id/tags`**

Validate `{ tagIds: string[] }`, deduplicate ids, verify every tag exists, update only conversations matching `conversationAccessFilter(auth)`, populate customer/tags, and return `toConversation`.

- [x] **Step 4: Run focused API tests and confirm pass**

Run: `pnpm exec vitest run apps/api/src/services/conversation.service.test.ts apps/api/src/controllers/conversations.controller.test.ts`

### Task 3: Return tags from conversation reads

**Files:**
- Modify: `apps/api/src/services/conversation.service.ts`
- Test: `apps/api/src/conversations/conversation.service.test.ts`

- [x] **Step 1: Add failing list mapping test**

Assert that list/read mapping preserves tag order and omits malformed absent tags without breaking legacy conversations.

- [x] **Step 2: Run focused test and confirm failure**

Run: `pnpm exec vitest run apps/api/src/conversations/conversation.service.test.ts`

- [x] **Step 3: Populate `tagIds` on list and update/read queries**

Populate `tagIds` with `name color` in conversation queries and pass the normalized values to `toConversation`.

- [x] **Step 4: Run focused test and confirm pass**

Run: `pnpm exec vitest run apps/api/src/conversations/conversation.service.test.ts`

### Task 4: Inbox tag picker and state updates

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/components/conversations/ConversationList.tsx`
- Modify: `apps/web/src/state/inbox-realtime.ts`
- Test: `apps/web/src/pages/InboxPage.test.tsx`
- Test: `apps/web/src/state/inbox-realtime.test.ts`

- [x] **Step 1: Write failing UI/state tests**

Assert that Inbox loads shared tags, renders a tag picker for admin/agent, sends the complete selected id list, and preserves tags when a partial realtime conversation update arrives.

- [x] **Step 2: Run focused web tests and confirm failure**

Run: `pnpm exec vitest run apps/web/src/pages/InboxPage.test.tsx apps/web/src/state/inbox-realtime.test.ts`

- [x] **Step 3: Implement tag loading and picker behavior**

Load `/api/v1/conversation-tags`, pass tags and an `onTagsChange` callback to `ConversationList`, render a compact “Thẻ” control/menu with checkbox-like buttons, optimistically update item tags, call `PUT /api/v1/conversations/:id/tags`, and rollback on failure.

- [x] **Step 4: Run focused web tests and confirm pass**

Run: `pnpm exec vitest run apps/web/src/pages/InboxPage.test.tsx apps/web/src/state/inbox-realtime.test.ts`

### Task 5: Regression verification and documentation

**Files:**
- Modify: `CHANGELOG.md`

- [x] **Step 1: Run API and web focused suites**

Run: `pnpm exec vitest run apps/api/src apps/web/src`

- [x] **Step 2: Build the web application**

Run: `pnpm --dir apps/web build`

- [x] **Step 3: Check the final diff**

Run: `git diff --check` and verify `DEVELOPMENT_PROMPT.md` remains untracked and untouched.

- [x] **Step 4: Commit the implementation**

Run: `git add <changed files> && git commit -m "feat: attach tags to conversations"`
