# Nhuu-chat MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng MVP Nhuu-chat độc lập với Telegram, inbox realtime, RAG chatbot, Bot Pause, phân quyền và kiểm thử production-oriented.

**Architecture:** Frontend React/TypeScript giao tiếp với backend Node.js/Express/TypeScript qua REST và Socket.IO. Backend chuẩn hóa payload Telegram thành canonical message, lưu MongoDB, dùng Redis cho rate limit/retry/Socket.IO adapter, và tách provider embedding/LLM/vector search sau các interface ổn định.

**Tech Stack:** React, TypeScript, Node.js, Express, MongoDB/Mongoose, Redis/ioredis, Socket.IO, Telegram Bot API, Vitest/Jest, Supertest, Playwright, Docker Compose, k6 hoặc Artillery.

**Spec:** `docs/superpowers/specs/2026-09-08-nhuu-chat-design.md`; yêu cầu gốc tại `docs/requirements/prd-v2.md` và `docs/requirements/srs-v2.md`.

## Global Constraints

- Project độc lập tại `/home/codexproxy/Nhuu-chat`; không sửa hoặc tích hợp repo shoe store.
- MVP chỉ triển khai Telegram; Facebook, Instagram, Zalo cá nhân và WebRTC nằm ngoài MVP.
- Không commit token, API key, JWT secret, encryption key hoặc dữ liệu khách hàng thật.
- Token/provider secret phải được mã hóa at rest bằng AES-256-GCM.
- Webhook phải xác thực secret/signature và xử lý idempotent theo `platform + externalMessageId`.
- Agent gửi tin nhắn phải đặt `botPausedUntil = now + 30 minutes`.
- Retry outbound tối đa 3 lần với exponential backoff và lưu trạng thái thất bại.
- RAG chỉ trả lời dựa trên context truy xuất; nếu không đủ dữ liệu phải chuyển cho agent.
- Endpoint quản trị dùng JWT Bearer và role guard; webhook Telegram không dùng JWT.
- Chỉ đọc `DEVELOPMENT_PROMPT.md` khi người dùng yêu cầu trực tiếp.

## File Map

- `apps/api/`: Express API, domain modules, jobs và provider adapters.
- `apps/web/`: React inbox và màn hình cấu hình.
- `packages/contracts/`: DTO, enum và Socket.IO event contracts dùng chung.
- `packages/config/`: schema kiểm tra environment và runtime configuration.
- `tests/e2e/`: Playwright flow chính của agent/admin.
- `infra/docker-compose.yml`: MongoDB replica set local, Redis và test dependencies.
- `docs/`: requirements, design, plan, README/Wiki và changelog.

### Task 1: Khởi tạo workspace và runtime local

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Create: `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `packages/contracts/src/index.ts`, `packages/config/src/env.ts`
- Create: `infra/docker-compose.yml`, `.env.example`, `.gitignore`
- Test: `apps/api/src/health/health.test.ts`, `packages/config/src/env.test.ts`

**Interfaces:**
- `createApp(): Express` tạo app không tự listen để Supertest dùng được.
- `startServer(): Promise<void>` mở HTTP và Socket.IO server.
- `env: AppEnv` kiểm tra `NODE_ENV`, Mongo URI, Redis URL, JWT secret, encryption key và Telegram config.
- `GET /health` trả `{ status: "ok", service: "nhuu-chat" }`.

- [ ] **Step 1: Viết test health và environment validation**

```ts
it("returns a stable health response", async () => {
  const response = await request(createApp()).get("/health");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "ok", service: "nhuu-chat" });
});
```

- [ ] **Step 2: Chạy test để xác nhận chúng fail vì chưa có app/config**

Run: `pnpm --filter api test -- health.test.ts`
Expected: FAIL vì chưa có `createApp` và endpoint `/health`.

- [ ] **Step 3: Tạo workspace tối thiểu, env schema và Docker local**

MongoDB local phải chạy replica set để các task sau có thể dùng transaction; Redis expose port nội bộ chỉ cho development.

- [ ] **Step 4: Chạy test và kiểm tra runtime**

Run: `pnpm test` và `docker compose -f infra/docker-compose.yml config`.
Expected: health/config tests PASS và compose config hợp lệ.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json apps packages infra .env.example .gitignore
git commit -m "chore: scaffold nhuu-chat workspace"
```

