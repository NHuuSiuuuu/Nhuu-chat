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
