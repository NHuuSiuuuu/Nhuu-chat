# Workspace and Facebook Page Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Workspace memberships, member-managed Page access, and multiple Facebook Page connections without changing existing system roles or non-Facebook owner scope.

**Architecture:** Persist Workspaces and memberships separately from User. A Workspace resolves to its current owner User ID, preserving existing `ownerId` data; Facebook requests and Socket.IO connections carry a selected Workspace ID that the API validates. Facebook Page access is filtered server-side by the membership role and allowed page IDs; unrelated channels retain current access rules.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, MongoDB migration scripts, React, Vite, Socket.IO, Vitest, Tailwind CSS, Sonner.

**Spec:** `docs/superpowers/specs/2026-09-23-workspace-page-access-design.md`

## Global Constraints

- Keep `User.role` values `admin`, `agent`, and `customer` as system roles; add Workspace roles `owner`, `admin`, and `staff` separately.
- A staff membership with `allowedPages: []` can access every Facebook Page in that Workspace.
- A Workspace ID from the client is never authorization; resolve and validate the membership on the server.
- Apply Workspace Page RBAC to Facebook connections, Facebook Inbox, and Facebook Publishing; do not alter Telegram, AI, personal settings, or other owner-scoped modules.
- Preserve `Conversation.ownerId` and current data ownership; do not expose access tokens in API responses, Socket.IO events, errors, or logs.
- Do not run production migrations or deployment as part of this implementation.

---

### Task 1: Workspace model, registration bootstrap, and legacy migration

**Files:**
- Create `apps/api/src/models/workspace.model.ts`
- Create `apps/api/src/models/workspace-member.model.ts`
- Create `apps/api/src/services/workspace.service.ts`
- Create `apps/api/src/db/migrate-workspaces.ts`
- Create `apps/api/src/db/migrate-workspaces.test.ts`
- Modify `apps/api/src/models/user.model.ts`
- Modify `apps/api/src/services/auth.service.ts`
- Modify model and auth tests alongside the changed behavior.

**Interfaces:**
- `Workspace` stores `ownerUserId`; `WorkspaceMember` stores `workspaceId`, `userId`, `role`, and `allowedPages`.
- `ensurePersonalWorkspace(userId)` returns the owner Workspace and creates its owner membership idempotently.
- `WorkspaceContext` contains `workspaceId`, `ownerUserId`, `memberUserId`, `role`, and `allowedPages`.

- [ ] Write migration tests for creating owner workspaces for existing users, preserving owner IDs, and a second run creating no duplicates.
- [ ] Run `pnpm --filter api test -- src/db/migrate-workspaces.test.ts`; confirm it fails because the migration does not exist.
- [ ] Implement the two Mongoose schemas with unique `(workspaceId,userId)` membership index, unique Workspace `ownerUserId`, and one-owner-per-workspace partial unique index.
- [ ] Set `User.role` default to `customer`, preserving all current User settings fields. On successful registration, call `ensurePersonalWorkspace` so the creating user receives owner membership.
- [ ] Implement a dry-run migration that reports missing workspaces/memberships and conflicting data without writes by default; require an explicit `--apply` to write and make the apply path idempotent.
- [ ] Run focused model, auth, and migration tests; verify migration dry-run and apply behavior against the project Mongo test fixture.
- [ ] Commit the task with `feat: thêm Workspace và membership owner`.

### Task 2: Workspace and member APIs

**Files:**
- Create `apps/api/src/schemas/workspace.schemas.ts` and tests.
- Create `apps/api/src/controllers/workspaces.controller.ts` and tests.
- Create `apps/api/src/routes/workspaces.routes.ts` and route tests.
- Modify `apps/api/src/app.ts` to mount `/api/v1/workspaces`.
- Modify `apps/api/src/services/workspace.service.ts` and tests.

**Interfaces:**
- `GET /api/v1/workspaces` returns `{ workspaces: [{ id, name, role }] }` for the authenticated user.
- `GET /api/v1/workspaces/:workspaceId/members` returns members with email, Workspace role, and `allowedPages`.
- `POST /api/v1/workspaces/:workspaceId/members` accepts `{ email, role: "admin" | "staff", allowedPages: string[] }`.
- `PATCH /api/v1/workspaces/:workspaceId/members/:userId` accepts role and Page access updates; `DELETE` removes only non-owner memberships.
- Only an owner membership may add/update/remove members. A registered user may keep memberships in other Workspaces.

