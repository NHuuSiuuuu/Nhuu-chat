# Facebook Messenger Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhận tin nhắn văn bản mới từ Facebook Page đã kết nối và cho phép nhân viên trả lời khách trong Inbox hiện tại.

**Architecture:** Mở rộng kết nối Page/OAuth hiện có để kiểm tra quyền Messenger và đăng ký webhook; thêm adapter Messenger có xác minh chữ ký, ánh xạ Page-owner, chuẩn hóa và idempotency theo schema Inbox. Mở rộng sender hiện có để gửi Messenger qua Send API, rồi dùng giao diện Inbox hiện tại và Socket.IO để nhận/gửi tin.

**Tech Stack:** Node.js, Express 5, TypeScript, MongoDB/Mongoose, Vitest, React, Socket.IO, native `fetch` tới Meta Graph API.

**Spec:** `docs/superpowers/specs/2026-09-23-facebook-messenger-inbox-design.md`

## Global Constraints

- Một Facebook Page cho mỗi tài khoản NhuuChat, theo giới hạn kết nối hiện tại.
- Tiếp tục lưu Page Access Token đã mã hóa trong `FacebookPageConnection`.
- Nhận tin nhắn văn bản mới sau khi Page đăng ký webhook với Meta.
- Nhân viên gửi tin nhắn văn bản từ Inbox tới khách qua Messenger Send API.
- Chống ghi trùng sự kiện webhook và giữ phạm vi truy cập đúng tài khoản/Page.
- Send API dùng Page Access Token được cấp bởi người có tác vụ nhắn tin (`MESSAGE`) trên Page cùng quyền `pages_messaging`.
- Tin trả lời chuẩn chỉ được gửi trong cửa sổ 24 giờ kể từ tin nhắn gần nhất do khách gửi. MVP không dùng message tag hoặc luồng gửi ngoài cửa sổ này.
- Customer identity dùng khóa nội bộ `facebook:<pageId>:<PSID>` trong `Customer.platformId`; Facebook adapter tách PSID gốc trước khi gọi Meta.
- Page ID trong webhook phải ánh xạ chính xác tới một tài khoản NhuuChat. Không fan-out một sự kiện sang nhiều owner.
- Không đưa App Secret, Page Access Token hoặc webhook verify token vào API response/log.
- Composer của Facebook MVP chỉ bật gửi văn bản. Không hiển thị trạng thái gửi thành công nếu Meta trả lỗi.
- MVP không gồm AI tự động trả lời, gửi media, nhập lịch sử hội thoại cũ, nhiều Page trên một tài khoản, message tag hoặc gửi ngoài chính sách Messenger.
- Không thêm dependency mới nếu native fetch và module hiện có đủ dùng.

## File Map

- Modify `apps/api/src/services/facebook-oauth.service.ts` and its tests: request Messenger permissions while preserving publishing scopes and validate selected Page messaging tasks.
- Modify `apps/api/src/services/facebook-page.service.ts`, its tests, and `apps/api/src/models/facebook-page-connection.model.ts`: validate Messenger capability, preserve encrypted credentials, enforce unique Page ownership with a checked migration/data preflight rather than an unsafe index rollout.
- Create `apps/api/src/channels/facebook-messenger/facebook-messenger.client.ts` and `.test.ts`: Graph Send API call, Page webhook subscription and safe error mapping with injected fetch.
- Create `apps/api/src/channels/facebook-messenger/facebook-messenger.normalizer.ts` and `.test.ts`: convert supported customer messages and echoes to the existing platform/message contract; namespace customer and external IDs.
- Create `apps/api/src/channels/facebook-messenger/facebook-messenger.webhook.ts` and integration tests: verify GET challenge and POST raw-body signature; resolve connected Page; persist idempotently; update unread once; emit existing realtime events.
- Create `apps/api/src/routes/facebook-messenger-webhook.routes.ts`; modify `apps/api/src/app.ts` for raw-body signature access and route registration without changing JSON parsing for other routes.
- Modify `apps/api/src/services/message.service.ts` and `apps/api/src/services/outbound-message.service.test.ts`: route Facebook text through sender, use owner+Page connection, decrypt token only in memory, enforce 24-hour window, persist Meta message ID and safe delivery state.
- Modify `packages/contracts/src/index.ts` only if current message/conversation contracts cannot carry the required Facebook-safe metadata; add focused contract tests where applicable.
- Modify `apps/web/src/components/dashboard/ConnectModal.tsx` and its tests to display/use the OAuth `canMessage` capability while preserving the separate `canPublish` state.
- Modify `apps/web/src/pages/InboxPage.tsx`, `apps/web/src/components/conversations/MessageComposer.tsx`, and focused tests only where the shared Inbox needs Facebook platform filtering or text-only composer restrictions.
- Modify the existing Facebook OAuth safe-error mapping in the dashboard connection flow so a Page lacking messaging permission gets a clear Vietnamese explanation.
- Modify `CHANGELOG.md` and deployment configuration documentation for required Meta webhook/app secrets after implementation.

