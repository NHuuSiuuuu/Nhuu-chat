# Áp dụng chatbot cho kênh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng áp dụng một chatbot cho một hoặc nhiều kênh đã kết nối bằng contract chung, có xác nhận khi chuyển kênh từ chatbot khác và giữ fallback về chatbot mặc định.

**Architecture:** Tạo registry `ChannelAccount` chỉ lưu metadata không bí mật của từng tài khoản/kênh thuộc owner. Assistant assignment dùng identifier chuẩn `<platform>:<externalId>`; một API chuyên dụng xác thực danh sách kênh, gỡ identifier khỏi assistant cũ rồi cập nhật assistant mới trong transaction. Frontend tải registry qua API và hiển thị modal dùng chung cho Facebook Page, Zalo OA và tài khoản Telegram cá nhân; connector Facebook/Zalo tương lai chỉ cần upsert cùng contract.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose/MongoDB, Zod, Vitest, React 19, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-15-chatbot-knowledge-isolation-design.md`

## Global Constraints

- Không lưu token, secret hoặc OAuth credential trong `ChannelAccount`; credential tiếp tục thuộc cơ chế secret hiện có.
- Identifier luôn có dạng `<platform>:<externalId>`; không dùng display name làm khóa.
- Một channel identifier chỉ có một assistant trực tiếp hiệu lực.
- Tài khoản/kênh chưa được gán trực tiếp dùng assistant mặc định đang bật.
- Kênh đang thuộc assistant khác chỉ được chuyển sau khi người dùng xác nhận trên UI.
- Không triển khai OAuth/webhook Facebook hoặc Zalo trong plan này.
- Không triển khai Telegram Bot hoặc lưu Telegram Bot token trong plan này; Telegram chỉ dùng `TelegramPersonalSession` của flow QR hiện có.
- Không sửa hoặc xóa các thay đổi dirty không liên quan đang có trong workspace.
- Mọi comment code mới phải viết bằng tiếng Việt.
- Backend thay đổi model/API phải có test Vitest cho success path và failure path.
- Frontend thay đổi flow phải có regression test, production build và `git diff --check`.

### Task 1: Thêm contract và model registry kênh

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/models/channel-account.model.ts`
- Test: `apps/api/src/models/channel-account.model.test.ts`
- Test: `packages/contracts/src/index.test.ts` nếu file test contract hiện có; nếu không, kiểm tra typecheck package

**Interfaces:**
- Produces `ConnectedChannelContract { id: string; ownerId: string; platform: ChatPlatform; externalId: string; displayName: string; status: "connected" | "disconnected" | "error"; assistantId: string | null }`; Telegram cá nhân dùng `platform: "telegram_personal"` và `externalId: telegramUserId`.
- Produces Mongoose `ChannelAccountModel` với `ownerId`, `platform`, `externalId`, `displayName`, `status`, timestamps và unique index `ownerId + platform + externalId`; model không chứa token hoặc encrypted session.
- Produces helper identifier `channelIdentifier(platform: string, externalId: string): string` hoặc đặt tại service nếu repo không có helper module.

- [ ] **Step 1: Write the failing model and contract tests**
  - Kiểm tra model chấp nhận account Telegram thuộc owner, trả lỗi khi thiếu owner/externalId, và unique index chứa đúng các field.
  - Kiểm tra contract không cho phép platform tùy ý hoặc status tùy ý trong code type/schema hiện có.

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run apps/api/src/models/channel-account.model.test.ts`
  - Expected: FAIL vì contract/model chưa tồn tại.

- [ ] **Step 3: Write the minimal contract and model**
  - Thêm `ConnectedChannelContract` vào contracts, dùng `ChatPlatform` hiện có.
  - Tạo schema với các field trên, `trim` cho externalId/displayName, index unique theo owner/platform/externalId; không thêm token/ciphertext.

- [ ] **Step 4: Run tests to verify they pass**
  - Run: `pnpm exec vitest run apps/api/src/models/channel-account.model.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Run: `git add packages/contracts/src/index.ts apps/api/src/models/channel-account.model.ts apps/api/src/models/channel-account.model.test.ts && git commit -m "feat: add connected channel account registry"`

