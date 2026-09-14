# Automatic Omnichannel Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kết nối tab Chatbot tự động với backend, cho phép mỗi shop cấu hình trợ lý/mẫu, xử lý inbound customer message một lần và trả lời có grounding qua connector hiện có.

**Architecture:** Thêm `Assistant` và `AutomationTemplate` theo owner, một matcher thuần hàm, và `ChatbotOrchestrator` nhận message chuẩn hóa thay vì biết Telegram cụ thể. Orchestrator chọn template hoặc RAG/Gemini, còn `BotDeliveryService` dùng adapter theo platform để lưu/gửi bot message và phát realtime; MVP chỉ đăng ký adapter Telegram Bot và Telegram cá nhân, không giả lập Facebook/Instagram/Zalo khi repo chưa có connector.

**Tech Stack:** Node.js, Express 5, TypeScript, Mongoose 9, Zod 4, Vitest, Google GenAI, Socket.IO, MongoDB.

**Spec:** `docs/superpowers/specs/2026-09-14-automatic-chatbot-design.md`

## Global Constraints

- Chỉ xử lý message có `senderType: "customer"`; message bot/agent không được kích hoạt lại chatbot.
- Mọi assistant, template, processing record và knowledge document phải được lọc theo authenticated owner.
- Một customer message chỉ tạo tối đa một lượt xử lý nhờ idempotency theo `conversationId` và external/message id.
- Không để Gemini trả lời bằng kiến thức chung khi không có context đủ tin cậy; khi handoff gửi đúng fallback, pause bot và chuyển nhân viên.
- Không log API key, session channel, prompt đầy đủ hoặc dữ liệu nhạy cảm.
- Không thay đổi UI fix cứng trong plan này; endpoint preview phải không gửi channel thật và không lưu message thật.
- Không thêm dependency mới; giữ mô hình adapter để platform chưa có connector không bị bật gửi tự động.
- Comment trong code phải viết bằng tiếng Việt; thay đổi user-facing/kiến trúc phải cập nhật `CHANGELOG.md`, `README.md` và `docs/wiki/README.md`.

---

### Task 1: Assistant/template contracts, models và validation

**Files:**
- Create: `apps/api/src/models/assistant.model.ts`
- Create: `apps/api/src/models/automation-template.model.ts`
- Create: `apps/api/src/models/bot-processing.model.ts`
- Create: `apps/api/src/schemas/assistant.schemas.ts`
- Create: `apps/api/src/schemas/automation-template.schemas.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/api/src/models/assistant.model.test.ts`
- Test: `apps/api/src/schemas/assistant.schemas.test.ts`
- Test: `apps/api/src/schemas/automation-template.schemas.test.ts`

**Interfaces:**
- Produces `AssistantModel`, `AutomationTemplateModel`, `BotProcessingModel` and contract types `AssistantContract`, `AutomationTemplateContract`, `BotPreviewResponse`.
- Assistant fields: `ownerId`, `name`, `instructions`, `modelTier`, `enabled`, `fallbackMessage`, `channelScope` (`all | channels` plus identifiers), `isDefault`, timestamps.
- Template fields: `ownerId`, `assistantId`, `name`, `keywords`, `responseTemplate`, `allowAiRewrite`, `priority`, `enabled`, `channelScope`.
- Processing fields: `ownerId`, `conversationId`, `customerMessageId`, optional `externalMessageId`, `status`, `assistantId`, optional `botMessageId`, `errorCode`, timestamps.

- [ ] **Step 1: Write failing model/index tests**

  Assert assistant/template owner fields, enum validation, default fallback, and a unique partial index that prevents two processing records for the same owner/conversation/customer message key.

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/models/assistant.model.test.ts src/schemas/assistant.schemas.test.ts src/schemas/automation-template.schemas.test.ts`

  Expected: FAIL because the new models, contracts, and schemas do not exist.

- [ ] **Step 3: Implement minimal models, contracts, and Zod schemas**

  Limit names/instructions/template/keyword lengths, require at least one trimmed keyword, normalize duplicate keywords, allow patch fields independently, and validate `modelTier` against the existing AI tiers.

- [ ] **Step 4: Run focused tests**

  Run the same command; expected: PASS with validation failure cases and model index assertions passing.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/models/assistant.model.ts apps/api/src/models/automation-template.model.ts apps/api/src/models/bot-processing.model.ts apps/api/src/schemas/assistant.schemas.ts apps/api/src/schemas/automation-template.schemas.ts apps/api/src/models/assistant.model.test.ts apps/api/src/schemas/assistant.schemas.test.ts apps/api/src/schemas/automation-template.schemas.test.ts packages/contracts/src/index.ts
  git commit -m "feat: add chatbot assistant contracts and models"
  ```

