# Zalo Personal Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung connector backend thử nghiệm cho một tài khoản Zalo cá nhân đăng nhập bằng QR, nhận/gửi tin qua canonical inbox hiện có và lưu session an toàn.

**Architecture:** Bọc `zca-js` sau một client adapter, giữ các instance runtime trong `ZaloPersonalSessionManager`, và lưu credentials đã mã hóa trong MongoDB. Controller chỉ gọi service; inbound đi qua normalizer rồi dùng cùng customer/conversation/message/realtime/chatbot flow của Nhuu-chat; outbound mở rộng `sendOutboundMessage` hiện có.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, Redis lock, `zca-js` 2.x, Zod, Vitest, Socket.IO.

**Spec:** `docs/superpowers/specs/2026-09-15-zalo-personal-backend-design.md`

## Global Constraints

- Chỉ triển khai backend; không sửa `apps/web` hoặc thiết kế QR hiện có.
- Dùng `zca-js` là API không chính thức mô phỏng Zalo Web; phải ghi rõ giới hạn thử nghiệm và không hỗ trợ lấy cookie thủ công.
- Không ghi plaintext cookie, IMEI, user-agent hoặc serialized credentials vào log, response lỗi, telemetry hay MongoDB.
- Session và conversation phải được cô lập theo `ownerId`; không tin `ownerId` từ request body.
- `platform` cho connector là `zalo_personal`; channel scope dùng `zalo_personal:<zaloUserId>`.
- Mỗi owner chỉ có một listener; dùng Redis lock khi Redis khả dụng và từ chối khởi động song song khi lock không thể xác nhận.
- Viết comment tiếng Việt ngắn phía trên mọi hàm có logic nghiệp vụ hoặc hành vi không hiển nhiên.
- Mọi thay đổi user-facing/backend meaningful phải cập nhật `CHANGELOG.md` trong `## [Unreleased]`.

## File Map

- Create `apps/api/src/channels/zalo-personal/zalo-personal.client.ts`: adapter chống phụ thuộc trực tiếp vào API `zca-js`.
- Create `apps/api/src/channels/zalo-personal/zalo-personal.schemas.ts`: payload QR, status và normalized event.
- Create `apps/api/src/channels/zalo-personal/zalo-personal.normalizer.ts`: chuyển event direct/group thành canonical inbound message.
- Create `apps/api/src/channels/zalo-personal/zalo-personal.client.test.ts`, `zalo-personal.normalizer.test.ts`: unit tests cho adapter contract và normalizer.
- Create `apps/api/src/channels/zalo-personal/zalo-personal.model.ts`: session metadata và encrypted credentials.
- Create `apps/api/src/services/zalo-personal.service.ts`: QR/session lifecycle, listener, inbound persistence và restore.
- Create `apps/api/src/services/zalo-personal.service.test.ts`: lifecycle, owner isolation, deduplication và listener tests.
- Create `apps/api/src/controllers/zalo-personal.controller.ts`, `apps/api/src/controllers/zalo-personal.controller.test.ts`: HTTP boundary.
- Create `apps/api/src/routes/channels/zalo-personal.routes.ts`, `apps/api/src/routes/channels/zalo-personal.routes.test.ts`: protected route registration.
- Modify `apps/api/src/app.ts`: mount the new router.
- Modify `apps/api/src/server.ts`: restore valid Zalo sessions during startup and stop them during shutdown.
- Modify `apps/api/src/services/message.service.ts`, `apps/api/src/services/message.service.test.ts`: route agent text to Zalo personal session.
- Modify `apps/api/package.json` and `pnpm-lock.yaml`: add `zca-js`.
- Modify `CHANGELOG.md`: record the experimental backend connector.

### Task 1: Add dependency, session model, schemas and safe serialization

**Files:**
- Modify: `apps/api/package.json`, `pnpm-lock.yaml`
- Create: `apps/api/src/channels/zalo-personal/zalo-personal.model.ts`
- Create: `apps/api/src/channels/zalo-personal/zalo-personal.schemas.ts`
- Test: `apps/api/src/channels/zalo-personal/zalo-personal.model.test.ts`, `apps/api/src/channels/zalo-personal/zalo-personal.schemas.test.ts`

**Interfaces:**
- Produces `ZaloPersonalSessionModel` with `ownerId`, `encryptedCredentials` (`select: false`), `zaloUserId`, optional `displayName`, `username`, `status`, `qrSessionId`, `qrExpiresAt`, `connectedAt`, `lastSeenAt`, and `lastErrorCode`.
- Produces `zaloPersonalStatusSchema` for `{ id, status, qrData?, expiresAt?, displayName?, username?, zaloUserId?, errorCode? }`.
- Produces `zaloPersonalStatus` values `disconnected | waiting_qr | connected | expired | error`.

