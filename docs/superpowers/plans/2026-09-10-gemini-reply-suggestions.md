# Gemini Reply Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sinh 3 câu trả lời gợi ý bằng Gemini dựa trên tin nhắn gần nhất của khách và hiển thị chúng trong composer Inbox mà không tự gửi tin.

**Architecture:** Backend giữ Gemini API key, kiểm tra quyền conversation, lấy inbound customer message mới nhất và gọi một provider Gemini có structured JSON output. Frontend chỉ gọi endpoint, hiển thị loading/error/fallback và truyền câu được chọn vào textarea; không thêm database persistence.

**Tech Stack:** Node.js, Express, TypeScript, MongoDB/Mongoose, Zod, React/Vite, Vitest, `@google/genai`.

**Spec:** `docs/superpowers/specs/2026-09-10-gemini-reply-suggestions-design.md`

## Global Constraints

- Gemini API key chỉ nằm ở backend; không commit secret hoặc đưa key xuống frontend.
- Chỉ `admin` và `agent` được gọi API; agent chỉ gọi conversation được phân công.
- API trả tối đa 3 chuỗi, mỗi chuỗi tối đa 240 ký tự.
- Không lưu prompt/response AI hoặc thay đổi database schema.
- Gemini lỗi, timeout, chưa cấu hình hoặc trả JSON sai phải fallback về gợi ý cục bộ.
- Bấm chip chỉ điền textarea, không tự gửi tin.
- Thêm comment ngắn phía trên function có business logic hoặc hành vi không hiển nhiên.
- Cập nhật `CHANGELOG.md`, `README.md` và `docs/wiki/README.md`; không sửa `DEVELOPMENT_PROMPT.md`.

### Task 1: Gemini configuration, contract and provider

**Files:**
- Modify: `apps/api/package.json`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/ai/reply-suggestion.provider.ts`
- Create: `apps/api/src/ai/reply-suggestion.provider.test.ts`

**Interfaces:**
- Produces `AiSuggestionsResponse` with `{ suggestions: string[]; source: "gemini" | "fallback" }`.
- Produces `GeminiReplySuggestionProvider.suggest(input: { latestCustomerMessage: string }): Promise<string[]>`.

- [x] **Step 1: Add failing provider and environment tests**

  Test that a provider response containing `{ suggestions: [...] }` is normalized to 3 non-empty strings, and that invalid JSON/provider errors are rejected. Extend environment tests to accept optional `GEMINI_API_KEY` and `GEMINI_CHAT_MODEL` without making them mandatory.

- [x] **Step 2: Run focused tests and verify the new tests fail**

  Run:

  ```bash
  pnpm exec vitest run apps/api/src/ai/reply-suggestion.provider.test.ts packages/config/src/env.test.ts
  ```

  Expected: provider module/types are missing and the new assertions fail.

- [x] **Step 3: Add the SDK, config fields, contract and provider**

  Add `@google/genai` to `apps/api` and instantiate `GoogleGenAI` only inside the backend provider. Use `GEMINI_API_KEY` and configurable `GEMINI_CHAT_MODEL` with a documented default. Call `models.generateContent` with a JSON object schema containing a string array, then validate/normalize the response and enforce the 3-item/240-character limits. Use a bounded timeout and do not log prompt content or secrets.

  Add the contract:

  ```ts
  export interface AiSuggestionsResponse {
    suggestions: string[];
    source: "gemini" | "fallback";
  }
  ```

- [x] **Step 4: Run provider/config tests and commit**

  Run the focused command again; expected result is all provider and environment tests passing. Commit:

  ```bash
  git add apps/api/package.json packages/config/src/env.ts packages/config/src/env.test.ts packages/contracts/src/index.ts apps/api/src/ai/reply-suggestion.provider.ts apps/api/src/ai/reply-suggestion.provider.test.ts
  git commit -m "feat: add Gemini reply suggestion provider"
  ```

### Task 2: Authorized conversation suggestions API

**Files:**
- Modify: `apps/api/src/services/conversation.service.ts`
- Modify: `apps/api/src/controllers/conversations.controller.ts`
- Modify: `apps/api/src/routes/conversations.routes.ts`
- Create: `apps/api/src/services/conversation-suggestion.service.test.ts`
- Modify: `apps/api/src/controllers/conversation-message.controller.test.ts`

**Interfaces:**
- Produces `getConversationReplySuggestions(id: string, auth: AuthUser): Promise<AiSuggestionsResponse>`.
- Consumes `GeminiReplySuggestionProvider.suggest()` and existing `conversationAccessFilter`/`ConversationModel`/`MessageModel` access patterns.

- [x] **Step 1: Write failing service/controller tests**

  Cover: admin receives 3 Gemini suggestions from the newest customer message; an unassigned agent receives `404 CONVERSATION_NOT_FOUND`; missing Gemini configuration/provider failure returns local fallback; controller rejects unauthenticated requests and returns `{ suggestions, source }`.

- [x] **Step 2: Run focused API tests and verify failure**

  ```bash
  pnpm exec vitest run apps/api/src/services/conversation-suggestion.service.test.ts apps/api/src/controllers/conversation-message.controller.test.ts
  ```

- [x] **Step 3: Implement the service and route**

  In the service, first query the conversation with `conversationAccessFilter(auth)`; then query only the newest `senderType: "customer"` message sorted by `createdAt` and `_id` descending. If no usable message exists, return local fallback. Catch provider/configuration/timeout errors and return fallback without exposing provider details. Add `POST /:id/ai-suggestions` protected by `requireRole("admin", "agent")`, authenticate in the controller, and return the service result.

  Add concise comments explaining the access-first lookup and why provider failures are converted to fallback.

- [x] **Step 4: Run focused API tests and commit**

  Expected: service and controller tests pass, including authorization and fallback paths.

  ```bash
  git add apps/api/src/services/conversation.service.ts apps/api/src/controllers/conversations.controller.ts apps/api/src/routes/conversations.routes.ts apps/api/src/services/conversation-suggestion.service.test.ts apps/api/src/controllers/conversation-message.controller.test.ts
  git commit -m "feat: expose conversation Gemini suggestions API"
  ```

### Task 3: Inbox composer integration

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx`
- Modify: `apps/web/src/pages/InboxPage.test.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.test.tsx`