- [ ] Add failing service tests for registered account addition, unregistered email returning HTTP 400 with `Tài khoản không tồn tại, yêu cầu đăng ký trước`, invalid roles, duplicate membership, and owner immutability.
- [ ] Run the new service tests and confirm failure at the missing Workspace member operations.
- [ ] Implement service operations with normalized email lookup, atomic membership upsert scoped by Workspace, Page ID validation against that Workspace, and owner role immutability.
- [ ] Add failing controller/route tests for authentication, owner-only management, membership listing, and safe errors.
- [ ] Implement Zod schemas, controllers, routes, and mount the router.
- [ ] Run workspace API tests and `pnpm --filter api test -- src/controllers/workspaces.controller.test.ts src/routes/workspaces.routes.test.ts`.
- [ ] Commit the task with `feat: thêm API quản lý thành viên Workspace`.

### Task 3: Multiple Page connection lifecycle and migration

**Files:**
- Modify `apps/api/src/models/facebook-page-connection.model.ts` and tests.
- Modify `apps/api/src/services/facebook-page.service.ts` and tests.
- Modify `apps/api/src/services/facebook-oauth.service.ts` and tests.
- Modify `apps/api/src/controllers/facebook-page.controller.ts` and tests.
- Modify `apps/api/src/routes/facebook-page.routes.ts` and tests.
- Create `apps/api/src/db/migrate-facebook-page-connections.ts` and tests.
- Modify contracts in `packages/contracts/src/index.ts` only if a response shape requires it.

**Interfaces:**
- `facebookPageService.list(ownerUserId)` returns all connected Page summaries; `remove(ownerUserId, pageId)` removes only that Page.
- `GET /api/v1/facebook-page/connections` lists Pages; `DELETE /api/v1/facebook-page/connections/:pageId` disconnects one Page.
- The legacy singular `GET/POST/DELETE /connection` remains compatible and targets the first or explicitly supplied Page.
- OAuth state and selection are bound to both authenticated user and selected Workspace; the controller resolves `ownerUserId` before invoking connect.

- [ ] Add tests proving one owner can connect two Pages, reconnecting one does not replace the other, duplicate Page ownership fails, and removing one Page leaves the other connected.
- [ ] Run Page service and OAuth tests and confirm the new multiple-connection tests fail on the existing one-row-per-user lookup.
- [ ] Remove the unique `userId` connection index while preserving unique `pageId`; add an idempotent index migration that audits duplicate Page IDs before applying index changes.
- [ ] Update connect reservation/CAS logic to target `(userId,pageId)` for updates/removals and to create a separate connection row for each new Page.
- [ ] Bind OAuth selection to Workspace context without storing plaintext tokens in new database fields or returning them to the client.
- [ ] Implement list and per-Page remove APIs, and retain singular endpoint behavior for compatibility.
- [ ] Run Facebook Page lifecycle, OAuth, schema, and migration tests.
- [ ] Commit the task with `feat: hỗ trợ nhiều Facebook Page trong Workspace`.

### Task 4: Facebook request and Socket.IO authorization

**Files:**
- Create `apps/api/src/auth/workspace-context.ts` and tests.
- Modify `apps/api/src/auth/auth.middleware.ts` and tests as needed.
- Modify `apps/api/src/realtime/access.ts` and tests.
- Modify `apps/api/src/realtime/socket.ts` and tests.
- Modify Facebook Page, conversation, customer, message, pin, note, tag, Facebook post, and publishing scheduler controllers/services only where Facebook resources are accessed.
- Modify `apps/api/src/channels/facebook-messenger/facebook-messenger.webhook.ts` and tests for Page-specific recipients.

**Interfaces:**
- `resolveWorkspaceContext(userId, workspaceId?)` resolves the requested membership; no header defaults only to the user's personal Workspace.
- `WorkspaceContext` is attached to authenticated requests only after membership lookup; missing membership returns 403.
- Facebook conversation filters enforce `{ ownerId: context.ownerUserId, channelId: { $in: permittedPageIds } }` for a restricted Staff membership; empty `allowedPages` and Admin/Owner omit the Page restriction.
- Non-Facebook access keeps current `conversationAccessFilter` behavior.

