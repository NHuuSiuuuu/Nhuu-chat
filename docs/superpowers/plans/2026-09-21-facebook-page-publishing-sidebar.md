# Facebook Page Publishing Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Refactor the Facebook Page publishing screen into a settings-style sidebar with Soạn thảo, Nháp, Đã lên lịch, and Lịch sử tabs, including edit/delete/history actions.

**Architecture:** Keep the existing Facebook publishing page and API boundary. Reuse the existing PATCH endpoint for editing draft/scheduled posts and expand the authenticated DELETE service operation so owned published/failed history records can be removed with media cleanup. The page derives each tab from its loaded posts list and keeps the composer, preview, connection card, and action feedback in one responsive content shell.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Express, MongoDB/Mongoose.

**Spec:** User-approved requirements in the current conversation on 2026-09-21.

## Global Constraints

- Preserve unrelated dirty files in the feature branch; stage only files for this feature.
- Keep Asia/Ho_Chi_Minh display and scheduling behavior unchanged.
- Keep page-access tokens out of browser storage and never expose them in rendered markup.
- Do not add a UI dependency; reuse existing InboxIcon or inline SVG icons.
- Preserve API authentication, owner scoping, media validation, retry behavior, and error mapping.
- Use TDD: each behavior change gets a failing test before production code.

### Task 1: Expand authenticated post deletion for history records

**Files:**
- Modify: apps/api/src/services/facebook-post.service.ts
- Modify: apps/api/src/controllers/facebook-post.controller.ts only if the service method name changes
- Test: apps/api/src/services/facebook-post.service.test.ts
- Test: apps/api/src/controllers/facebook-post.controller.test.ts

**Interfaces:**
- Keep DELETE /api/v1/facebook-page/posts/:id.
- Keep the authenticated owner argument as the first service argument.
- The delete operation returns Promise<void> and destroys stored media after deleting the owned record.

- [x] Write a failing service test proving an owned published post can be deleted and its media cleanup is called.
- [x] Run the focused service test and verify it fails because the current filter only permits draft and scheduled.
- [x] Write a failing service test proving an owned failed post can be deleted while another owner cannot delete it.
- [x] Expand the atomic owner-scoped delete filter to draft, scheduled, published, and failed; retain cleanup/error behavior.
- [x] Run service and controller tests and verify all pass.

### Task 2: Add frontend client support for update/delete actions

**Files:**
- Modify: apps/web/src/pages/FacebookPublishingPage.tsx
- Modify: apps/web/src/lib/facebook-publishing.api.ts only if the existing method signature needs an adapter
- Test: apps/web/src/lib/facebook-publishing.api.test.ts

**Interfaces:**
- Extend FacebookPublishingClient with update: typeof updateFacebookPost.
- Reuse cancel for deletion because the backend route remains unchanged.
- The update payload supports message, mode draft/scheduled, scheduledAt, and image.

- [x] Add a failing page/client contract assertion that the page client exposes updateFacebookPost.
- [x] Run focused web tests and verify the new assertion fails.
- [x] Add the update member to the default client and preserve existing multipart/JSON behavior.
- [x] Run the API client and page tests and verify the contract passes.

### Task 3: Build the sidebar shell and tab-specific data views

**Files:**
- Modify: apps/web/src/pages/FacebookPublishingPage.tsx
- Test: apps/web/src/pages/FacebookPublishingPage.test.tsx

**Interfaces:**
- Add local tab state with compose, draft, scheduled, and history, defaulting to compose.
- Derive draftPosts, scheduledPosts, and historyPosts from posts; history contains published, failed, and terminal records.
- Keep the connection form available when disconnected and the connected page card visible in compose.

- [x] Add failing markup assertions for four sidebar labels, active compose state, and a flex-1 main shell.
- [x] Add failing assertions that each status list is separated and compose retains textarea, file input, publish modes, and preview.
- [x] Run the page test and confirm failures against the current single-column markup.
- [x] Implement a responsive settings-style layout: sticky left sidebar on wide screens, stacked sidebar on narrow screens, gray main background, active styling, and back navigation.
- [x] Extract small local render helpers for sidebar, composer, preview, post list, and empty states without changing API behavior.
- [x] Run focused page tests and verify all four tabs render required content.

### Task 4: Add edit flow for draft and scheduled posts

**Files:**
- Modify: apps/web/src/pages/FacebookPublishingPage.tsx
- Test: apps/web/src/pages/FacebookPublishingPage.test.tsx

**Interfaces:**
- Each draft/scheduled item exposes Sửa and Xóa actions.
- Editing opens an accessible local form prefilled from the selected post, with message, optional schedule, and mode constrained to draft/scheduled.
- Save calls client.update(post.id, payload), refreshes posts, and closes the editor; errors use actionError.

- [x] Add a failing test for opening an edit form with selected message and scheduled time.
- [x] Add a failing test for save calling client.update with the correct mode and schedule payload.
- [x] Implement edit state and form with cancel, loading/disabled controls, validation, and existing date rules.
- [x] Run focused page tests and verify edit behavior without changing the main composer.

### Task 5: Add scheduled/history actions and external Facebook links

**Files:**
- Modify: apps/web/src/pages/FacebookPublishingPage.tsx
- Test: apps/web/src/pages/FacebookPublishingPage.test.tsx

**Interfaces:**
- Scheduled items show expected publish time, Sửa, and Hủy lịch/Xóa.
- Failed history items show lastErrorCode/message and Thử lại.
- Published history items show Xem trên FB only when publishedPostId exists, opening an external URL with noopener,noreferrer, plus Xóa.
- Delete actions confirm before client.cancel, refresh the list, and report errors through actionError.

- [x] Add failing markup assertions for scheduled time, failure code, retry, Facebook link, and history delete controls.
- [x] Add a failing callback contract test proving history deletion calls the client only after confirmation.
- [x] Implement status-specific cards, action buttons, empty states, and safe external link construction from pageId and publishedPostId.
- [x] Run focused page tests and verify actions are isolated to their applicable tabs.

### Task 6: Verification and delivery

**Files:**
- Modify: CHANGELOG.md under Unreleased if present

- [x] Run all Facebook web/API focused tests, including page, API client, service, controller, and route tests.
- [x] Run the production web build.
- [x] Run git diff --check and inspect the complete scoped diff.
- [ ] Stage only files listed in this plan and create a Conventional Commit with a Vietnamese description.
- [ ] Push feature/nhuu-chat-mvp and report commit, verification, and preserved unrelated dirty files.
