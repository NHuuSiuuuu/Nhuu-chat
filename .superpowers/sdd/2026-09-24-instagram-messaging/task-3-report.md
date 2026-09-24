# Task 3: Instagram webhook verification and event persistence

## Implemented

- Added the Instagram webhook challenge route at `/api/v1/webhooks/instagram`; it requires `hub.mode=subscribe`, a configured Instagram verify token (with the existing Meta webhook token as fallback), and uses constant-time comparison.
- Registered the POST route before `express.json()` with a 1 MiB raw-body limit. The route validates `X-Hub-Signature-256` against the exact raw bytes using configured `INSTAGRAM_APP_SECRET` before parsing JSON.
- Added bounded shape validation for root `object="instagram"` with nonempty `entry[].messaging[]`. Text messages are normalized with account-scoped IGSID/customer and provider message IDs. Echo events are handled as agent messages and do not increment unread.
- Resolves each event to exactly one connected Instagram account and persists Customer, Conversation and Message records in a Mongo transaction. Repeated provider message IDs do not duplicate messages, unread increments, or realtime events. Conversation previews only move forward by timestamp.
- Emits message and conversation updates through existing realtime helpers; Inbox recipients are resolved by the existing Workspace `platform`/`channelId` grants.

## TDD and focused verification

- RED: `pnpm --filter api exec vitest run src/channels/instagram/instagram-event.service.test.ts src/routes/instagram-webhook.routes.test.ts` — route tests returned 404 before app registration, and event tests could not load the missing event service.
- GREEN: same command — 2 files, 11 tests passed. Coverage includes raw-byte signature success and mismatch, GET challenge token validation, unknown and non-connected account rejection, normalized text persistence, multiple customers on one account, duplicate delivery, echo handling, invalid payload shape, and Workspace-authorized realtime helper usage.
- `git diff --check` passed.

## Limits and deferred verification

- The implementation uses the configured Instagram app secret for HMAC SHA-256 as directed by the plan's local implementation gate. No configured Meta development app or live webhook delivery was available to validate Meta's exact app-secret variant/payload against an actual subscription.
- The Meta object/entry/messaging payload shape was tested concretely as `{ object: "instagram", entry: [{ id, messaging: [...] }] }`. No Meta app setup, account subscription, production migration, or deployment was attempted.

## Reviewer follow-up: unsupported events and text fidelity

- Important finding: a structurally valid batch containing only unsupported events (such as attachments) raised `INSTAGRAM_WEBHOOK_PAYLOAD_INVALID`, prompting provider retries. Minor finding: normalization trimmed valid message text.
- RED: `pnpm --filter api exec vitest run src/channels/instagram/instagram-event.service.test.ts -t 'attachment-only|whitespace'` — both new regressions failed for the reported reasons.
- GREEN: `pnpm --filter api exec vitest run src/channels/instagram/instagram-event.service.test.ts src/routes/instagram-webhook.routes.test.ts` — 2 files, 13 tests passed. Valid unsupported batches now resolve as no-ops with no persistence or realtime emission; malformed root/entry validation remains strict. Text must contain a non-whitespace character but stored text preserves its original whitespace.
- `git diff --check` passed.
