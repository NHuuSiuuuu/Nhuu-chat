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

- A broader command that also included `src/routes/setting-history.routes.test.ts` initially exposed an incomplete mock: the test's history-service mock lacked `recordSettingHistorySafely`, which the new Instagram lifecycle service uses as its default. Added that export to the test mock; the route suite then passed 3/3 and the full API suite passed that file. This changes no production history behavior.
- No production migration, Meta app setup, or deployment was attempted.

## Reviewer follow-up

- RED: a historical Instagram conversation with no active account connection reappeared in `listChannels`; the regression test failed with `ig-disconnected` present in the directory.
- GREEN: Instagram is excluded from the conversation aggregate and ignored if an Instagram row is returned; only active `instagramRows` can populate that directory entry.
- `pnpm exec vitest run src/services/workspace-member.directory.test.ts src/services/workspace-member.service.test.ts` — 2 files, 12 tests passed; `git diff --check` passed.

## Reviewer follow-up: disconnected account grants

- Added a Staff-only `revokedChannels` deny list. Disconnect revokes the exact `{ platform: "instagram", channelId }` for all Staff in that owner's Workspace, including unrestricted Staff, without changing their saved grants. Owner/admin access and unrelated channel grants remain unchanged.
- REST conversation filters, socket join authorization, inbox event fanout, Workspace directory and `/instagram` connection listing all apply the exact deny. Empty `allowedChannels` remains unrestricted for every non-revoked channel. Reconnect clears only the matching deny so saved Staff grants resume; affected member sockets are invalidated only in the same Workspace.
- RED: regression for unrestricted Staff sending from a different Instagram account after another account was revoked failed because a redundant send-service allowlist check treated an empty allowlist as deny-all. Removed that duplicate check; the central `canJoinConversation` policy remains authoritative.
- Added model, revocation lifecycle, REST, directory, list-controller, outbound send, socket handshake, fanout and Workspace-room invalidation coverage. Socket fanout now explicitly selects `revokedChannels` from MongoDB.
- GREEN: focused verification — `pnpm exec vitest run` over the 12 Task 5 access/lifecycle suites — 11 files, 131 tests passed. `git diff --check` passed. No commit created; pending independent review.
- Root `pnpm exec tsc --noEmit --project tsconfig.base.json --pretty false` exits 2 on two unrelated diagnostics (`SettingsPage.test.tsx:3` import extension and `tests/security/webhook.spec.ts:5` missing auth module); no diagnostics remain in Task 5 changed files.
- Grant semantics: deny overrides the retained grant while disconnected; reconnect removes the exact deny and lets the existing explicit grant (or existing empty/unrestricted grant) apply again.
- Fresh-review P1: snapshot revocation alone did not cover a Staff member added after disconnect with `allowedChannels: []`. Staff request context and Socket handshake now load current `instagramUserId` values from `{ ownerUserId, status: "connected" }`; REST conversation filters and `canJoinConversation` intersect Instagram access with those active IDs. Event fanout performs the same active-account check before adding Staff recipients. Owner/admin retain historical access without the new lookup. `/instagram/connections` now filters every role to `status: "connected"`.
- RED reproduced the post-disconnect unrestricted Staff room access and owner list returning `remove_pending` records. GREEN: focused Task 5 verification passed 11 files / 137 tests; `git diff --check` passed. Root typecheck exits 2 only on the two unrelated diagnostics listed above.

## Integrated verification follow-up

- Added the missing `recordSettingHistorySafely` export to the history route test mock after the full API run exposed the import-time contract; focused route/event verification passed 14/14.
- Full API verification (latest run after the explicit Instagram grant fix): 159 files passed and 1 baseline schema assertion failed; 1,105 tests passed, 1 failed, 3 skipped. The failing `workspace.schemas.test.ts:30` expectation is unchanged from branch base and was independently reproduced on the detached baseline worktree (2 passed, 1 failed). The older empty-grant Instagram send test was updated to assert the spec-required 403; its service suite passed 51/51.
- Full Web verification from repository root: 49 files / 452 tests passed. This includes the cross-repo cursor test that identified and then verified the disabled Instagram attachment affordance classes.
- API/Web non-test source TypeScript check passed. Web production build passed with existing vendor directive and bundle-size warnings. `git diff --check` passed.
- Meta Developer public materials were rechecked for Instagram Login scope names, no-Page requirement, and Send API route; app-specific OAuth/webhook/subscription/token/policy behavior remains a staging release gate. No production migration or deployment was run.

## Important finding fix: explicit Instagram grants for Staff

- Root cause: shared access policy interpreted an empty Staff `allowedChannels` as unrestricted for every platform. Active account checks and revocation denies narrowed access to connected accounts but still exposed every active Instagram account to empty-grant Staff, including newly added Staff after disconnect.
- RED: added regression coverage for REST access filters, `canJoinConversation`, socket event fanout, Workspace channel directory, and `/instagram/connections`. Tests failed by showing active Instagram channels/fanout reaching empty-grant Staff.
- GREEN: empty Staff grants retain prior all-channel behavior for non-Instagram platforms. Instagram REST filters, room joins, fanout, directory entries, and connection-list responses now require an exact `{ platform: "instagram", channelId }` grant. Existing connected-account, historical-record, and revocation checks remain in effect.
- Focused verification: `pnpm exec vitest run` across 11 affected API suites — 11 files / 127 tests passed. `git diff --check` passed.
