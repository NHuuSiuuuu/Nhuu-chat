# Instagram Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram Login and text-DM support to the shared NhuuChat Inbox, including Workspace permissions and multi-account connection management.

**Architecture:** Keep Instagram credentials and OAuth isolated from Facebook Page connections. Persist one globally unique Instagram Professional account connection per Workspace owner, normalize incoming Instagram DMs into existing customer/conversation/message records, and reuse Workspace `{ platform, channelId }` authorization across REST and Socket. Connect the Instagram source to the existing dashboard and channel directory.

**Tech Stack:** TypeScript, Express, Mongoose, MongoDB, Redis OAuth state, React, shared contracts, existing encryption and Socket.IO infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-24-instagram-messaging-design.md`

## Global constraints

- Use Instagram Login; do not require a Facebook Page or reuse Facebook OAuth states/tokens.
- Only Instagram Professional Business/Creator accounts and one-to-one text DMs are in scope.
- Keep credentials server-side, encrypted at rest, excluded from DTOs/logs/realtime, and revoke/remove safely.
- `platform="instagram"` channel authorization is the pair `{ platform, channelId: instagramUserId }`; client-supplied ownership is never authoritative.
- One Instagram account belongs to one Workspace; multiple different Instagram accounts may belong to a Workspace.
- Use the verified Instagram Login scopes `instagram_business_basic` and `instagram_business_manage_messages`. Reconfirm current Meta docs during implementation for app review/version details.
- OAuth code exchange starts at `api.instagram.com/oauth/access_token`; exchange the resulting short-lived token through `graph.instagram.com/access_token` for a long-lived token and refresh before expiry.
- Subscribe to the Instagram object's `messages` field, validate `X-Hub-Signature-256` on raw bytes, and use the `instagram` webhook payload object. Meta docs are ambiguous about the exact app-secret variant for signature; verify with the configured development app.
- Instagram text Send API: `POST graph.instagram.com/{version}/{ig-user-id}/messages`. Customer must have messaged first; standard window is 24 hours and text is limited to 1,000 UTF-8 bytes per current Meta docs. Map policy failures permanently; do not retry them.
- Migration must preflight duplicates, be idempotent, preserve Facebook/other platform indexes, and must not run against production without backup and explicit operational readiness.
- Follow TDD for changed behavior: add a focused failing test, run it to observe failure, implement the minimal path, then run focused tests. Do not weaken or delete unrelated assertions.

---

### Task 1: Instagram contracts, connection model, and safe conversation indexes

**Files:**
- Modify `packages/contracts/src/index.ts` with `InstagramConnectionResponse` and OAuth/list/disconnect response types.
- Create `apps/api/src/models/instagram-account-connection.model.ts` and `.test.ts`.
- Modify `apps/api/src/models/conversation.model.ts` and `apps/api/src/models/indexes.test.ts`.
- Create `apps/api/src/db/migrate-instagram-conversation-customer-index.ts` and `.test.ts`.
- Register the migration in `apps/api/src/db/` startup/migration runner only if that is the established deployment entry point.

**Interfaces and migration behavior:**
- Connection record contains Workspace owner, global unique Instagram user ID, public profile metadata, encrypted token, expiry/status/subscription fields and timestamps; encrypted token has `select: false`.
- Replace the current combined non-Facebook unique conversation index with explicit partial indexes so Instagram uniqueness includes `customerId`, while Telegram/Zalo and personal-platform uniqueness retain existing semantics.
- Migration inspects existing index definitions and duplicate Instagram tuples before changes; on conflicts it reports IDs and exits without dropping data. Safe rerun is required.

- [x] Add failing tests for token exclusion, account-ID global uniqueness, multiple DMs under one Instagram account, and unchanged Facebook/Zalo/Telegram uniqueness.
- [x] Run the model/migration focused tests and confirm they fail for the intended missing behavior.
- [x] Implement the model and migration with duplicate preflight and no destructive record rewrite.
- [x] Verify migration against an isolated Mongo fixture containing Facebook, non-Facebook, duplicate, and empty collections.

### Task 2: Isolated Instagram OAuth and connection lifecycle

**Files:**
- Create `apps/api/src/services/instagram-oauth.store.ts` and tests, with Instagram-specific Redis key namespace and one-time TTL state.
- Create `apps/api/src/services/instagram-oauth.service.ts` and tests.
- Create `apps/api/src/services/instagram-account.service.ts` and tests.
- Create `apps/api/src/controllers/instagram.controller.ts` and tests.
- Create `apps/api/src/routes/instagram.routes.ts` and route tests.
- Modify `apps/api/src/app.ts`, API environment/config validation, and `.env.example` for Instagram config and routes.
- Create `apps/web/src/lib/instagram.api.ts` and tests.

**Interfaces:**
- `GET /api/v1/instagram/oauth/start` starts OAuth for the authenticated owner and returns/redirects to the Meta authorization URL.
- `GET /api/v1/instagram/oauth/callback` validates one-time state, exchanges code at `api.instagram.com/oauth/access_token`, exchanges short-lived token for long-lived token, fetches `/me` profile metadata, persists encrypted credentials, subscribes the required webhook, and returns through an allowlisted frontend completion route.
- `GET /api/v1/instagram/connections` lists safe connection metadata for the authenticated owner.
- `DELETE /api/v1/instagram/connections/:connectionId` disconnects only a connection owned by caller and records history after success.
- Reuse shared encryption primitives and connection/history conventions where appropriate, not Facebook-specific database records or OAuth states.

- [x] Add failing tests for valid/cancelled/expired/replayed OAuth state, wrong-user callback, account already claimed, token encryption, provider failure, and ownership-checked disconnect.
- [x] Confirm focused tests fail before implementation.
- [x] Implement bounded Meta HTTP calls, callback-safe error handling, masked logs, token encryption, safe DTOs, and idempotent disconnect.
- [ ] Use scopes `instagram_business_basic,instagram_business_manage_messages`; verify the exact authorization/token/profile endpoints and long-lived token refresh against official Meta docs and development-app responses before setting defaults.

### Task 3: Instagram webhook verification, event normalization, and persistence

**Files:**
- Create `apps/api/src/channels/instagram/instagram.webhook.ts` and tests.
- Create `apps/api/src/channels/instagram/instagram-event.service.ts` and tests.
- Create `apps/api/src/routes/instagram-webhook.routes.ts` and route tests.
- Modify `apps/api/src/app.ts` to register raw body/webhook verification before JSON parsing if required by Meta signature verification.
- Reuse existing `CustomerModel`, `ConversationModel`, `MessageModel`, persistence and realtime event helpers.

**Interfaces:**
- GET webhook verification follows the current Meta challenge contract (`hub.mode`, `hub.verify_token`, return `hub.challenge`) and is constrained by configured verify token.
- POST webhook validates `X-Hub-Signature-256` over the exact raw body, expects concrete root `object="instagram"` with batched `entry[].messaging[]`, resolves one active connection by `entry.id`, and rejects unknown/invalid accounts. Handle inbound and `message.is_echo` separately. Verify the app-secret variant with a development app because Meta's public guide is unclear on this detail.
- Normalize one-to-one text DMs to `platform="instagram"`, account `channelId`, Workspace `ownerId`, and namespaced IGSID/customer and provider message identifiers.
- Duplicate delivery is idempotent; unread and last-message fields update once; publish realtime only to authorized Workspace recipients.

- [ ] Add failing tests for signature mismatch, invalid account, status mismatch, text message normalization, multiple customers, repeated delivery, and realtime isolation.
- [ ] Run webhook/event focused tests and confirm expected failures.
- [ ] Implement raw-body verification, bounded payload validation, event-to-domain mapping, persistence, idempotency, and authorized emit.
- [ ] Configure app `instagram` webhook object with `messages`, then subscribe each professional account using `POST graph.instagram.com/{version}/{ig-user-id}/subscribed_apps?subscribed_fields=messages`; verify current requirements and payload using official Meta docs/development app before enabling subscriptions.

### Task 4: Outbound text messaging and policy-aware errors

**Files:**
- Create `apps/api/src/channels/instagram/instagram.client.ts` and tests.
- Modify `apps/api/src/services/message.service.ts` and its tests.
- Modify message schemas/error mapping only where required.

**Interfaces:**
- Send text through the current Instagram Send API using encrypted account credentials and the conversation’s IGSID.
- Verify caller’s Workspace/channel access and conversation platform/account before any external API request.
- Persist provider message ID and delivery/error state using existing message flow; apply bounded retry only to safe transient errors.
- Enforce Meta's standard 24-hour response window and 1,000 UTF-8-byte text maximum (subject to revalidation); represent policy window, permission, recipient and token errors with stable domain error codes; do not retry permanent/policy failures.

- [ ] Add failing tests for valid Instagram text send, cross-account recipient denial, unauthorized staff, missing/expired credential, Meta policy error, and bounded transient retry.
- [ ] Run focused message service/client tests and confirm expected failures.
- [ ] Implement server-side account lookup/decryption, authorization guard, Meta request, and delivery/error mapping.
- [ ] Confirm send window, text byte limit, and error semantics against current official Meta docs and API responses.

### Task 5: Workspace channel directory, realtime access, and activity history

**Files:**
- Modify `apps/api/src/services/workspace-member.service.ts` and tests to include active Instagram accounts in `listOwned`.
- Modify workspace route/service tests only if serialization requires changes.
- Modify `apps/api/src/realtime/access.ts`, Socket/event tests if Instagram requires a new case beyond existing platform-generic filtering.
- Reuse existing generic `CONNECT_CHANNEL` / `DISCONNECT_CHANNEL` event and history metadata.

**Requirements:**
- Directory entry is `{ platform: "instagram", channelId: instagramUserId, name, avatarUrl? }` for each connected account.
- Owner/Admin see all connected Instagram channels; Staff visibility remains restricted by the existing `allowedChannels` filter.
- Disconnect removes access/directory visibility without changing other Instagram accounts or channels.
- OAuth callback retries and duplicate disconnect requests cannot create duplicate history entries.

- [ ] Add failing tests for listing multiple Instagram accounts, owner/staff channel filtering, disconnect visibility, and exactly-once safe history metadata.
- [ ] Run focused Workspace directory/access/realtime tests and confirm expected failures.
- [ ] Implement directory source and history integration, preserving the existing Facebook and personal-channel behavior.
- [ ] Run focused Workspace, history, REST access, and Socket tests.

### Task 6: Connect modal, dashboard account state, and Inbox experience

**Files:**
- Modify `apps/web/src/components/connections/ConnectModal.tsx` and its tests.
- Modify `apps/web/src/pages/DashboardPage.tsx` and tests to load Instagram connections, expose per-account filter state, and handle load errors.
- Modify `apps/web/src/lib/instagram.api.ts` for list/disconnect and typed errors.
- Modify Inbox compose/account selection components only if the current selected-channel context does not already distinguish Instagram account IDs.
- Modify `CHANGELOG.md` under `## [Unreleased]` when implementation is delivered.

