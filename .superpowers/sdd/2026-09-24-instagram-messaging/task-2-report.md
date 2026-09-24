# Task 2: Instagram OAuth and connection lifecycle

## Implemented

- Separate Redis namespace `nhuu-chat:instagram-oauth:` with encrypted, one-time `GETDEL` state and 600-second TTL. Callback is authenticated, checks the initiating owner, and consumes cancellation state.
- Instagram Login uses `instagram_business_basic,instagram_business_manage_messages`. Short token exchange posts form data to `api.instagram.com/oauth/access_token`; long token exchange and refresh use `graph.instagram.com`. Profile identity uses `user_id`, with `id` deliberately ignored because it can be app scoped.
- Meta requests have a 10-second deadline and 64 KiB response bound. Provider bodies, codes, tokens, and secrets are absent from errors and frontend redirects. Callback redirects to the configured frontend origin's fixed `/dashboard` path.
- Global account claim uses the Task 1 unique model. Credentials use shared AES-GCM encryption, and response mapping selects metadata only. Connect reserves the account before subscription, confirms connected state after success, and leaves a retryable invalid record on subscription/confirmation failure. Reauthorization rotates the token; a failed subscription restores the previous working credential. Disconnect checks owner, unsubscribes before deletion, and returns `disconnected: false` on repeat or unowned ID. Connect/disconnect history records only safe metadata after success.
- Added authenticated routes and a cookie-based web API client. Staff listing filters by granted Instagram channel IDs; start and disconnect require Workspace owner.
- Added optional Instagram environment fields and `.env.example` entries. No secrets or live Meta app settings were supplied.

## RED evidence

| Command | Observed failure |
| --- | --- |
| `pnpm exec vitest run src/services/instagram-oauth.store.test.ts src/services/instagram-oauth.service.test.ts` (API) | 2 suites failed: Instagram store and service modules absent. |
| `pnpm exec vitest run src/services/instagram-account.service.test.ts` (API) | Account service module absent. |
| `pnpm exec vitest run src/controllers/instagram.controller.test.ts src/routes/instagram.routes.test.ts src/services/instagram-oauth.service.test.ts` (API) | Controller and route modules absent; cancellation test failed with `service.cancel is not a function`. |
| `pnpm exec vitest run src/services/instagram-account.service.test.ts src/services/instagram-meta.client.test.ts` (API) | Confirmation failure test received raw database error instead of `INSTAGRAM_CONNECTION_FAILED`. |
| `pnpm exec vitest run src/services/instagram-oauth.service.test.ts src/services/instagram-meta.client.test.ts` (API) | 3 tests failed because profile `id` was incorrectly compared with canonical `user_id`. |
| `pnpm exec vitest run src/services/instagram-account.service.test.ts -t 're-authorizes'` (API) | Existing account retained `encrypted:long-secret` instead of rotating to `encrypted:fresh-secret`. |
| `pnpm exec vitest run src/services/instagram-account.service.test.ts -t 'keeps the prior credential'` (API) | Failed reauthorization left account invalid with `encrypted:bad-secret`. |
| `pnpm exec vitest run src/env.test.ts` (config) | Expected environment object lacked new `INSTAGRAM_GRAPH_API_VERSION` default. |

## GREEN evidence

| Command | Result |
| --- | --- |
| `pnpm exec vitest run src/services/instagram-oauth.store.test.ts src/services/instagram-oauth.service.test.ts src/services/instagram-account.service.test.ts src/services/instagram-meta.client.test.ts src/controllers/instagram.controller.test.ts src/routes/instagram.routes.test.ts` (API) | 6 files, 23 tests passed. |
| `pnpm exec vitest run src/lib/instagram.api.test.ts` (Web) | 1 file, 2 tests passed. |
| `pnpm exec vitest run src/env.test.ts` (config) | 1 file, 18 tests passed. |
| `git diff --check` | Passed. |

## Validation and limits

- Meta's [official Instagram Postman collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login) confirms the Instagram Login permission names and Professional account scope. The plan already records the authorization, token, and refresh endpoints. No development Meta app response or live account was available, so Task 2's final endpoint/development-app checkbox remains open. The app version, profile fields, webhook subscription response, and refresh behavior need validation against a configured development app before release.
- `refreshLongToken` and `InstagramAccountService.refresh` are implemented; scheduling refresh before expiry is a later integration concern. A failed unsubscribe leaves the connection for retry.
- Root `tsc --noEmit --project tsconfig.base.json` reports errors in untouched realtime/outbound message tests and two Web tests. The initial run also caught a Task 2 test mock typing error, which was corrected. No unrelated test files were edited.
- An initial `pnpm --filter api test -- ...` invocation unexpectedly launched the full API suite; it was interrupted. It had already shown an unrelated Workspace schema test failure. Subsequent commands used direct focused Vitest paths.
