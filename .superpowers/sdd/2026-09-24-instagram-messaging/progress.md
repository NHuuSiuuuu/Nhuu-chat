# SDD ledger — plan: docs/superpowers/plans/2026-09-24-instagram-messaging.md

## Preflight scan
| Pair/task | Shared file or interface | Check/result |
|---|---|---|
| Task 1 ↔ Task 3 | Conversation/customer/message model and Instagram account identifiers | Task 1 establishes stable `instagramUserId`/conversation uniqueness; Task 3 consumes it for owner and customer mapping. Consistent. |
| Task 1 ↔ Task 2 | InstagramAccountConnection model | Task 1 defines encrypted token and globally unique provider account ID; Task 2 persists and queries it. Consistent. |
| Task 1 ↔ Task 4 | InstagramAccountConnection + Conversation | Task 4 reads token and recipient/account from Task 1 model. Consistent. |
| Task 1 ↔ Task 5 | InstagramAccountConnection channel ownership | Task 5 reads connected accounts as directory entries. Consistent. |
| Task 2 ↔ Task 3 | `app.ts` route registration/config and connection state | OAuth subscription establishes the account state consumed by webhook; raw-body handler must precede JSON parser. Consistent with explicit route-order requirement. |
| Task 2 ↔ Task 5 | connect/disconnect history | Task 2 writes lifecycle events; Task 5 verifies directory/access behavior and safe history semantics. Avoid duplicate history ownership by keeping writes in account service only. |
| Task 2 ↔ Task 6 | OAuth start/callback and safe connection DTO | Task 6 starts OAuth and reloads persisted connection after callback. Consistent. |
| Task 3 ↔ Task 4 | Message/conversation identity and channel ID | Webhook stores IGSID/customer and account channel; outbound path consumes those fields. Consistent. |
| Task 3 ↔ Task 5 | authorized Socket events and workspace channel grants | Event handling uses existing platform/channel access and directory. Consistent. |
| Task 4 ↔ Task 6 | Text-only composer and delivery errors | UI exposes text send; API enforces policy and maps failures. Consistent. |
| Task 6 ↔ Task 7 | README/wiki/changelog and branch delivery | Task 7 documents, verifies, then commits/pushes implementation. Consistent. |
| Task 1 self-scan | model/index/migration tests vs implementation files | Each artifact named in plan; duplicate preflight and regression coverage align. |
| Task 2 self-scan | OAuth store/service/controller/routes/config/client tests | Test paths cover each created service surface; APIs align with frontend client. |
| Task 3 self-scan | raw webhook route, normalized event service and tests | Signature, normalization, idempotency and realtime requirements map to named files. |
| Task 4 self-scan | sender client/message service and error tests | Outbound contract and policy errors align; official send-window behavior remains a verification gate. |
| Task 5 self-scan | directory/access/history sources and tests | Directory enumerates channels; canonical access helper is reused; history belongs to connection lifecycle service. |
| Task 6 self-scan | modal/dashboard/client/composer | Multiple-account channel selection and text-only send align with scope. |
| Task 7 self-scan | docs, suites, migration preflight, live gates | Keeps production migration and Meta acceptance separate from local verification. |

## Rulings
None.

## Baseline evidence
- Correct focused command: `pnpm --filter api exec vitest run src/models/indexes.test.ts src/services/workspace-member.service.test.ts` — 19 passed, 1 failed. The failure is the existing Instagram test showing that the old `{platform, channelId, ownerId}` unique index rejects a different customer on the same Instagram account. This is expected root behavior to change.
- An initial malformed command using `pnpm --filter api test -- ...` launched the full API suite due argument forwarding; it was stopped after unrelated suites emitted legacy warnings/logs. No code was changed by that run.