### Task 2: Owner-scoped assistant/template CRUD API

**Files:**
- Create: `apps/api/src/services/assistant.service.ts`
- Create: `apps/api/src/services/automation-template.service.ts`
- Create: `apps/api/src/controllers/assistant.controller.ts`
- Create: `apps/api/src/controllers/automation-template.controller.ts`
- Create: `apps/api/src/routes/assistants.routes.ts`
- Create: `apps/api/src/controllers/assistant.controller.test.ts`
- Create: `apps/api/src/controllers/automation-template.controller.test.ts`
- Create: `apps/api/src/services/assistant.service.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `GET/POST/PATCH/DELETE /api/v1/assistants`.
- `GET/POST/PATCH/DELETE /api/v1/assistants/:assistantId/templates`.
- All handlers use `requireRole("admin", "agent")`, obtain `request.auth.id`, and never accept owner id from request body.
- Services expose owner-scoped CRUD and `resolveAssistant(ownerId, platform, channelId)` with direct channel scope before default assistant.

- [ ] **Step 1: Write failing controller/service tests**

  Cover list/create/update/delete, invalid payload, missing resource, cross-owner access returning not-found/forbidden, default assistant uniqueness, and template CRUD under the owning assistant only.

- [ ] **Step 2: Run focused tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/controllers/assistant.controller.test.ts src/controllers/automation-template.controller.test.ts src/services/assistant.service.test.ts`

  Expected: FAIL because routes/services/controllers are absent.

- [ ] **Step 3: Implement services/controllers/routes**

  Normalize response DTOs without leaking Mongo internals, atomically unset previous defaults when setting a new default, reject template assistant ids outside the owner, and mount the router at `/api/v1/assistants`.

- [ ] **Step 4: Run focused tests and route auth checks**

  Run: `pnpm --filter api exec vitest run src/controllers/assistant.controller.test.ts src/controllers/automation-template.controller.test.ts src/services/assistant.service.test.ts src/app.test.ts`

  Expected: PASS, including unauthenticated and disallowed-role requests.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/services/assistant.service.ts apps/api/src/services/automation-template.service.ts apps/api/src/controllers/assistant.controller.ts apps/api/src/controllers/automation-template.controller.ts apps/api/src/routes/assistants.routes.ts apps/api/src/controllers/assistant.controller.test.ts apps/api/src/controllers/automation-template.controller.test.ts apps/api/src/services/assistant.service.test.ts apps/api/src/app.ts
  git commit -m "feat: add assistant and automation template api"
  ```

### Task 3: Keyword matcher và owner-scoped knowledge context

**Files:**
- Create: `apps/api/src/chatbot/template-matcher.ts`
- Create: `apps/api/src/chatbot/template-matcher.test.ts`
- Modify: `apps/api/src/models/knowledge.model.ts`
- Modify: `apps/api/src/services/knowledge.service.ts`
- Modify: `apps/api/src/controllers/knowledge.controller.ts`
- Modify: `apps/api/src/ai/vector.store.ts`
- Modify: `apps/api/src/ai/rag.service.ts`
- Test: `apps/api/src/services/knowledge.service.test.ts`
- Test: `apps/api/src/ai/rag.service.test.ts`

**Interfaces:**
- `matchAutomationTemplate(input: { message: string; platform: string; templates: AutomationTemplate[] }): AutomationTemplate | null`.
- Matching is case/diacritic insensitive, whole keyword aware, channel-scoped, enabled-only, then sorted by descending priority and stable creation order.
- Knowledge ingestion receives `ownerId`; retrieval accepts an owner/document scope so one shop cannot use another shop's chunks.

- [ ] **Step 1: Write failing matcher and owner isolation tests**

  Cover normalization (`Xin Chào` vs `xin chao`), keyword boundaries, priority, disabled/template channel mismatch, empty/media input, and RAG results excluded across owners.

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/chatbot/template-matcher.test.ts src/services/knowledge.service.test.ts src/ai/rag.service.test.ts`

  Expected: matcher tests fail because the module is absent; owner-isolation tests fail against the currently global knowledge/vector behavior.

- [ ] **Step 3: Implement matcher and owner scoping**

  Add `ownerId` to knowledge documents/chunks, pass authenticated owner through knowledge create/delete, extend vector search with an optional owner filter, and preserve existing in-memory RAG behavior for callers that omit the optional filter.