### Task 2: Thêm service và API danh sách kênh

**Files:**
- Create: `apps/api/src/services/channel-account.service.ts`
- Create: `apps/api/src/controllers/channel-account.controller.ts`
- Create: `apps/api/src/routes/channel-account.routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/controllers/channel-account.controller.test.ts`

**Interfaces:**
- Produces `listConnectedChannels(ownerId: string): Promise<{ channels: ConnectedChannelContract[] }>`.
- Produces `upsertConnectedChannel(input: { ownerId: string; platform: ChatPlatform; externalId: string; displayName: string; status: ChannelStatus }): Promise<ConnectedChannelContract>` for connectors only.
- Produces `GET /api/v1/channel-accounts`, authenticated for admin/agent, returning only the authenticated owner's channels.
- Produces `upsertConnectedChannel` as an internal service API; no public client endpoint is required in this task.

- [ ] **Step 1: Write failing controller/service tests**
  - Test authenticated GET returns owner-scoped accounts with `assistantId` resolved from the current assistant assignment.
  - Test unauthenticated request returns 401.
  - Test owner A cannot receive account belonging to owner B.
  - Test upsert normalizes the identifier source fields but does not accept or return secret fields.

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run apps/api/src/controllers/channel-account.controller.test.ts`
  - Expected: FAIL because route/service do not exist.

- [ ] **Step 3: Implement service/controller/route**
  - Query `ChannelAccountModel.find({ ownerId })` only.
  - Resolve `assistantId` by finding an enabled assistant whose `channelScope.identifiers` contains `channelIdentifier(platform, externalId)`; otherwise return null.
  - Register route behind existing auth and `requireRole("admin", "agent")`.
  - Map all database rows to the contract and never select credential fields.

- [ ] **Step 4: Mount route and run focused tests**
  - Add `app.use("/api/v1/channel-accounts", channelAccountRouter)`.
  - Run: `pnpm exec vitest run apps/api/src/controllers/channel-account.controller.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Run: `git add apps/api/src/services/channel-account.service.ts apps/api/src/controllers/channel-account.controller.ts apps/api/src/routes/channel-account.routes.ts apps/api/src/controllers/channel-account.controller.test.ts apps/api/src/app.ts && git commit -m "feat: expose owner-scoped connected channels"`

### Task 3: Implement atomic assistant channel assignment

**Files:**
- Create: `apps/api/src/schemas/assistant-channel.schemas.ts`
- Modify: `apps/api/src/services/assistant.service.ts`
- Modify: `apps/api/src/routes/assistants.routes.ts`
- Modify: `apps/api/src/controllers/assistant.controller.ts`
- Create or modify: `apps/api/src/controllers/assistant-channel.controller.test.ts`
- Modify: `apps/api/src/services/assistant.service.test.ts`

**Interfaces:**
- Produces `PUT /api/v1/assistants/:assistantId/channels`.
- Request body: `{ channelIdentifiers: string[] }`.
- Response: `AssistantContract` with the saved `channelScope`.
- Service operation: `assignAssistantChannels(ownerId: string, assistantId: string, channelIdentifiers: string[]): Promise<AssistantContract>`.

