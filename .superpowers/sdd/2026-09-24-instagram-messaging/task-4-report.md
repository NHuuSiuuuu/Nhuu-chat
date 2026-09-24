# Task 4: Instagram outbound text and policy-aware delivery

## Implemented

- Added `InstagramClient.sendText`, which posts JSON `{ recipient: { id }, message: { text } }` to `https://graph.instagram.com/{version}/{instagramUserId}/messages` with a server-side bearer token, 10-second request/body deadline, and 64 KiB response bound.
- Replays only a definite HTTP 429 rejection, at most once. Ambiguous transport/time-out failures and 5xx responses are not retried because Meta may have accepted the POST already.
- Outbound service requires authenticated Workspace context and owner match for Instagram. Staff must hold the exact `{ platform: "instagram", channelId }` grant. It validates the account-scoped `instagram:{account}:{IGSID}` customer ID before provider access.
- Checks the latest customer inbound message is strictly less than 24 hours old, enforces 1,000 UTF-8 bytes, loads a connected credential by both Instagram account ID and Workspace owner, rejects missing/expired/undecryptable credentials, and decrypts only server-side.
- Maps provider token, permission, recipient, policy, rejection and uncertain-delivery responses to stable domain codes. Failed permanent sends persist `deliveryStatus: "failed"`; uncertain sends persist `pending` with `metadata.errorCode`. Provider errors do not include response bodies, tokens or secrets.
- Namespaces sent provider message IDs as `instagram:{accountId}:{messageId}`. If the webhook `is_echo` arrives before the HTTP response, duplicate-key recovery returns the echo row instead of creating a second message.

## TDD evidence

Initial RED run: `pnpm --filter api exec vitest run src/services/outbound-message.service.test.ts src/channels/instagram/instagram.client.test.ts`.

- Eight new service scenarios failed before implementation: valid send, cross-account IGSID, staff without grant, missing credential, expired credential, closed 24-hour window, UTF-8 byte limit, and permanent policy error. The client test suite could not load the missing `instagram.client.ts` module.
- RED output showed Instagram fell through to the generic pending-message path without account lookup or provider request.

Final GREEN run: same command — 2 files, 51 tests passed (47 outbound service tests and 4 client tests). It covers the required cases, endpoint/body contract, single bounded 429 retry, no retries for permanent permission/recipient errors, retry exhaustion, and an `is_echo` persistence race. No live Meta calls were made.

`git diff --check` is part of the final commit verification.

## Meta documentation and remaining validation

- The design baseline states the standard 24-hour reply window and a 1,000 UTF-8-byte text limit. Task 4 implements both requirements, with an exact 24-hour cutoff rejected.
- The official Meta Instagram API Postman request checked during this task confirms the Instagram Login Send API URL shape, `recipient.id` plus `message.text`, and that the recipient must have messaged first: [Meta Instagram API Postman documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-9386f468-7714-490f-9bfc-9442db5c8f00).
- The checked official entry did not state the 1,000-byte limit. The Meta Developers messaging page was inaccessible to the web tool, and no configured development app was available. Public-source revalidation of the byte cap, 24-hour boundary wording, and exact response error codes remains open; the limits/error classifications have not been live-validated.
- There is no app configuration, production migration, deployment, or live API test in this task.

## TypeScript check

The root `pnpm exec tsc --noEmit --project tsconfig.base.json --pretty false` is a broad repository check and exits nonzero on pre-existing errors in unrelated realtime, webhook-event, Web test, and security test files. Task 4-specific diagnostics are recorded after the final rerun.