## Verified Meta facts used to refine implementation plan
- Current Meta Developers docs: Instagram Login scopes are `instagram_business_basic` and `instagram_business_manage_messages`; code exchange uses `api.instagram.com/oauth/access_token`, and short-lived user token can be exchanged/refreshed via `graph.instagram.com` endpoints. Messaging send is `POST graph.instagram.com/{version}/{ig-user-id}/messages`; a customer must initiate; standard 24-hour window; text limit is 1,000 UTF-8 bytes.
- Webhooks use object `instagram`, field `messages`, account `subscribed_apps` edge, root `{object, entry[]}`, inbound `messaging[]`, echo marker `message.is_echo`, and header `X-Hub-Signature-256`. Public docs leave exact secret variant unclear and examples have a root-shape inconsistency; implementation plan requires development-app verification.
- Sources: `https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login.md`, `.../messaging-api.md`, `https://developers.facebook.com/documentation/instagram-platform/webhooks.md`, `.../webhooks/examples.md`, and `.../messaging-api/user-profile.md`.

## Task 1 implementation
- Commit `0e04451` implements Task 1; focused evidence is in `task-1-report.md`.
- Task review is in progress.
- Review verdict: Task 1 approved, no Critical/Important findings; Minor note to reconcile unrelated full-suite failure against baseline (`review-6bb7fe0..0e04451.diff`). Task 1 complete at `0e04451`.
- Controller clarified verified Meta endpoints/scopes/webhook facts in design+plan and committed `docs: уточнить Instagram OAuth и webhook`; ambiguity about signature secret remains an explicit verification gate.
Task 1: complete (commits 6bb7fe0..0e04451, review clean)
Deferred minor: broader API suite had one unrelated Workspace schema failure; baseline rerun/reconciliation pending before final trust in suite-wide verification.
- Reconciled Task 1 deferred minor against base commit `6bb7fe0`: ran `pnpm --filter api exec vitest run src/schemas/workspace.schemas.test.ts` in a detached baseline worktree; the same `zalo_personal` schema expectation fails there (2 pass, 1 fail). This is confirmed pre-existing, not introduced by Task 1.

## Task 2 reviewer fix
- Reviewer Important: after Meta unsubscribe success, a local delete failure left `INSTAGRAM_REMOVE_PENDING` forever. Added RED tests for delete throw, delete null, and database failure while recording unsubscribe success; all three failed before the fix.
- Ruling: persist `INSTAGRAM_REMOVE_UNSUBSCRIBED` before local delete; retry only the delete from that state. If the marker cannot be persisted, wait for a 30-second lease and retry unsubscribe because its outcome is not durable. Cost if wrong: Meta may reject a repeated unsubscribe; development-app validation is still required.
- GREEN: `pnpm exec vitest run src/services/instagram-account.service.test.ts` — 11/11 passed. No duplicate history or re-subscribe path introduced.
- Commit `27efe38`: reviewer Important fix recorded in `task-2-report.md`; focused Instagram API suite 26/26 passed and `git diff --check` passed.
- Reviewer follow-up Important: connect could race with an account marked `INSTAGRAM_REMOVE_UNSUBSCRIBED` before local delete. Interleaving test RED (`connectError` undefined) → GREEN (`INSTAGRAM_CONNECTION_BUSY`); disconnect and once-only provider/history checks pass. Commit `f9813b2`; focused Instagram API suite 27/27 passed and `git diff --check` passed.
Task 2: complete (commits 969c003..f9813b2, review clean)
- Task 2 re-review confirmed both Important findings fixed. Deferred minor: a disconnect retry may repeat unsubscribe if provider success could not be durably recorded and the 30-second lease expires; Meta idempotency and all endpoint/profile/subscription/refresh behavior still need development-app validation.

