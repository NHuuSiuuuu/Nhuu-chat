# Workspace Multi-channel Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add channel-scoped Workspace permissions and grouped multi-platform member controls while preserving personal-channel isolation and legacy Facebook permissions.

**Architecture:** Persist normalized `{ platform, channelId }` references on Workspace memberships, read old `allowedPages` as Facebook references, and centralize channel access filter construction. A Workspace channel directory will enumerate only non-personal channels owned by the Workspace owner; APIs, Inbox access, and realtime will consume the same effective permission set.

**Tech Stack:** TypeScript, Express, Mongoose, React, Vitest, shared TypeScript contracts, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-24-workspace-multichannel-access-design.md`

## Global Constraints

- Owner/Admin Workspace see every Workspace channel; empty Staff selection means unrestricted access.
- Personal Zalo and Telegram conversations remain private or assignment-scoped.
- A channel ID is only meaningful together with its platform.
- Keep `allowedPages` backward-compatible; do not run production migrations.
- Build authorization from authenticated Workspace membership, never client supplied owner IDs.

---

### Task 1: Channel reference contracts, legacy normalization, and access filters

**Files:**
- Modify `packages/contracts/src/index.ts` and contract tests if a `WorkspaceChannelRef` type fits existing exports.
- Modify `apps/api/src/models/workspace-member.model.ts`, `apps/api/src/schemas/workspace.schemas.ts`, `apps/api/src/auth/workspace.middleware.ts`.
- Create `apps/api/src/auth/workspace-channel-access.ts` and `.test.ts`.
- Modify `apps/api/src/realtime/access.ts` and its tests.

**Interfaces:**
- `WorkspaceChannelRef = { platform: "facebook" | "instagram" | "zalo" | "telegram"; channelId: string }`.
- `effectiveAllowedChannels(member)` returns canonical refs and maps legacy Page IDs to Facebook refs only when `allowedChannels` is absent.
- `workspaceChannelAccessFilter(ownerUserId, refs)` builds owner-scoped Mongo filters; empty refs means all shared Workspace platforms.

- [x] Write failing unit tests for duplicate IDs across platforms, legacy Page normalization, empty-list access, selected-channel access, and personal-platform exclusion.
- [x] Run focused tests and confirm they fail before implementation.
- [x] Add membership schema and Zod validation for unique channel refs; retain legacy `allowedPages`.
- [x] Populate Workspace context with canonical channel refs and Facebook-only `allowedPages` projection for existing Facebook publishing code.
- [x] Implement/reuse filter helper in REST and realtime access checks; preserve non-Workspace behavior.
- [x] Run focused API tests for Workspace context and access helpers.

### Task 2: Workspace channel directory and member API

**Files:**
- Modify `apps/api/src/services/workspace-member.service.ts` and tests.
- Modify `apps/api/src/controllers/workspaces.controller.ts` and tests.
- Modify `apps/api/src/routes/workspaces.routes.ts` and route tests.
- Use `FacebookPageConnectionModel` and `ConversationModel` as directory sources.

**Interfaces:**
- `GET /api/v1/workspaces/:workspaceId/channels` returns `{ channels: [{ platform, channelId, name, avatarUrl? }] }` for channels owned by that Workspace.
- Member POST/PATCH accepts `allowedChannels`; legacy `allowedPages` requests normalize to Facebook refs.
- Response includes canonical `allowedChannels` and the Facebook `allowedPages` projection.

- [x] Add failing tests for membership-only directory access, platform-aware validation, duplicate refs, legacy request normalization, and staff-visible channel filtering.
- [x] Run workspace API tests and confirm the expected failures.
- [x] Implement directory listing from connected Facebook Pages plus shared-platform conversations owned by the Workspace owner; exclude personal platforms.
- [x] Validate every assigned pair against the directory for the Workspace and persist canonical refs plus compatibility projection.
- [x] Run focused member service/controller/route tests.

### Task 3: Apply access policy to Inbox, Page APIs, and realtime

**Files:**
- Modify `apps/api/src/realtime/access.ts` and tests.
- Modify `apps/api/src/realtime/socket.ts` and tests.
- Modify `apps/api/src/channels/facebook-messenger/facebook-messenger.webhook.ts` and tests.
- Modify `apps/api/src/controllers/facebook-page.controller.ts` and tests.
- Review `apps/api/src/controllers/facebook-post.controller.ts`; retain its Page filter projection.

**Interfaces:**
- REST list/detail/send guards use `conversationAccessFilter(auth)` with owner plus permitted platform/channel pairs.
- Socket handshake stores canonical channel refs; `canJoinConversation` and emitted member recipients use those refs.
- Facebook connection/post filters continue using only the Facebook projection.

- [x] Add failing regression tests for staff channel isolation, cross-Workspace isolation, duplicate channel IDs across platforms, empty access, and personal-channel preservation.
- [x] Run focused conversation/message/socket/webhook tests and confirm failures.
- [x] Update REST and realtime paths to use canonical refs while preserving personal ownership behavior.
- [x] Run focused API test files covering all changed consumers.

### Task 4: Grouped channel selection UI and delivery

**Files:**
- Modify `apps/web/src/pages/SettingsPage.tsx` and `SettingsPage.test.tsx`.
- Modify `CHANGELOG.md` under `## [Unreleased]`.

**Interfaces:**
- Member form loads Workspace channels and submits `allowedChannels: WorkspaceChannelRef[]`.
- Each platform section contains channel checkboxes and its platform icon; existing membership rows display assigned channels.
- No selected checkbox means all channels, with clear explanatory copy.

- [x] Add failing tests for grouped platform headings/icons, selected-reference payload, and legacy Facebook response rendering.
- [x] Run focused Web settings tests and confirm failures.
- [x] Implement platform grouping and selection with accessible checkbox labels and existing responsive styles.
- [x] Run focused Web tests, Web production build, API TypeScript check, and `git diff --check`.
- [x] Review/stage only request files, commit on the current branch, and push `feature/nhuu-chat-mvp`.