### Task 1: Confirm persistence and identity constraints

**Files:**
- Modify: `apps/api/src/models/facebook-page-connection.model.ts` only if schema constraints require a persisted webhook capability/status.
- Test: `apps/api/src/models/facebook-page-connection.model.test.ts` (create if model tests are absent).
- Test: `apps/api/src/models/indexes.test.ts` and focused connection service tests.
- Create only if existing indexes cannot express safe ownership: `apps/api/src/db/migrate-facebook-page-owner-index.ts` and its tests.

**Interfaces:**
- Consume the existing encrypted `FacebookPageConnection` record and existing customer/conversation/message models.
- Produce an explicit, tested ownership rule: one Page ID maps to at most one `userId`; conflicts fail closed with a safe `FACEBOOK_PAGE_ALREADY_CONNECTED` error.
- Customer platform ID is exactly `facebook:<pageId>:<PSID>`; message external ID is exactly `facebook:<pageId>:<mid>`.

- [ ] Inspect existing records/index definitions in `facebook-page-connection.model.ts`, `models/indexes.test.ts`, and connection service tests; record the migration preflight behavior in the migration test.
- [ ] Add failing tests for another owner's Page conflict, same-owner reconnect, and no change to existing connection after rejected conflict.
- [ ] Implement owner uniqueness using the smallest safe mechanism; if adding a unique `pageId` index, add an idempotent migration that reports duplicates and makes no destructive edits until duplicates are resolved.
- [ ] Run the model/service/migration focused tests and commit this persistence slice.

### Task 2: Extend OAuth and Page connection for Messenger

**Files:**
- Modify: `apps/api/src/services/facebook-oauth.service.ts` and `apps/api/src/services/facebook-oauth.service.test.ts`.
- Modify: `apps/api/src/services/facebook-page.service.ts` and `apps/api/src/services/facebook-page.service.test.ts`.
- Modify: `apps/api/src/controllers/facebook-page.controller.ts` and `apps/api/src/routes/facebook-page.routes.ts` if response or subscription orchestration changes.
- Modify: `apps/api/src/schemas/facebook-page.schemas.ts` only if the safe error contract needs a new code.

**Interfaces:**
- OAuth authorization scope retains `pages_show_list,pages_read_engagement,pages_manage_posts` and adds `pages_messaging` plus the Meta permission required to manage Page webhook subscriptions.
- OAuth Page listing records messaging eligibility separately from `canPublish`; selection rejects a Page without a messaging-capable task.
- `FacebookPageService.connect(userId, { pageId, pageAccessToken })` persists only after Graph confirms Page identity; OAuth selection separately enforces the Page messaging task.
- Manual token entry remains usable for internal testing. Messenger-specific permission errors are checked and returned safely by the actual Page subscription and Send API operations; do not use the Conversations API as a preflight because its task requirements differ from Send API eligibility.