## Task 3 implementation
- Added failing route/event tests first. RED evidence: endpoint returned 404 before registration; event service import was absent.
- Implemented raw-byte signature verification with `INSTAGRAM_APP_SECRET`, configured-token GET challenge, bounded `instagram` root + `entry[].messaging[]` validation, connected-account resolution, separate echo handling, transaction-backed Customer/Conversation/Message persistence, and duplicate suppression.
- Realtime updates use existing helpers, preserving Workspace `{ platform, channelId }` channel-grant filtering.
- GREEN: `pnpm --filter api exec vitest run src/channels/instagram/instagram-event.service.test.ts src/routes/instagram-webhook.routes.test.ts` — 2 files, 11 tests passed. `git diff --check` passed.
- Live Meta app secret variant, subscription and payload acceptance remains an explicit gate; no app setup, production migration, or deploy was attempted. Details: `task-3-report.md`.

## Task 3 reviewer follow-up
- Reviewer Important: valid attachment-only batches were treated as malformed and could trigger retry storms. RED regression failed with `INSTAGRAM_WEBHOOK_PAYLOAD_INVALID`; GREEN now returns an empty normalized event list (root/entry shape validation remains strict), so the webhook handler acknowledges the delivery with no persistence/realtime changes.
- Reviewer Minor: text content was trimmed. RED whitespace regression showed the stored value lost leading/trailing spaces; GREEN validates `trim()` nonemptiness but persists the original text.
- GREEN: focused webhook/event suite passed 2 files, 13 tests; `git diff --check` passed. Report details are in `task-3-report.md`.
Task 3: complete (commits f9813b2..c02d85d, review clean)
- Task 3 scoped re-review approved: attachment-only batches are no-ops; malformed structure remains rejected; original nonempty text whitespace is retained.
- Deferred Meta development-app validation: app-secret variant, subscribed webhook response, and actual delivery payload still need live confirmation.

## Task 4 implementation
- RED: focused outbound tests showed 8 missing service behaviors (success, account mismatch, staff grant, missing/expired credential, response window, UTF-8 size, permanent policy error); the Instagram client suite could not import the absent module.
- GREEN: `pnpm --filter api exec vitest run src/services/outbound-message.service.test.ts src/channels/instagram/instagram.client.test.ts` — 2 files, 51 tests passed. Coverage includes Send API contract, auth/recipient/credential/window/byte checks, permanent errors, one bounded 429 retry, retry exhaustion, and webhook echo persistence race.
- Implemented owner/channel validation before provider access, server-side credential decryption, namespaced provider IDs and duplicate echo recovery. Uncertain sends persist as pending; permanent provider errors persist as failed with a stable error code.
- Root TypeScript check exits 2 on unrelated existing files; final rerun had no diagnostics in Task 4 service/client/test files. `git diff --check` and staged diff check passed.
- Official Meta Postman entry confirms endpoint/payload and customer-initiation prerequisite. It does not state the 1,000-byte cap; official source revalidation of the cap and live error response mapping remains open. No live API, migration, or deploy was run.
Task 4: implementation commit `f21822a27a59d3af8ad8153afbdc3765a56c1ad5`; focused suite 51/51 passed. Official policy/error documentation gate remains open.

## Task 4 reviewer follow-up
- RED: focused service/client/controller tests failed for whitespace-only text, provider code 100's recipient-specific mapping, missing failed/pending trace update propagation, and missing controller socket emissions.
- GREEN: focused outbound/client/controller suite passed 3 files / 92 tests. The service rejects whitespace-only Instagram content before account lookup or API call; code 100 maps to generic `INSTAGRAM_REQUEST_REJECTED`.
- Failed/pending traces now carry the persisted response through the existing socket event path before the original stable error is forwarded. Conversation summary update and event emission are best effort and do not mask that error.
- Official provider-specific recipient code mapping remains unclaimed pending documentation verification.
Task 4: complete (commits f21822a..514281f, review clean)
- Reviewer fixes addressed: reject blank Instagram text before credentials/Meta; map undocumented code 100 generically; update conversation summary and emit failed/pending trace before forwarding the same stable error.
- Scoped re-review approved. Focused service/client/controller verification: 92/92 passed. Root `tsc` still exits 2 with eight diagnostics elsewhere, none in Task 4 changed files.
- Deferred external gates: Meta public docs checked here do not state the 1,000 UTF-8-byte limit or exact error classifications; no development app/live call. Keep these as release validation requirements.