**Requirements:**
- Instagram opens independent OAuth; show connecting/cancel/error/connected/disconnect states and profile metadata.
- Reload dashboard connection state after OAuth completion; never rely on client-only success query without fetching saved server state.
- Existing platform filters include Instagram and distinguish multiple accounts by channel ID.
- Composer allows text only for Instagram; unsupported attachment actions are disabled with clear UI state until supported.

- [ ] Add failing UI tests for OAuth trigger, multiple connection rows/status, cancel/error, disconnect, account filter and text-only composer.
- [ ] Run focused Web tests and confirm expected failures.
- [ ] Implement UI with existing connection modal, custom toast, loading and empty/error patterns.
- [ ] Run focused Web tests, TypeScript check, production build, and `git diff --check`.

### Task 7: Integrated verification and rollout readiness

**Files:**
- Review all Instagram API, model, migration, webhook, message, Workspace, realtime and UI changes.
- Update `README.md` and `docs/wiki/` with setup, Meta app requirements, OAuth URLs, webhook setup, usage, limitations and deployment order.
- Update implementation changelog under `CHANGELOG.md`.

- [ ] Run API focused tests for OAuth, account, webhook, messages, Workspace access and migration.
- [ ] Run full API tests, Web focused tests, TypeScript checks and production build; document unrelated pre-existing failures separately.
- [ ] Perform migration preflight on an isolated copy/fixture and record rollback steps; do not run production migration until backup and duplicate report are reviewed.
- [ ] Verify Meta app configuration, HTTPS callback, scopes/Advanced Access, webhook subscription and test professional accounts in development/staging.
- [ ] Test end-to-end: OAuth, incoming DM, staff access grant, realtime receive, text reply, history event, disconnect, and reconnect.
- [ ] Inspect `git diff`, stage only Instagram feature files, commit with a concise Conventional Commit message, and push the current feature branch after all applicable verification passes.

## Dependencies and release gates

- Meta Developer app must have Instagram Login enabled and approved permissions/access for the intended accounts.
- Production callback and webhook endpoints require HTTPS and correct public-domain registration.
- Credentials, encryption configuration and webhook verification values must be provisioned server-side before enabling OAuth.
- Production migration and Meta live acceptance are separate operational gates; neither is implied by local tests/build.