### Task 2: Auth, roles và domain persistence

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.routes.ts`, `apps/api/src/auth/auth.middleware.ts`
- Create: `apps/api/src/models/user.model.ts`, `apps/api/src/models/customer.model.ts`
- Create: `apps/api/src/models/conversation.model.ts`, `apps/api/src/models/message.model.ts`
- Create: `apps/api/src/models/knowledge.model.ts`
- Create: `apps/api/src/common/crypto.ts`, `apps/api/src/common/errors.ts`
- Test: `apps/api/src/auth/auth.integration.test.ts`, `apps/api/src/common/crypto.test.ts`, `apps/api/src/models/indexes.test.ts`

**Interfaces:**
- `hashPassword(password: string): Promise<string>` và `verifyPassword(hash: string, password: string): Promise<boolean>`.
- `issueTokens(user: AuthUser): Promise<TokenPair>` và `requireRole(...roles: Role[]): RequestHandler`.
- `encryptSecret(value: string): string` và `decryptSecret(value: string): string` dùng AES-256-GCM.
- `Customer` unique index `{ platform, platformId }`.
- `Message` unique index `{ platform, externalMessageId }` khi external id tồn tại.

- [ ] **Step 1: Viết integration tests cho login, refresh, role denial, crypto round-trip và duplicate indexes**
- [ ] **Step 2: Chạy test xác nhận fail**

Run: `pnpm --filter api test -- auth.integration.test.ts crypto.test.ts indexes.test.ts`
Expected: FAIL vì routes/models chưa tồn tại.

- [ ] **Step 3: Implement user model, password hashing, JWT access/refresh rotation và role middleware**
- [ ] **Step 4: Implement Mongoose models, indexes, AES-256-GCM và error mapping**
- [ ] **Step 5: Chạy integration tests với MongoDB thật trong Docker**

Expected: customer không gọi được admin endpoint; admin/agent được cấp đúng quyền; plaintext secret không xuất hiện trong document/log.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat: add auth roles and core domain models"
```

### Task 3: Telegram connector và webhook idempotency

**Files:**
- Create: `apps/api/src/channels/telegram/telegram.client.ts`
- Create: `apps/api/src/channels/telegram/telegram.normalizer.ts`
- Create: `apps/api/src/channels/telegram/telegram.routes.ts`
- Create: `apps/api/src/channels/telegram/telegram.service.ts`
- Create: `apps/api/src/channels/telegram/telegram.schemas.ts`
- Test: `apps/api/src/channels/telegram/telegram.normalizer.test.ts`, `telegram.webhook.integration.test.ts`, `telegram.client.test.ts`

**Interfaces:**
- `normalizeTelegramUpdate(update: TelegramUpdate): NormalizedInboundMessage | null`.
- `TelegramClient.sendText(chatId: string, text: string): Promise<ExternalDelivery>`.
- `POST /api/v1/channels/telegram/webhook/:secret` trả `204` sau khi xác thực và ghi nhận idempotent.
- `POST /api/v1/channels/telegram` lưu encrypted bot token và gọi `setWebhook`.

- [ ] **Step 1: Viết tests cho text message, unsupported update, secret sai và duplicate update**
- [ ] **Step 2: Chạy tests xác nhận fail**
- [ ] **Step 3: Implement schema validation và normalizer cho Telegram**
- [ ] **Step 4: Implement Telegram client với timeout, response validation và không log token**
- [ ] **Step 5: Implement webhook route, customer/conversation upsert và message idempotency**
- [ ] **Step 6: Chạy integration tests với mocked Telegram HTTP và MongoDB**

Expected: payload hợp lệ tạo đúng một message; replay không tạo bản ghi thứ hai; secret sai trả `401`/`403` và không ghi dữ liệu.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/channels apps/api/src/models
git commit -m "feat: add telegram connector and webhook ingestion"
```

### Task 4: Conversation API và Socket.IO realtime

**Files:**
- Create: `packages/contracts/src/chat.ts`
- Create: `apps/api/src/conversations/conversation.service.ts`, `conversation.routes.ts`
- Create: `apps/api/src/messages/message.service.ts`, `message.routes.ts`
- Create: `apps/api/src/realtime/socket.ts`
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/lib/socket.ts`
- Test: `apps/api/src/conversations/conversation.integration.test.ts`, `apps/api/src/realtime/socket.integration.test.ts`

**Interfaces:**
- `GET /api/v1/conversations?page&limit&platform&status` returns `{ conversations, total }`.
- `GET /api/v1/conversations/:id/messages` returns paginated canonical messages.
- `PATCH /api/v1/conversations/:id/assignment` and `/status` require agent/admin.
- `PATCH /api/v1/customers/:id/tags` validates tag list.
- `POST /api/v1/messages/send` accepts `{ conversationId, type: "text", content }` and returns delivery state.
- Events: `chat:message_received`, `chat:conversation_updated`, `chat:delivery_updated`, `chat:join_room`, `chat:agent_typing`.