**Interfaces:**
- `InboxPage` owns the authenticated API call and passes suggestion state/callback to `ChatWindow`.
- `ChatWindow` passes `aiSuggestions`, `isAiSuggestionsLoading`, `aiSuggestionsError`, and `onRefreshAiSuggestions` to `MessageComposer`.
- `MessageComposer` keeps the existing local suggestions as fallback and calls `onSelect` behavior by setting textarea content only.

- [x] **Step 1: Add failing source/UI tests**

  Assert that Inbox calls `/ai-suggestions` with the conversation id and token, composer renders loading/error state, and selecting a Gemini chip fills the textarea without invoking `onSend`.

- [x] **Step 2: Run focused web tests and verify failure**

  ```bash
  pnpm exec vitest run apps/web/src/pages/InboxPage.test.tsx apps/web/src/components/conversations/MessageComposer.test.tsx
  ```

- [x] **Step 3: Implement the integration**

  Add an active-conversation suggestion state in `InboxPage`; reset it when `activeId` changes, call the API on refresh, and preserve local fallback when the request fails. Pass the state through `ChatWindow`. Update `MessageComposer` so Gemini chips use the same compact visual style as the approved local chips, show a spinner/disabled refresh state while loading, and show a non-blocking error label. Keep Enter/Shift+Enter, `/`, `@`, existing tag controls and outbound send behavior unchanged.

- [x] **Step 4: Run focused web tests and commit**

  ```bash
  git add apps/web/src/pages/InboxPage.tsx apps/web/src/components/conversations/ChatWindow.tsx apps/web/src/components/conversations/MessageComposer.tsx apps/web/src/pages/InboxPage.test.tsx apps/web/src/components/conversations/MessageComposer.test.tsx
  git commit -m "feat: connect Inbox composer to Gemini suggestions"
  ```

### Task 4: Documentation and operational configuration

**Files:**
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Document setup and limitations**

  Add `GEMINI_API_KEY` and optional `GEMINI_CHAT_MODEL` to the backend setup instructions, state that the key must remain in `apps/api/.env`, describe the endpoint behavior and fallback, and note that prompt/response data is not persisted.

- [x] **Step 2: Update changelog and verify documentation diff**

  Add one Vietnamese Unreleased entry and run `git diff --check`.

- [x] **Step 3: Commit documentation**

  ```bash
  git add README.md docs/wiki/README.md CHANGELOG.md
  git commit -m "docs: document Gemini reply suggestions"
  ```

### Task 5: Full verification and handoff

**Files:**
- No new source files; update the plan checkboxes after each verified task.

- [x] **Step 1: Run focused backend and frontend tests**

  ```bash
  pnpm exec vitest run apps/api/src/ai/reply-suggestion.provider.test.ts apps/api/src/services/conversation-suggestion.service.test.ts apps/api/src/controllers/conversation-message.controller.test.ts apps/web/src/pages/InboxPage.test.tsx apps/web/src/components/conversations/MessageComposer.test.tsx
  ```

- [ ] **Step 2: Run typecheck and web production build**

  ```bash
  pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
  pnpm --filter web build
  ```

- [x] **Step 3: Check final diff and environment safety**

  Run `git diff --check`, confirm no `.env` or secret is staged, and confirm `DEVELOPMENT_PROMPT.md` remains untouched/untracked.

- [ ] **Step 4: Review full suite limitations and hand off**

  Run `pnpm test` if the environment permits. Report any known Mongo/OpenSSL or missing environment failures separately from Gemini feature results; do not claim the full suite passes if those failures remain.