- [ ] Add failing tests for OAuth scope preservation/additions, Page task parsing, manual token Page ID mismatch, and no token/ciphertext exposure.
- [ ] Implement eligibility parsing using the current Graph API version; keep manual token validation to Page identity and leave permission-specific checks to the webhook subscription and Send API operations.
- [ ] Keep post publishing eligibility separate from messaging eligibility so a valid publishing Page is not incorrectly treated as Messenger-ready.
- [ ] Run Facebook OAuth/Page connection tests and commit the connection slice.

### Task 3: Add Messenger client and webhook subscription

**Files:**
- Create: `apps/api/src/channels/facebook-messenger/facebook-messenger.client.ts`.
- Create: `apps/api/src/channels/facebook-messenger/facebook-messenger.client.test.ts`.
- Modify: `apps/api/src/services/facebook-page.service.ts` and its tests to subscribe/unsubscribe after validated connect/remove.
- Modify: environment schema and tests only if `META_WEBHOOK_VERIFY_TOKEN` is not already represented by deployment environment parsing.

**Interfaces:**
- `FacebookMessengerClient.sendText({ pageId, pageAccessToken, psid, text }): Promise<{ externalMessageId: string }>`.
- `FacebookMessengerClient.subscribePage({ pageId, pageAccessToken }): Promise<void>` subscribes only to `messages` and `message_echoes`.
- Client maps permission, token, policy-window, rate-limit, and timeout failures to safe stable codes; raw Meta bodies and tokens never escape.

- [ ] Write failing client tests for the exact Send API URL/body, Page subscription fields, success ID parsing, missing permission, timeout, malformed response, and token redaction.
- [ ] Implement the client with injected fetch, bounded request timeout, and `META_GRAPH_API_VERSION`.
- [ ] Add connection lifecycle tests proving webhook subscription happens only after valid credentials and removal unsubscribes best-effort without leaking secrets.
- [ ] Run the focused client/connection tests and commit the Graph integration boundary.

### Task 4: Implement verified, idempotent inbound webhook

**Files:**
- Create: `apps/api/src/channels/facebook-messenger/facebook-messenger.normalizer.ts` and `.test.ts`.
- Create: `apps/api/src/channels/facebook-messenger/facebook-messenger.webhook.ts` and `.test.ts`.
- Create: `apps/api/src/routes/facebook-messenger-webhook.routes.ts` and route integration tests.
- Modify: `apps/api/src/app.ts` to retain raw bytes for this callback and register `GET/POST /api/v1/webhooks/facebook/messenger`.
- Modify: existing customer/conversation/message service/model files only where an existing helper cannot support unique upsert and atomic unread increment.

**Interfaces:**
- `GET` compares `hub.mode`, `hub.verify_token` and returns `hub.challenge` only when configured verify token matches.
- `POST` accepts raw bytes and validates `X-Hub-Signature-256` with HMAC-SHA256 using `META_APP_SECRET` before JSON parsing.
- Webhook processor resolves `entry.id` to exactly one connection owner and ignores unsupported events safely.
- Message persistence upserts by namespaced external ID; unread increments only when a new customer message is inserted; echo never creates a duplicate outbound message.

- [ ] Add failing route tests for valid/invalid challenge, valid/invalid signature, malformed JSON, missing secret and unknown Page.
- [ ] Add failing processor tests for supported text, unsupported attachment/event, echo, duplicate retry, Page ownership collision and malformed payload.
- [ ] Implement normalizer and processor using existing customer/conversation/message schemas and realtime emit helpers; persist before returning webhook success.
- [ ] Assert duplicate delivery leaves message count and unread count unchanged and each emitted event is scoped to the resolved conversation.
- [ ] Run webhook unit/integration tests and commit the inbound slice.

### Task 5: Send Messenger replies from existing Inbox API

**Files:**
- Modify: `apps/api/src/services/message.service.ts` and `apps/api/src/services/outbound-message.service.test.ts`.
- Modify: `apps/api/src/controllers/messages.controller.ts` and `apps/api/src/schemas/message.schemas.ts` only if a safe delivery error must be represented.
- Modify: `apps/api/src/channels/facebook-messenger/facebook-messenger.client.ts` and tests for request response/error mapping if needed.