- [ ] **Step 1: Write the failing tests**

```ts
it("hides encrypted credentials from the default session projection", () => {
  expect(ZaloPersonalSessionModel.schema.path("encryptedCredentials").options.select).toBe(false);
  expect(ZaloPersonalSessionModel.schema.path("ownerId").options.unique).toBe(true);
});

it("rejects a status payload containing credentials", () => {
  expect(() => zaloPersonalStatusSchema.parse({ status: "connected", cookie: "secret" })).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec vitest run src/channels/zalo-personal/zalo-personal.model.test.ts src/channels/zalo-personal/zalo-personal.schemas.test.ts`

Expected: FAIL because the model, schema and dependency do not exist.

- [ ] **Step 3: Add the dependency and minimal model/schema**

Run: `pnpm --filter api add zca-js@^2.2.0`

Define the Mongoose model with `encryptedCredentials` excluded by default and define the Zod response schema with no credential fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api exec vitest run src/channels/zalo-personal/zalo-personal.model.test.ts src/channels/zalo-personal/zalo-personal.schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/channels/zalo-personal
git commit -m "feat: add zalo personal session contract"
```

### Task 2: Implement the `zca-js` adapter and inbound normalizer

**Files:**
- Create: `apps/api/src/channels/zalo-personal/zalo-personal.client.ts`
- Create: `apps/api/src/channels/zalo-personal/zalo-personal.normalizer.ts`
- Test: `apps/api/src/channels/zalo-personal/zalo-personal.client.test.ts`, `apps/api/src/channels/zalo-personal/zalo-personal.normalizer.test.ts`

**Interfaces:**
- `ZaloPersonalClient`: `{ loginQR(onQr): Promise<ZaloPersonalApi>; login(credentials): Promise<ZaloPersonalApi>; disconnect(): Promise<void>; }`.
- `ZaloPersonalApi`: `{ getContext(): { credentials: unknown }; getAccountInfo(): Promise<{ id?: unknown; displayName?: unknown; username?: unknown }>; onMessage(listener: (event: unknown) => Promise<void>): void; startListener(): Promise<void>; stopListener(): Promise<void>; sendMessage(threadId: string, content: string): Promise<{ id: string }>; }`.
- `normalizeZaloPersonalMessage(event: unknown, accountId: string): NormalizedZaloPersonalMessage | null` returns `platform: "zalo_personal"`, `externalMessageId`, `channelId`, `senderId`, sender metadata, `type`, `content`, `sentAt`, `chatType` and `isSelf`.

- [ ] **Step 1: Write failing adapter/normalizer tests**

Cover QR callback data, direct text, group text, self-message, media-with-caption and malformed/empty events. Assert normalized `channelId` is the thread id and `isSelf` is true only for account-originated events.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter api exec vitest run src/channels/zalo-personal/zalo-personal.client.test.ts src/channels/zalo-personal/zalo-personal.normalizer.test.ts`

Expected: FAIL with missing module/functions, not a TypeScript parse error.

- [ ] **Step 3: Implement the smallest adapter and normalizer**

