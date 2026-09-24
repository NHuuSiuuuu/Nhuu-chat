# Task 5: Workspace directory, access, and history

## Implemented

- `WorkspaceMemberService.listOwned` now reads only Instagram account connections with `status: "connected"`, selecting public identity fields only. It emits `{ platform: "instagram", channelId: instagramUserId, name, avatarUrl? }`, choosing display name, then username, then Instagram ID as the name.
- Existing `listChannels` behavior gives owners and admins the complete connected channel directory. Staff remain filtered by their exact existing `{ platform, channelId }` grants. Realtime access already used the shared generic platform/channel grant helper; the added test confirms it scopes Instagram staff access to the granted account and Workspace owner.
- Lifecycle tests now assert exact, credential-free connect/disconnect history metadata and once-only history across a repeated connect/reauthorization or duplicate disconnect. A repeated disconnect returns `disconnected: false` after the account is removed. The directory query's connected-only filter removes an account from visibility during disconnect's invalidating phase and after deletion.
- Facebook Page and personal-channel source/query logic was left unchanged.

## TDD and verification

- RED: `pnpm --filter api exec vitest run src/services/workspace-member.directory.test.ts src/services/workspace-member.service.test.ts src/services/instagram-account.service.test.ts src/realtime/access.test.ts` — 2 new directory tests failed because Instagram entries were absent; the existing lifecycle, Workspace service, and realtime suites passed (31 tests).
- GREEN: focused Workspace, history, REST access and Socket command passed 12 files / 122 tests:
  `pnpm --filter api exec vitest run src/services/workspace-member.directory.test.ts src/services/workspace-member.service.test.ts src/controllers/workspaces.routes.test.ts src/services/instagram-account.service.test.ts src/services/setting-history.service.test.ts src/services/setting-history.integration.test.ts src/services/setting-history-concurrency.test.ts src/controllers/setting-history.controller.test.ts src/realtime/access.test.ts src/realtime/socket.test.ts src/auth/workspace-channel-access.test.ts src/auth/inbox-access.test.ts`
- `git diff --check` passed.

## Verification note

- A broader command that also included `src/routes/setting-history.routes.test.ts` hit an existing mock setup failure: that test's `setting-history.service.js` mock exports only `listSettingHistories`, while importing the full app also initializes the Instagram account service, which requires `recordSettingHistorySafely`. The related history service, controller, concurrency, Mongo integration, Workspace route, and Socket suites passed in the final focused run. No out-of-scope route test or production history code was changed.
- No production migration, Meta app setup, or deployment was attempted.