**Interfaces:**
- Existing `/api/v1/messages/send` remains the only send endpoint.
- Facebook routing uses `conversation.platform === "facebook"`, `channelId` as Page ID, and the `facebook:<pageId>:<PSID>` customer key; only raw PSID is sent to Meta.
- Before sending, service checks the latest inbound customer timestamp and rejects messages outside the standard 24-hour window.
- Success persists one agent message with Meta `mid`, updates conversation preview/time and emits current realtime events. Failures return safe stable codes and never report `sent`.

- [ ] Add failing outbound tests for correct Page/token/PSID, wrong-owner isolation, 24-hour boundary, Graph success, permission failure, timeout and secret redaction.
- [ ] Implement the Facebook branch without changing Telegram/Zalo delivery behavior.
- [ ] Cover webhook echo arriving before the Send API response and assert it converges to one persisted message.
- [ ] Run outbound service and message API tests and commit the sender slice.

### Task 6: Connect Facebook messages to the shared Inbox

**Files:**
- Modify: `apps/web/src/components/dashboard/ConnectModal.tsx` and `apps/web/src/components/dashboard/ConnectModal.test.tsx` for Messenger-capable Page selection.
- Modify: the existing Dashboard Facebook OAuth error mapping and focused tests for `FACEBOOK_OAUTH_PAGE_NOT_MESSAGING_CAPABLE`.
- Modify: `apps/web/src/pages/InboxPage.tsx` and its tests only as needed for Facebook conversation selection and realtime updates.
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx` and tests to keep Facebook composer text-only and disable unsupported attachment/quick-reply media paths.
- Modify: shared contracts only if API payload currently lacks a field the UI needs.

**Interfaces:**
- Existing conversations/messages API and Socket.IO events provide Facebook items; no Facebook-specific frontend API endpoint is added.
- Facebook channel selection uses existing platform and `channelId` values.
- OAuth Page selection is enabled only for `canMessage` Pages; `canPublish` is still rendered as its own capability because publishing eligibility and Messenger eligibility are distinct.
- Facebook composer sends plain text and preserves normal composer behavior for all other channels.

- [ ] Add failing OAuth modal tests for a messaging-capable Page without publish permission, a publish-capable Page without messaging permission, and safe localized permission errors.
- [ ] Add failing Inbox tests for Facebook platform selection, inbound realtime update, and sending a text reply through the existing endpoint.
- [ ] Add failing composer tests proving Facebook cannot attach a file or insert a media quick reply while other platforms retain current behavior.
- [ ] Implement the smallest platform-aware UI changes and safe Vietnamese delivery error messages.
- [ ] Run focused frontend tests and production build; commit the UI slice.

### Task 7: Operational docs and end-to-end acceptance

**Files:**
- Modify: `CHANGELOG.md`.
- Modify: deployment README/wiki only at the existing source of truth for API environment variables and public webhook URLs.
- Test: existing API and web test suites; live Meta test Page acceptance is an external prerequisite.

- [ ] Document `META_WEBHOOK_VERIFY_TOKEN`, existing `META_APP_SECRET`, public HTTPS callback URL, required Meta permissions, Page subscription and safe secret handling.
- [ ] Run the focused Facebook Messenger tests, API suite, web suite, web production build, TypeScript checks, and `git diff --check`; record pre-existing unrelated failures without widening scope.
- [ ] With a Meta test Page and eligible tester account, verify customer text → one Inbox conversation/message → realtime update → agent text reply → customer receives reply → webhook retry produces no duplicate.
- [ ] Update changelog with implemented behavior and deployment prerequisites; commit docs separately.

## Acceptance Gate

- Text received from a connected test Page creates exactly one customer message and appears in Inbox in real time.
- An authorized employee can send text and sees success only after Meta accepts it; policy-window and Meta errors are shown safely.
- A Page ID resolves to one NhuuChat owner; access tokens and app secrets remain server-side.
- Focused tests, relevant full suites, production build, type checks, and `git diff --check` pass; any pre-existing unrelated failures are documented.