Use the installed `zca-js` types only inside the adapter. Convert its QR callback to `{ qrData, expiresAt }`; never expose the API object or credentials to controllers. Add Vietnamese comments above `normalizeZaloPersonalMessage`, `startListener` and any self-message/media classification helper.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm --filter api exec vitest run src/channels/zalo-personal/zalo-personal.client.test.ts src/channels/zalo-personal/zalo-personal.normalizer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/channels/zalo-personal/zalo-personal.client.ts apps/api/src/channels/zalo-personal/zalo-personal.normalizer.ts apps/api/src/channels/zalo-personal/*.test.ts
git commit -m "feat: normalize zalo personal messages"
```

### Task 3: Build QR/session lifecycle and persistence service

**Files:**
- Create: `apps/api/src/services/zalo-personal.service.ts`
- Test: `apps/api/src/services/zalo-personal.service.test.ts`
- Use: `apps/api/src/common/crypto.ts`, `apps/api/src/channels/zalo-personal/zalo-personal.model.ts`, `apps/api/src/channels/zalo-personal/*`

**Interfaces:**
- `startZaloPersonalQr(userId: string): Promise<ZaloPersonalQrStatus>`
- `getZaloPersonalQrStatus(id: string, userId: string): ZaloPersonalQrStatus`
- `getZaloPersonalSessionStatus(userId: string): Promise<ZaloPersonalStatus>`
- `logoutZaloPersonal(userId: string): Promise<void>`
- `getActiveZaloPersonalClient(userId: string): Promise<ZaloPersonalApi | undefined>`
- `restoreActiveZaloPersonalClients(): Promise<void>`
- `shutdownActiveZaloPersonalClients(): Promise<void>`

- [ ] **Step 1: Write failing service tests**

Test that a QR request creates one pending runtime session, reuses an unexpired pending QR, changes to `connected` after the adapter callback resolves, encrypts credentials before persistence, rejects a different owner reading the QR id, and never creates two active listeners for one owner.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter api exec vitest run src/services/zalo-personal.service.test.ts`

Expected: FAIL because the service and model do not exist.

- [ ] **Step 3: Implement the state machine**

Keep pending QR sessions and active clients in owner-keyed maps. Use `randomUUID()` for QR ids, an explicit QR TTL, `encryptSecret(JSON.stringify(credentials))` on successful login, and `decryptSecret` only during restore. Store only safe account metadata in the response. Add bounded reconnect handling and a Redis lock abstraction with a no-parallel fallback when lock acquisition cannot be confirmed.

- [ ] **Step 4: Run service tests and verify GREEN**

Run: `pnpm --filter api exec vitest run src/services/zalo-personal.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/zalo-personal.service.ts apps/api/src/services/zalo-personal.service.test.ts apps/api/src/channels/zalo-personal/zalo-personal.model.ts
git commit -m "feat: manage zalo personal qr sessions"
```

### Task 4: Expose protected QR/status/logout routes and startup restore

**Files:**
- Create: `apps/api/src/controllers/zalo-personal.controller.ts`
- Create: `apps/api/src/routes/channels/zalo-personal.routes.ts`
- Create: `apps/api/src/controllers/zalo-personal.controller.test.ts`
- Create: `apps/api/src/routes/channels/zalo-personal.routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/server.lifecycle.test.ts`

**Interfaces:**
- `POST /api/v1/channels/zalo-personal/qr`
- `GET /api/v1/channels/zalo-personal/qr/:id`
- `GET /api/v1/channels/zalo-personal/status`
- `POST /api/v1/channels/zalo-personal/logout`

- [ ] **Step 1: Write failing controller/route tests**

Assert all four routes require `requireRole("admin")`, pass `request.auth.id` to services, never accept `ownerId` from body, map missing QR ids to `QR_LOGIN_NOT_FOUND`, and return safe status payloads. Assert `startServer` invokes `restoreActiveZaloPersonalClients` and shutdown invokes the connector cleanup hook.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter api exec vitest run src/controllers/zalo-personal.controller.test.ts src/routes/channels/zalo-personal.routes.test.ts src/server.lifecycle.test.ts`

Expected: FAIL because route/controller exports and startup dependency do not exist.

- [ ] **Step 3: Implement the HTTP boundary and registration**

Use the existing `AuthenticatedRequest`, `AppError`, `requireRole` and error handler patterns. Mount `zaloPersonalRouter` at `/api/v1/channels/zalo-personal`. Extend `ServerDependencies` with default `restoreZaloPersonalClients` and `shutdownZaloPersonalClients` hooks; call the restore hook after database/knowledge initialization and the shutdown hook before closing the HTTP/database resources. Add Vietnamese comments above controller handlers that enforce owner scope or map external errors.

- [ ] **Step 4: Run focused route/lifecycle tests**

Run: `pnpm --filter api exec vitest run src/controllers/zalo-personal.controller.test.ts src/routes/channels/zalo-personal.routes.test.ts src/server.lifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/zalo-personal.controller.ts apps/api/src/controllers/zalo-personal.controller.test.ts apps/api/src/routes/channels/zalo-personal.routes.ts apps/api/src/routes/channels/zalo-personal.routes.test.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/src/server.lifecycle.test.ts
git commit -m "feat: expose zalo personal connection routes"
```

### Task 5: Persist normalized inbound messages and emit realtime events

**Files:**
- Modify: `apps/api/src/services/zalo-personal.service.ts`
- Test: `apps/api/src/services/zalo-personal.service.test.ts`
- Use: `CustomerModel`, `ConversationModel`, `MessageModel`, `toConversation`, `toMessage`, `emitChatEvent`, `emitInboxEventToRecipients`, `processTelegramCustomerMessage` or a platform-neutral inbound orchestrator.

**Interfaces:**
- Internal `ingestZaloPersonalMessage(userId: string, message: NormalizedZaloPersonalMessage): Promise<void>`.
- Canonical persisted values: `platform: "zalo_personal"`, `senderType: "customer"`, `deliveryStatus: "delivered"`, and `ownerId: userId`.

- [ ] **Step 1: Write failing inbound tests**

Cover direct and group messages, customer/conversation creation, unread increment, realtime payloads, duplicate external ids, self-message suppression, sender metadata and bot handoff error isolation.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter api exec vitest run src/services/zalo-personal.service.test.ts -t "inbound"`

Expected: FAIL because the listener is not connected to persistence.

- [ ] **Step 3: Implement persistence and event emission**

Follow the existing Telegram personal flow: verify the stored session belongs to the owner, upsert customer by `{ platform, platformId }`, upsert conversation by `{ platform, channelId, ownerId }`, create one message guarded by the compound external id, increment unread only after successful insert, populate customer/tags, emit chat and inbox events, then invoke the existing chatbot inbound contract with `platform: "zalo_personal"`. Add a Vietnamese comment explaining why bot failure must not replay the inbound message.

- [ ] **Step 4: Run inbound tests and verify GREEN**

Run: `pnpm --filter api exec vitest run src/services/zalo-personal.service.test.ts -t "inbound"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/zalo-personal.service.ts apps/api/src/services/zalo-personal.service.test.ts
git commit -m "feat: ingest zalo personal messages"
```

### Task 6: Route agent text through Zalo personal outbound delivery

**Files:**
- Modify: `apps/api/src/services/message.service.ts`
- Test: `apps/api/src/services/message.service.test.ts`
- Modify: `apps/api/src/channels/zalo-personal/zalo-personal.client.ts` only if the adapter contract needs the concrete send method.

**Interfaces:**
- Existing `sendOutboundMessage({ conversationId, content }, auth)` gains the branch `conversation.platform === "zalo_personal"` and calls `getActiveZaloPersonalClient(auth.id)`, then `sendMessage(conversation.channelId, content)`.

- [ ] **Step 1: Write failing outbound tests**

Assert a connected session sends to the conversation thread and stores the returned external id with `sent`; disconnected sessions return `ZALO_PERSONAL_DISCONNECTED`; another owner receives `403`; bot pause still occurs before connector delivery; non-Zalo branches remain unchanged.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter api exec vitest run src/services/message.service.test.ts -t "Zalo personal"`

Expected: FAIL because `sendOutboundMessage` has no Zalo personal branch.

- [ ] **Step 3: Implement the minimal outbound branch**

Add the owner check beside the existing Telegram personal check, pause the bot before sending, call the session manager, persist the canonical agent message and update conversation summary. Translate only known connector failures to stable `AppError` codes; do not expose external error messages.

- [ ] **Step 4: Run outbound and regression tests**

Run: `pnpm --filter api exec vitest run src/services/message.service.test.ts`

Expected: PASS, including existing Telegram personal tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/message.service.ts apps/api/src/services/message.service.test.ts apps/api/src/channels/zalo-personal/zalo-personal.client.ts
git commit -m "feat: send messages through zalo personal"
```

### Task 7: Documentation, full verification and delivery record

**Files:**
- Modify: `CHANGELOG.md`
- Test: all changed API tests and the API build/typecheck commands available in the repository.

- [ ] **Step 1: Add the Unreleased changelog entry**

Record that the backend now supports experimental Zalo personal QR session management, inbound/outbound canonical messaging, owner isolation and encrypted session storage; include the unofficial API/account-ban limitation.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
pnpm --filter api exec vitest run src/channels/zalo-personal src/services/zalo-personal.service.test.ts src/controllers/zalo-personal.controller.test.ts src/routes/channels/zalo-personal.routes.test.ts src/services/message.service.test.ts
pnpm --filter api exec tsc --noEmit
pnpm --filter api exec vitest run
git diff --check
```

Expected: changed-area tests pass, TypeScript exits 0, full API suite reports no new failures, and `git diff --check` is clean. Existing unrelated environment failures must be reported with their exact test names and output.

- [ ] **Step 3: Perform manual backend smoke test**

With a real admin token and the user’s own Zalo account: `POST /qr` returns a QR status, `GET /qr/:id` transitions after scanning, an inbound direct/group message creates one canonical conversation/message, `POST /messages/send` delivers to the same thread, restart attempts restore, and logout stops delivery. Do not print or save QR/session credentials in command output.

- [ ] **Step 4: Commit documentation**

```bash
git add CHANGELOG.md
git commit -m "docs: record zalo personal backend connector"
```