## Task 5 implementation
- RED: focused Workspace/realtime/account lifecycle command had 2 failing directory cases because active Instagram accounts were absent; existing lifecycle/access suites passed.
- Added `InstagramAccountConnectionModel` directory query scoped to `{ ownerUserId, status: "connected" }` with safe profile fields only. Output channel ID is the canonical `instagramUserId`; staff filtering and realtime grants continue through the generic platform/channel path.
- Added multiple-account, owner/admin directory, staff-filter, Instagram realtime grant, and exact credential-free once-only lifecycle history assertions. Connected-only lookup means accounts in disconnect's invalid state disappear from directory; successful local deletion removes the account thereafter.
- GREEN: focused Workspace/history/REST access/Socket verification passed 12 files / 122 tests; `git diff --check` passed. Full command and scoped report: `task-5-report.md`.
- A broader attempt including `src/routes/setting-history.routes.test.ts` exposed its incomplete history-service mock (`recordSettingHistorySafely` missing) while importing the full app. Added the missing mock export; the route test passed 3/3 and the full API suite passed that file.
- Task 5 complete; no Meta app setup, production migration, or deployment.

## Task 5 reviewer follow-up
- RED regression reproduced that an old Instagram conversation repopulated a disconnected account (`ig-disconnected`) when no active Instagram connection existed.
- GREEN excludes Instagram from the conversation aggregate and ignores any Instagram aggregate rows; the Workspace directory now sources Instagram exclusively from active `instagramRows`.
- Focused directory and Workspace service suites passed 2 files / 12 tests; `git diff --check` passed. See `task-5-report.md`.
- Further reviewer follow-up: Staff-specific `revokedChannels` now deny the exact disconnected Instagram channel across REST, directory/list, socket joins and inbox fanout, while preserving owner/admin behavior and `allowedChannels: []` unrestricted semantics. Disconnect persists the exact deny before provider unsubscribe and disconnects affected Workspace-member sockets; reconnect clears only that deny and invalidates their sockets so prior grants resume.
- RED: unrestricted Staff outbound regression exposed a duplicate explicit-grant check in `message.service.ts`; removing the redundant guard leaves `canJoinConversation` as the shared policy. Added fanout projection assertion for `revokedChannels`.
- GREEN: focused Task 5 suite 11 files / 131 tests passed; `git diff --check` passed. Full branch delivery is pending final verification and commit/push.
- Root TypeScript check exits 2 on two unrelated diagnostics (Web Settings test import extension and security webhook missing auth module); no Task 5 diagnostics remain.
- Fresh-review P1: revoked-channel snapshots did not protect historical Instagram conversations from Staff added afterward with empty/unrestricted grants. Workspace REST context and Socket handshake now hydrate currently connected Instagram IDs for Staff only; central REST filters, `canJoinConversation`, and inbox fanout gate Staff Instagram access against those IDs. Owner/admin historical access stays as before. `/instagram/connections` returns connected rows only for every role.
- RED reproduced both the new-member stale-history access and owner list including a pending removal. GREEN: Task 5 focused suite 11 files / 137 tests passed; `git diff --check` passed. Fresh review approved after the exact-grant fix below.

## Task 5 final-review fix: explicit Instagram grants

- Final review found empty-grant Staff could access every active Instagram account despite the spec requiring explicit per-account grants.
- RED reproduced this in REST filters, Socket room access/fanout, Workspace directory, and `/instagram/connections`.
- GREEN preserves empty-grant behavior for non-Instagram platforms while requiring an exact active `{ platform: "instagram", channelId }` grant throughout those paths. Focused verification passed 11 files / 127 tests, and `git diff --check` passed.
- Scoped re-review verdict: ADDRESSED; no new Important regressions found. See `task-5-report.md` for details.