- [ ] **Step 4: Run focused and existing knowledge tests**

  Run: `pnpm --filter api exec vitest run src/chatbot/template-matcher.test.ts src/services/knowledge.service.test.ts src/ai/rag.service.test.ts src/controllers/knowledge.controller.test.ts`

  Expected: PASS with no regression to the current deterministic provider.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/chatbot/template-matcher.ts apps/api/src/chatbot/template-matcher.test.ts apps/api/src/models/knowledge.model.ts apps/api/src/services/knowledge.service.ts apps/api/src/controllers/knowledge.controller.ts apps/api/src/ai/vector.store.ts apps/api/src/ai/rag.service.ts apps/api/src/services/knowledge.service.test.ts apps/api/src/ai/rag.service.test.ts
  git commit -m "feat: add chatbot template matching and knowledge isolation"
  ```

### Task 4: Grounded bot reply providers and preview API

**Files:**
- Create: `apps/api/src/chatbot/bot-reply.provider.ts`
- Create: `apps/api/src/chatbot/gemini-bot.provider.ts`
- Create: `apps/api/src/chatbot/preview.service.ts`
- Create: `apps/api/src/controllers/assistant-preview.controller.ts`
- Create: `apps/api/src/chatbot/gemini-bot.provider.test.ts`
- Create: `apps/api/src/controllers/assistant-preview.controller.test.ts`
- Modify: `apps/api/src/routes/assistants.routes.ts`

**Interfaces:**
- `BotReplyProvider.reply(input): Promise<{ answer: string; handoff: boolean; sources: SourceRef[] }>`.
- `POST /api/v1/assistants/:assistantId/preview` accepts message plus optional conversation history/platform/channel id and returns answer/source/handoff; it never calls a channel adapter or writes Message/BotProcessing.

- [ ] **Step 1: Write failing provider/preview tests**

  Assert template rewrite keeps the template meaning, disabled rewrite returns exact template text, grounded RAG uses instructions/history, weak context returns the configured fallback with `handoff: true`, Gemini timeout/error stays internal, and preview performs no persistence/delivery calls.

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/chatbot/gemini-bot.provider.test.ts src/controllers/assistant-preview.controller.test.ts`

  Expected: FAIL because provider, preview service, and endpoint are absent.

- [ ] **Step 3: Implement bounded Gemini provider and preview**

  Reuse `modelTierToGeminiModel`, backend `env.GEMINI_API_KEY`, abort/HTTP timeout of 10 seconds, bounded instructions/history/RAG context, structured grounded output, and fallback behavior from the approved spec. Do not reuse the staff-only `ai-suggestions` endpoint.

- [ ] **Step 4: Run focused tests**

  Run the same command plus `pnpm --filter api exec vitest run src/ai/reply-suggestion.provider.test.ts src/ai/rag.service.test.ts`.

  Expected: PASS with existing reply-suggestion tests unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/chatbot/bot-reply.provider.ts apps/api/src/chatbot/gemini-bot.provider.ts apps/api/src/chatbot/preview.service.ts apps/api/src/controllers/assistant-preview.controller.ts apps/api/src/chatbot/gemini-bot.provider.test.ts apps/api/src/controllers/assistant-preview.controller.test.ts apps/api/src/routes/assistants.routes.ts
  git commit -m "feat: add grounded chatbot replies and preview"
  ```

### Task 5: Orchestrator, idempotency, pause/handoff và bot delivery

**Files:**
- Create: `apps/api/src/chatbot/channel-bot-adapter.ts`
- Create: `apps/api/src/chatbot/bot-delivery.service.ts`
- Create: `apps/api/src/chatbot/chatbot-orchestrator.ts`
- Create: `apps/api/src/chatbot/chatbot-orchestrator.test.ts`
- Create: `apps/api/src/chatbot/bot-delivery.service.test.ts`
- Modify: `apps/api/src/orchestration/bot-pause.service.ts`
- Modify: `apps/api/src/services/message.service.ts`
- Modify: `apps/api/src/realtime/socket.ts`

**Interfaces:**
- `ChannelBotAdapter.sendText(input: { channelId: string; content: string }): Promise<{ externalMessageId?: string }>`.
- `ChatbotOrchestrator.process(input: NormalizedCustomerMessage): Promise<{ status: "sent" | "handed_off" | "skipped" | "failed" }>`.
- Orchestrator claims `BotProcessing` before provider work, checks `senderType`, pause and assistant scope, and releases no second response on duplicate/retry/provider failure.

- [ ] **Step 1: Write failing orchestration tests**

  Cover disabled/no assistant, paused conversation, bot/agent skip, template-first routing, RAG routing, fallback+handoff+pause, duplicate processing, provider timeout, absent adapter, and exactly one persisted bot message.

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/chatbot/chatbot-orchestrator.test.ts src/chatbot/bot-delivery.service.test.ts`

  Expected: FAIL because the orchestration and delivery modules are absent.

