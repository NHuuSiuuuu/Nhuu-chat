# Workspace Personal Channel Access Implementation Plan

> **For agentic workers:** Execute inline using TDD and verify each API, Inbox, realtime, and outbound boundary before committing.

**Goal:** Let Workspace staff access and reply through the owner's connected Zalo Personal and Telegram Personal sessions only when those platform/account channels are assigned.

**Architecture:** Represent personal session access as `zalo_personal` or `telegram_personal` plus the owning user's stable ID. Workspace channel directory uses the connected session as its source and includes a display-only external account ID. REST and realtime conversation filters match personal conversations by Workspace owner and platform permission; outbound sends resolve the connector with the Workspace owner ID only after access passes.

**Tech Stack:** TypeScript, Express, Mongoose, React, Vitest, Socket.IO.

**Spec:** Update `docs/superpowers/specs/2026-09-24-workspace-multichannel-access-design.md` to include the approved personal-session sharing boundary.

## Global Constraints

- Never expose encrypted credentials or use staff-owned sessions for Workspace replies.
- Empty `allowedChannels` remains unrestricted for the Workspace.
- Preserve personal-channel isolation when a request has no Workspace context.
- Use only the Workspace owner's connected/active sessions and reject disconnected sessions.
- Comments for meaningful business logic are Vietnamese.

---

### Task 1: Types, session channel directory, and grouped form

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/models/workspace-member.model.ts`
- Modify: `apps/api/src/services/workspace-member.service.ts`
- Test: `apps/api/src/services/workspace-member.service.test.ts`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Test: `apps/web/src/pages/SettingsPage.test.tsx`

- [x] Add failing tests for active owner Zalo/Telegram sessions appearing as assignable Workspace channels, disconnected sessions being omitted, and dynamic platform grouping rendering every API platform.
- [x] Run the tests and confirm they fail because personal types are excluded and the renderer loops a fixed platform array.
- [x] Add personal platforms to Workspace channel refs; load connected sessions without encrypted secrets; keep stable owner ID as permission channel ID and provide external account ID for display.
- [x] Group fetched channel data by its `platform` and render with `Object.entries`, platform label fallback, and the existing platform icon component.
- [x] Run service and Settings focused tests.

### Task 2: REST and realtime access boundaries

**Files:**
- Modify: `apps/api/src/auth/workspace-channel-access.ts`
- Modify: `apps/api/src/auth/workspace.middleware.ts`
- Modify: `apps/api/src/realtime/access.ts`
- Modify: `apps/api/src/realtime/socket.ts`
- Tests: matching access, middleware, and socket test files.

- [x] Add failing tests showing assigned staff can read/join only the owner's matching personal platform conversations; wrong Workspace, platform, owner, or unassigned staff remain denied; owner/admin retain access.
- [x] Run tests and confirm current personal-owner-only filters reject the staff member.
- [x] Expand channel filters to include the two personal platforms, binding these channel refs to the Workspace owner ID, and retain legacy personal ownership without Workspace context.
- [x] Update socket message recipient fan-out to include only Workspace members assigned that personal platform.
- [x] Run access, middleware, controller, and Socket focused tests.

### Task 3: Outbound session selection and delivery safety

**Files:**
- Modify: `apps/api/src/services/message.service.ts`
- Tests: `apps/api/src/services/outbound-message.service.test.ts`

- [x] Add failing tests that an assigned staff member sends through the owner's active Zalo/Telegram client, while unassigned, disconnected, or cross-Workspace requests are rejected before connector use.
- [x] Run tests and confirm sends currently resolve the staff member's session and fail.
- [x] After `canJoinConversation`, resolve personal connector owner from authenticated Workspace context; preserve own-session behavior for requests without Workspace context.
- [x] Run outbound and conversation-message tests.

### Task 4: Spec, changelog, verification, and delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-workspace-multichannel-access-design.md`
- Modify: `CHANGELOG.md`

- [x] Record personal session sharing, its owner-bound channel identity, and no-Workspace behavior in the spec.
- [x] Add a Vietnamese Unreleased changelog entry.
- [x] Run all focused API tests, relevant Web tests, API/Web type checks, Web build, and `git diff --check`.
- [x] Stage only this task's files, commit with a Vietnamese Conventional Commit summary, and push the current feature branch.