- [ ] **Step 1: Write failing service/controller tests**
  - Success case assigns two owned channels to assistant B, removes those identifiers from assistant A, and returns assistant B.
  - Failure case rejects an identifier absent from `ChannelAccountModel` for that owner with 400/404 and leaves all assistants unchanged.
  - Failure case rejects another owner's assistant with 404.
  - Empty list removes all direct assignments from the target assistant and leaves those channels on default fallback.
  - Concurrent/duplicate ownership behavior is covered by a transaction or unique assignment update strategy.

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run apps/api/src/controllers/assistant-channel.controller.test.ts apps/api/src/services/assistant.service.test.ts`
  - Expected: FAIL because assignment endpoint/service do not exist.

- [ ] **Step 3: Implement validation and atomic service**
  - Validate Mongo ObjectId assistant route parameter and non-empty/unique string identifiers.
  - Verify every identifier maps to an owned connected channel.
  - In one Mongo transaction, remove the identifiers from every other assistant owned by the user, then set target assistant `channelScope.mode = "channels"` and the exact identifier list; for an empty list set target scope to `{ mode: "channels", identifiers: [] }`.
  - Preserve `isDefault` and all other assistant fields.
  - Add Vietnamese comment above the transaction function explaining that it prevents two direct assistants from owning the same channel.

- [ ] **Step 4: Add route/controller and run tests**
  - Add `PUT /:assistantId/channels` before generic assistant routes if route ordering requires it.
  - Run: `pnpm exec vitest run apps/api/src/controllers/assistant-channel.controller.test.ts apps/api/src/services/assistant.service.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Run: `git add apps/api/src/schemas/assistant-channel.schemas.ts apps/api/src/services/assistant.service.ts apps/api/src/routes/assistants.routes.ts apps/api/src/controllers/assistant.controller.ts apps/api/src/controllers/assistant-channel.controller.test.ts apps/api/src/services/assistant.service.test.ts && git commit -m "feat: assign assistants to connected channels"`

### Task 4: Expose Telegram personal account metadata

**Files:**
- Modify: `apps/api/src/services/telegram-personal.service.ts`
- Modify: `apps/api/src/channels/telegram-personal/telegram-personal.model.ts` only if a stable account projection is required
- Create or modify: `apps/api/src/services/telegram-personal.service.test.ts`
- Modify: `apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts`
- Modify: `apps/api/src/chatbot/chatbot-orchestrator.ts` and its tests

**Interfaces:**
- The connected QR session is exposed as a `ChannelAccount` with `platform: "telegram_personal"`, `externalId: telegramUserId`, display name/username and active/disconnected status.
- Personal Telegram inbound processing passes the account identifier separately from the conversation `channelId`, so one assistant applies to every chat of that connected account.
- No Telegram Bot registration, `getMe`, bot token or bot metadata is added.

- [ ] **Step 1: Write failing personal-account tests**
  - Create an active `TelegramPersonalSession` and assert the channel-account list exposes `telegram_personal:<telegramUserId>` with display name and username.
  - Assert disconnected sessions are returned with disconnected status or excluded according to the shared status contract, but never expose `encryptedSession`.
  - Assert personal inbound processing passes the stable account identifier to assistant resolution while preserving the per-chat `channelId` for conversation persistence.

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run apps/api/src/services/telegram-personal.service.test.ts apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts apps/api/src/chatbot/chatbot-orchestrator.test.ts`
  - Expected: FAIL because personal account metadata and account-scoped resolution do not exist.

- [ ] **Step 3: Implement minimal personal-account integration**
  - Map the active `TelegramPersonalSession` to the shared channel contract without copying `encryptedSession`.
  - Extend the inbound chatbot input with `accountIdentifier` and use it for assistant resolution; keep `channelId` for the customer conversation and outbound delivery.
  - Preserve QR login, session encryption, owner scoping, outgoing-message echo guards and current Telegram personal behavior.

- [ ] **Step 4: Run focused tests**
  - Run: `pnpm exec vitest run apps/api/src/services/telegram-personal.service.test.ts apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts apps/api/src/chatbot/chatbot-orchestrator.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Run: `git add apps/api/src/services/telegram-personal.service.ts apps/api/src/channels/telegram-personal/telegram-personal.model.ts apps/api/src/services/telegram-personal.service.test.ts apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts apps/api/src/chatbot/chatbot-orchestrator.ts apps/api/src/chatbot/chatbot-orchestrator.test.ts && git commit -m "feat: scope assistants to Telegram personal accounts"`