- [ ] Add failing tests for rejecting a foreign Workspace ID, defaulting to personal Workspace, staff limited to selected pages, staff with empty page list, owner/admin full Page access, and preserving non-Facebook access behavior.
- [ ] Add realtime tests proving a socket cannot join a Facebook conversation outside the selected Workspace/Page and a Page event is emitted only to members allowed for that Page.
- [ ] Run the new auth/access tests and confirm failure before adding Workspace context.
- [ ] Implement the request context resolver and compose it with existing authenticated routes without changing webhook authentication.
- [ ] Apply the Facebook-specific access filter to list/detail/search/count/send/read/assignment/pin/note/tag and publishing paths; keep every object-ID lookup scoped by owner and allowed Page.
- [ ] Pass `workspaceId` during Socket.IO handshake, validate membership before joining rooms, and derive Page-specific recipients from memberships for Messenger events.
- [ ] Run focused auth, conversation, message, realtime, and Messenger webhook tests.
- [ ] Commit the task with `fix: cô lập Facebook Inbox theo quyền Workspace`.

### Task 5: Frontend Workspace selector and member management

**Files:**
- Create `apps/web/src/state/workspace-context.ts` and tests.
- Create `apps/web/src/components/settings/WorkspaceMemberPanel.tsx` and tests.
- Create `apps/web/src/components/settings/AddEmployeeModal.tsx` and tests.
- Modify `apps/web/src/lib/api.ts` and tests to attach selected `X-Workspace-Id` on API calls.
- Modify `apps/web/src/lib/socket.ts` and tests to send selected Workspace during handshake and reconnect on switch.
- Modify `apps/web/src/components/dashboard/DashboardTopbar.tsx`, `apps/web/src/pages/SettingsPage.tsx`, and `apps/web/src/pages/InboxPage.tsx` with tests.

**Interfaces:**
- Workspace selection state exposes selected Workspace ID and role; changing it reloads the Facebook connection/inbox context and reconnects Socket.IO.
- Add/edit modal accepts email, role, allowed Page IDs and submits the workspace member endpoints.
- Empty Page checkbox selection shows the agreed unlimited-access note.

- [ ] Add failing state and API client tests for selecting a Workspace and adding `X-Workspace-Id` without changing Authorization/cookie behavior.
- [ ] Add component tests for role options, Page checkbox selection, unselected-page note, Sonner success/error, owner non-editability, and staff Page-count label.
- [ ] Run the new frontend tests and confirm failure because workspace UI/API client context is missing.
- [ ] Implement Workspace list/selector, persisted selection scoped to the signed-in user, request header injection, and Socket.IO reconnect on Workspace switch.
- [ ] Implement responsive member list and Add/Edit modal with Tailwind, `cursor-pointer` on interactive labels/controls, and Sonner feedback.
- [ ] Connect selected Workspace to Facebook Page connection selection, OAuth, Page list, Inbox filters, and Page-specific post composition/management.
- [ ] Run focused frontend tests and `pnpm --filter web build`.
- [ ] Commit the task with `feat: thêm giao diện thành viên và chọn Workspace`.

### Task 6: Documentation, final regression, review, and delivery

**Files:**
- Modify `CHANGELOG.md` under `## [Unreleased]`.
- Modify `README.md` and the relevant source under `docs/wiki/` for Workspace membership, migration order, Page access, and limitations.
- Modify reports/tests only when final findings require it.

- [ ] Re-read the spec and check each requirement against the completed implementation and test evidence.
- [ ] Run focused API and frontend tests, full API tests, full web tests, API TypeScript check, Web production build, lint for changed files, and `git diff --check`.
- [ ] Review the full diff for unrelated changes, tenant escape paths, token leaks, and index migration safety; fix any issue and rerun affected checks.
- [ ] Update README, Wiki source, and changelog with actual behavior and the requirement that production migration needs backup and operator review.
- [ ] Commit documentation and final fixes in a focused commit using a Vietnamese Conventional Commit description.
- [ ] Push the feature branch to its configured remote; do not merge into another branch.
- [ ] Report commit hashes, push result, exact verification counts, failures outside scope, and production migration limitations.