- [ ] **Step 1: Viết contract tests cho response JSON và Socket.IO payloads**
- [ ] **Step 2: Chạy tests xác nhận fail**
- [ ] **Step 3: Implement query/filter/pagination và assignment/status/tag services**
- [ ] **Step 4: Implement authenticated Socket.IO rooms và Redis adapter**
- [ ] **Step 5: Implement manual text send qua Telegram adapter và lưu outbound message**
- [ ] **Step 6: Chạy integration tests với hai Socket.IO clients và Redis**

Expected: event đến client trong room đúng, agent không thuộc quyền bị từ chối, pagination ổn định, không gửi trùng outbound message.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts apps/api/src apps/web/src
git commit -m "feat: add realtime inbox contracts and conversation APIs"
```

### Task 5: Knowledge ingestion và RAG provider abstraction

**Files:**
- Create: `apps/api/src/knowledge/parsers/text.parser.ts`, `pdf.parser.ts`, `docx.parser.ts`
- Create: `apps/api/src/knowledge/chunker.ts`, `knowledge.service.ts`, `knowledge.routes.ts`
- Create: `apps/api/src/ai/embedding.provider.ts`, `apps/api/src/ai/llm.provider.ts`, `apps/api/src/ai/vector.store.ts`
- Create: `apps/api/src/ai/prompt.ts`, `apps/api/src/ai/rag.service.ts`
- Test: `apps/api/src/knowledge/chunker.test.ts`, `knowledge.integration.test.ts`, `apps/api/src/ai/rag.service.test.ts`

**Interfaces:**
- `chunkText(input: string, maxChars: number, overlap: number): KnowledgeChunkInput[]`.
- `EmbeddingProvider.embed(text: string): Promise<number[]>`.
- `VectorStore.upsert(chunks: EmbeddedChunk[]): Promise<void>` and `VectorStore.search(vector: number[], topK: number): Promise<RetrievedChunk[]>`.
- `LlmProvider.answer(input: { question: string; context: RetrievedChunk[] }): Promise<string>`.
- `RagService.answer(question: string): Promise<{ answer: string; sources: SourceRef[]; handoff: boolean }>`.

- [ ] **Step 1: Viết tests chunking, parser MIME allowlist, top-K retrieval và no-context handoff**
- [ ] **Step 2: Chạy tests xác nhận fail**
- [ ] **Step 3: Implement parsers cho TXT/PDF/DOCX và chunk metadata**
- [ ] **Step 4: Implement provider interfaces và một adapter local/test deterministic**
- [ ] **Step 5: Implement ingestion routes, source ownership và document delete cascade**
- [ ] **Step 6: Implement grounded prompt; khi context không đủ trả đúng thông báo handoff thay vì bịa**
- [ ] **Step 7: Chạy integration tests với vector provider test và MongoDB**

Expected: mỗi chunk truy được source; delete document xóa chunk liên quan; answer có context hoặc handoff rõ ràng; provider key chỉ tồn tại backend.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/knowledge apps/api/src/ai
git commit -m "feat: add knowledge ingestion and grounded rag"
```

### Task 6: Bot Pause, retry queue và outbound reliability

**Files:**
- Create: `apps/api/src/orchestration/bot-pause.service.ts`
- Create: `apps/api/src/jobs/outbound.queue.ts`, `outbound.worker.ts`, `retry-policy.ts`
- Modify: `apps/api/src/channels/telegram/telegram.service.ts`, `apps/api/src/messages/message.service.ts`
- Test: `apps/api/src/orchestration/bot-pause.test.ts`, `apps/api/src/jobs/outbound.worker.integration.test.ts`, `apps/api/src/channels/telegram/telegram.e2e.test.ts`

**Interfaces:**
- `pauseBot(conversationId: string, now: Date, minutes = 30): Promise<Date>`.
- `isBotPaused(botPausedUntil: Date | null, now: Date): boolean`.
- `enqueueOutbound(command: OutboundCommand): Promise<JobId>`.
- Retry schedule: attempt 1 immediately, attempt 2 after 1s, attempt 3 after 4s; then `failed`.

- [ ] **Step 1: Viết tests chứng minh agent send bật pause và inbound trong pause không gọi RAG**
- [ ] **Step 2: Viết tests retry 3 lần, exponential delay, success và terminal failed**
- [ ] **Step 3: Chạy tests xác nhận fail**
- [ ] **Step 4: Implement pause service với clock injectable để test không phụ thuộc thời gian thật**
- [ ] **Step 5: Implement Redis-backed queue, delivery state và worker**
- [ ] **Step 6: Nối webhook flow với pause check → RAG → outbound queue**
- [ ] **Step 7: Chạy integration/E2E tests**