### Task 5: Add frontend apply-channels modal

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.test.tsx`
- Modify: `packages/contracts/src/index.ts` only if Task 1 identifies a missing shared frontend type

**Interfaces:**
- Consumes `GET /api/v1/channel-accounts` response `{ channels: ConnectedChannelContract[] }`.
- Calls `PUT /api/v1/assistants/:assistantId/channels` with `{ channelIdentifiers: string[] }`.
- Produces button accessible as `Áp dụng cho kênh`.
- Produces modal accessible as `Áp dụng chatbot cho kênh`, with selected checkboxes, loading/empty/error states and current assistant labels.

- [ ] **Step 1: Write failing component tests**
  - Open selected assistant and verify the button opens the modal.
  - Verify modal loads channels from the API and renders platform/display name/status.
  - Verify already-selected channels are checked.
  - Verify selecting an unassigned channel submits its stable identifier.
  - Verify a channel assigned to another assistant displays the warning and requires `window.confirm` before submit.
  - Verify canceling confirmation makes no PUT request and preserves current selection.
  - Verify clearing all channels submits an empty identifier list and the UI shows default fallback state.

- [ ] **Step 2: Run tests to verify they fail**
  - Run: `pnpm exec vitest run apps/web/src/pages/SettingsPage.test.tsx`
  - Expected: FAIL because the button/modal are not implemented.

- [ ] **Step 3: Implement state and modal**
  - Add typed channel state, modal open/loading/saving/error states, and selected identifier state.
  - Derive platform labels/icons from the returned platform value; never hardcode page names or IDs.
  - On open, fetch channels; initialize selection from `selected.channelScope.identifiers`.
  - On submit, detect channels whose `assistantId` differs from selected assistant and call `window.confirm`; only then call assignment API.
  - Update the selected assistant and channel list from the response, close modal on success, and preserve selection on failure.
  - Keep existing Knowledge modal bound to the selected assistant ID.

- [ ] **Step 4: Run focused frontend tests**
  - Run: `pnpm exec vitest run apps/web/src/pages/SettingsPage.test.tsx`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Run: `git add apps/web/src/pages/SettingsPage.tsx apps/web/src/pages/SettingsPage.test.tsx && git commit -m "feat: add assistant channel assignment UI"`

### Task 6: Documentation, regression suite and verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Test: existing backend/frontend suites

- [ ] **Step 1: Add Vietnamese Unreleased changelog entry**
- Document the generic channel assignment button, confirmation behavior, Telegram personal account metadata and future Facebook/Zalo connector boundary.

- [ ] **Step 2: Update README and Wiki**
  - Document how an admin assigns a chatbot to connected channels and explain that Facebook/Zalo OAuth connectors are not included yet.

- [ ] **Step 3: Run focused backend tests**
  - Run: `pnpm exec vitest run apps/api/src/models/channel-account.model.test.ts apps/api/src/controllers/channel-account.controller.test.ts apps/api/src/controllers/assistant-channel.controller.test.ts apps/api/src/services/assistant.service.test.ts apps/api/src/services/telegram.service.test.ts`
  - Expected: all listed tests PASS.

- [ ] **Step 4: Run focused frontend tests**
  - Run: `pnpm exec vitest run apps/web/src/pages/SettingsPage.test.tsx`
  - Expected: all Settings tests PASS.

- [ ] **Step 5: Run full verification**
  - Run: `pnpm test`
  - Expected: full Vitest suite PASS.
  - Run: `pnpm --dir apps/web run build`
  - Expected: production build PASS.
  - Run: `git diff --check`
  - Expected: no whitespace errors.
  - Run the repository lint/typecheck commands if available in the project scripts; report any pre-existing warnings separately.

- [ ] **Step 6: Commit documentation**
  - Run: `git add CHANGELOG.md README.md docs/wiki/README.md && git commit -m "docs: document assistant channel assignment"`

## Plan Self-Review

- Spec coverage: Knowledge isolation remains covered by the existing plan/spec work; this plan covers channel registry, assignment, fallback, confirmation, Telegram integration, frontend modal and documentation.
- Placeholder scan: no `TBD`, `TODO` or unspecified implementation steps are used.
- Type consistency: `ConnectedChannelContract`, `listConnectedChannels`, `upsertConnectedChannel`, `assignAssistantChannels`, `GET /api/v1/channel-accounts` and `PUT /api/v1/assistants/:assistantId/channels` are named consistently across tasks.
- Scope check: OAuth/webhook implementation for Facebook/Zalo is explicitly excluded; the deliverable is the reusable registry and assignment mechanism.