- [ ] **Step 3: Implement orchestration and delivery**

  Persist bot messages with `senderType: "bot"`, update conversation snippet/unread/handoff metadata, use the existing bounded outbound queue/connector abstraction, record delivery failure without infinite retry, and emit Socket.IO events only after persistence succeeds.

- [ ] **Step 4: Run focused orchestration and outbound tests**

  Run: `pnpm --filter api exec vitest run src/chatbot/chatbot-orchestrator.test.ts src/chatbot/bot-delivery.service.test.ts src/orchestration/bot-pause.test.ts src/jobs/outbound.worker.integration.test.ts src/messages/message.service.test.ts`

  Expected: PASS, with existing agent-send pause behavior preserved.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/chatbot apps/api/src/orchestration/bot-pause.service.ts apps/api/src/services/message.service.ts apps/api/src/realtime/socket.ts
  git commit -m "feat: orchestrate grounded chatbot replies safely"
  ```

### Task 6: Wire Telegram inbound connectors and document operation

**Files:**
- Modify: `apps/api/src/services/telegram.service.ts`
- Modify: `apps/api/src/services/telegram-personal.service.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/channels/telegram/telegram.normalizer.ts`
- Modify: `apps/api/src/channels/telegram-personal/telegram-personal.service.ts` (only if adapter extraction requires it)
- Test: `apps/api/src/channels/telegram/telegram.webhook.integration.test.ts`
- Test: `apps/api/src/channels/telegram/telegram.e2e.test.ts`
- Test: `apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Both inbound paths persist the normalized customer message first, then invoke the shared orchestrator with platform/channel/owner/conversation context.
- Telegram Bot adapter uses the existing encrypted bot token and `TelegramClient`; Telegram personal adapter uses the active authenticated personal client. Unsupported platforms remain unregistered and cannot auto-send.

- [ ] **Step 1: Write failing integration tests**

  Add webhook replay assertion that one inbound customer message yields at most one bot reply, tests for Telegram personal inbound invoking the same orchestration seam, bot-originated updates being ignored, and connector send failure preserving the customer message while marking handoff/error.

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm --filter api exec vitest run src/channels/telegram/telegram.webhook.integration.test.ts src/channels/telegram/telegram.e2e.test.ts src/channels/telegram-personal/telegram-personal.service.test.ts`

  Expected: new assertions fail because inbound paths are not wired to the shared orchestrator.

- [ ] **Step 3: Wire the shared orchestrator and adapter registry**

  Keep webhook acknowledgement and existing external-message idempotency, preserve media/caption normalization where supported, and ensure orchestration errors do not cause webhook retries to create a second response.

- [ ] **Step 4: Update docs and run full verification**

  Document assistant/template endpoints, preview semantics, `GEMINI_API_KEY`, Telegram-only connector availability, owner-scoped knowledge, fallback/pause behavior, and known Facebook/Instagram/Zalo limitation. Then run:

  ```bash
  pnpm test
  pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
  pnpm --filter web build
  git diff --check
  ```

  Expected: all tests pass, TypeScript exits 0, web build exits 0, and diff check produces no output.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/services/telegram.service.ts apps/api/src/services/telegram-personal.service.ts apps/api/src/app.ts apps/api/src/channels/telegram/telegram.normalizer.ts apps/api/src/channels/telegram/telegram.webhook.integration.test.ts apps/api/src/channels/telegram/telegram.e2e.test.ts apps/api/src/channels/telegram-personal/telegram-personal.service.test.ts README.md docs/wiki/README.md CHANGELOG.md
  git commit -m "feat: enable automatic chatbot on connected telegram channels"
  ```

## Self-review

- Spec coverage: assistant/template CRUD is Task 1–2; matching and scoped RAG are Task 3; Gemini/fallback/preview are Task 4; idempotency/pause/handoff/delivery are Task 5; connector integration and operational documentation are Task 6.
- Scope: no Facebook/Instagram/Zalo behavior is invented; the shared adapter boundary is present, while only connectors in this repository are enabled.
- Security: owner comes from authenticated context, knowledge is scoped, secrets remain backend-only, and cross-owner tests are required.
- Test order: every production behavior starts with a failing Vitest test and each task has a focused verification command before commit.