Expected: agent message luôn pause 30 phút; bot không gửi cạnh tranh; failed delivery được nhìn thấy và không retry vô hạn.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orchestration apps/api/src/jobs apps/api/src/messages apps/api/src/channels
git commit -m "feat: add bot pause and reliable outbound delivery"
```

### Task 7: React inbox và admin configuration UI

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`, `InboxPage.tsx`, `KnowledgePage.tsx`, `ChannelsPage.tsx`
- Create: `apps/web/src/components/conversations/ConversationList.tsx`, `ChatWindow.tsx`, `MessageComposer.tsx`
- Create: `apps/web/src/components/common/ProtectedRoute.tsx`
- Create: `apps/web/src/state/auth.store.ts`, `inbox.store.ts`
- Test: `apps/web/src/components/inbox.test.tsx`, `apps/web/src/pages/login.test.tsx`

**Interfaces:**
- `useInboxStore` exposes `conversations`, `activeConversation`, `messages`, `selectConversation(id)`, `sendText(content)`.
- `socketClient.joinConversation(id)` joins `conversation:{id}`.
- UI consumes only the contracts in `packages/contracts`; it does not call Telegram or LLM providers directly.

- [ ] **Step 1: Viết component tests cho login, list/filter, message timeline, send và bot pause indicator**
- [ ] **Step 2: Chạy tests xác nhận fail**
- [ ] **Step 3: Implement auth guard và API client với bearer/refresh handling**
- [ ] **Step 4: Implement conversation list, chat window, unread state, assignment, tags và composer**
- [ ] **Step 5: Nối Socket.IO events để cập nhật không cần reload**
- [ ] **Step 6: Implement Telegram channel form và knowledge document form**
- [ ] **Step 7: Chạy component tests và production build**

Expected: agent xem được tin nhắn realtime, gửi text, thấy delivery failure/bot pause; frontend không bundle secret provider.

- [ ] **Step 8: Commit**

```bash
git add apps/web packages/contracts
git commit -m "feat: add realtime inbox web interface"
```

### Task 8: Security hardening, E2E và release documentation

**Files:**
- Create: `tests/e2e/nhuu-chat.spec.ts`, `tests/security/webhook.spec.ts`, `tests/load/socketio.js`
- Create: `apps/api/src/common/security.middleware.ts`, `apps/api/src/audit/audit.service.ts`
- Create/Modify: `README.md`, `CHANGELOG.md`, `docs/wiki/README.md`
- Modify: `infra/docker-compose.yml`, `.env.example`

**Interfaces:**
- E2E scenario: configure Telegram → inbound webhook → realtime inbox → RAG reply → agent reply → pause → next inbound stays agent-only.
- Security cases: missing auth, wrong role, forged/replayed webhook, rate limit, path traversal, invalid upload, SSRF private IP, secret leakage.
- Load target: p95 Socket.IO message delivery below 300ms in the documented local test environment.

- [ ] **Step 1: Viết Playwright E2E và security tests với mocked external Telegram/LLM**
- [ ] **Step 2: Chạy tests để ghi nhận các failure còn lại**
- [ ] **Step 3: Implement security headers, CORS allowlist, request ID, rate limit và audit events**
- [ ] **Step 4: Implement upload size/MIME checks và SSRF-safe URL ingestion**
- [ ] **Step 5: Chạy E2E, security suite và k6/Artillery load test**
- [ ] **Step 6: Cập nhật README với setup, lệnh test, trạng thái MVP, giới hạn và kế hoạch Meta/Zalo**
- [ ] **Step 7: Ghi thay đổi vào `CHANGELOG.md` bằng tiếng Việt và cập nhật `docs/wiki/README.md`**
- [ ] **Step 8: Chạy kiểm chứng cuối**

```bash
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test
git diff --check
```

Expected: tất cả focused tests, E2E và security tests pass; build pass; không có secret trong bundle/log; README và Wiki phản ánh đúng trạng thái thực tế.

- [ ] **Step 9: Commit**

```bash
git add README.md CHANGELOG.md docs/wiki docs tests apps/api/src/common apps/api/src/audit infra .env.example
git commit -m "test: harden and document nhuu-chat mvp"
```

## Self-Review Checklist

- PRD/SRS coverage: Telegram, inbox realtime, RAG, Bot Pause, auth, retry, AES-256-GCM, rate limit, idempotency, testing and acceptance criteria are mapped to Tasks 1–8.
- Explicitly deferred: Meta/Instagram OAuth, Zalo cookie session, WebRTC, advanced bulk actions and multi-region production.
- No placeholder task or undefined implementation name remains.
- All later interfaces reference exact names introduced in earlier tasks.
- Database/vector provider is abstracted so MongoDB Atlas Vector Search or ChromaDB can be selected without changing RAG service.
- Final completion requires tests/build/E2E evidence; local-only success is not treated as production readiness.
