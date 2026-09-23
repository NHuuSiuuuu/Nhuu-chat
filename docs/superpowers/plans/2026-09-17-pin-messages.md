# Ghim tin nhắn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm khả năng ghim tối đa 10 tin nhắn trong từng hội thoại, hiển thị thanh pin, cuộn tới tin gốc và đồng bộ ghim/bỏ ghim realtime.

**Architecture:** Lưu metadata pin trong `Conversation` bằng mảng subdocument `pinnedMessages`; service populate nội dung từ `MessageModel` và trả một payload canonical cho cả HTTP lẫn Socket.IO. `InboxPage` sở hữu state pin của hội thoại đang mở, còn `ChatWindow` chỉ render UI và gọi callback pin/unpin.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, Zod, Socket.IO, React, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-17-pin-messages-design.md`

## Global Constraints

- Chỉ role `admin` và `agent` có quyền ghim/bỏ ghim.
- Giới hạn 10 tin ghim trong một hội thoại; không tạo phần tử trùng.
- Không thay đổi flow gửi tin, delivery status, schema message hoặc pagination message.
- Mọi endpoint phải kiểm tra conversation access trong service bằng `conversationAccessFilter`.
- Mọi comment code mới phải viết bằng tiếng Việt.
- Chỉ stage file thuộc feature; giữ nguyên các file dirty không liên quan.
- Commit dùng prefix Conventional Commits tiếng Anh, mô tả tiếng Việt, viết thường đầu câu và không có dấu chấm cuối.

---

### Task 1: Contract, schema và validator cho pinned messages

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/models/conversation.model.ts`
- Create: `apps/api/src/schemas/conversation-pin.schemas.ts`
- Create: `apps/api/src/schemas/conversation-pin.schemas.test.ts`

**Interfaces:**
- Produces `PinnedMessageContract`, `ConversationPinEventPayload`, `chatEvents.messagePinUpdated`, conversation field `pinnedMessages`, `conversationPinMessageSchema` và `conversationPinMessageIdSchema`.

- [ ] **Step 1: Write the failing tests**

Add tests that prove the pin request accepts one non-empty `messageId`, rejects an empty id, and that the contract/event names are available:

```ts
it("accepts a valid pin message id", () => {
  expect(conversationPinMessageSchema.parse({ messageId: "message-1" })).toEqual({ messageId: "message-1" });
});

it("rejects an empty pin message id", () => {
  expect(() => conversationPinMessageSchema.parse({ messageId: "" })).toThrow();
});

it("defines the realtime pin event", () => {
  expect(chatEvents.messagePinUpdated).toBe("chat:message_pin_updated");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/schemas/conversation-pin.schemas.test.ts
```

Expected: FAIL because the schema and event do not exist.

- [ ] **Step 3: Implement the minimal contract/schema/model additions**

Add the following exact shapes:

```ts
export interface PinnedMessageContract {
  messageId: string;
  content: string;
  type: ChatMessageContract["type"];
  senderName?: string;
  createdAt: string;
  pinnedBy: string;
  pinnedAt: string;
}

export interface ConversationPinEventPayload {
  conversationId: string;
  pinnedMessages: PinnedMessageContract[];
}
```

Add `messagePinUpdated: "chat:message_pin_updated"` to `chatEvents`; add `pinnedMessages` as an array of `_id: false` subdocuments containing required ObjectId `messageId`, `pinnedBy`, and Date `pinnedAt`; add `conversationPinMessageSchema = z.object({ messageId: z.string().trim().min(1) })` and `conversationPinMessageIdSchema = z.object({ messageId: z.string().trim().min(1) })`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/schemas/conversation-pin.schemas.test.ts packages/contracts/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/models/conversation.model.ts apps/api/src/schemas/conversation-pin.schemas.ts apps/api/src/schemas/conversation-pin.schemas.test.ts
git commit -m "feat: thêm contract và schema tin nhắn ghim"
```

### Task 2: Pin service với access control, giới hạn và canonical payload

**Files:**
- Create: `apps/api/src/services/conversation-pin.service.ts`
- Create: `apps/api/src/services/conversation-pin.service.test.ts`

**Interfaces:**
- Consumes `PinnedMessageContract`, `ConversationModel`, `MessageModel`, `conversationAccessFilter`, `AuthUser`.
- Produces `listConversationPins(conversationId, auth)`, `pinConversationMessage(conversationId, messageId, auth)`, `unpinConversationMessage(conversationId, messageId, auth)`, each returning `{ pinnedMessages: PinnedMessageContract[] }`.

- [ ] **Step 1: Write failing service tests**

Mock Conversation/Message/User models and cover the main path plus failures:

```ts
it("pins a message from the same conversation and returns its quote", async () => {
  const result = await pinConversationMessage("conversation-1", "message-1", adminAuth);
  expect(result.pinnedMessages).toEqual([expect.objectContaining({ messageId: "message-1", content: "Tin cần ghim" })]);
});

it("rejects a message belonging to another conversation", async () => {
  await expect(pinConversationMessage("conversation-1", "message-2", adminAuth)).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND" });
});

it("rejects the eleventh distinct pin", async () => {
  await expect(pinConversationMessage("conversation-1", "message-11", adminAuth)).rejects.toMatchObject({ code: "CONVERSATION_PIN_LIMIT_REACHED" });
});

it("removes only the requested pin", async () => {
  const result = await unpinConversationMessage("conversation-1", "message-1", adminAuth);
  expect(result.pinnedMessages.every((item) => item.messageId !== "message-1")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/services/conversation-pin.service.test.ts
```

Expected: FAIL because the service functions do not exist.

- [ ] **Step 3: Implement access, validation, update and mapping**

Implement these rules in order:

1. Find the conversation with `{ _id: conversationId, ...conversationAccessFilter(auth) }`; throw `CONVERSATION_NOT_FOUND` on miss.
2. For pin, find `{ _id: messageId, conversationId }`; throw `MESSAGE_NOT_FOUND` on miss.
3. If the message is already present, return the canonical list without adding a duplicate.
4. If the list length is 10, throw `CONVERSATION_PIN_LIMIT_REACHED`.
5. Add `{ messageId, pinnedBy: auth.id, pinnedAt: new Date() }`, persist, then load messages by the pinned ids and map content/type/senderName/createdAt plus pin metadata in newest-first order.
6. For unpin, filter the subdocument list by message id, persist, and return the same canonical mapper.
7. Filter stale message references from the response without deleting unrelated data.

Keep the service comment in Vietnamese above the canonical mapper because it joins two collections and preserves pin ordering.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/services/conversation-pin.service.test.ts
```

Expected: PASS for access, duplicate, limit, pin and unpin cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/conversation-pin.service.ts apps/api/src/services/conversation-pin.service.test.ts
git commit -m "feat: xử lý nghiệp vụ ghim tin nhắn"
```

### Task 3: HTTP controllers/routes và realtime event

**Files:**
- Create: `apps/api/src/controllers/conversation-pins.controller.ts`
- Create: `apps/api/src/controllers/conversation-pins.controller.test.ts`
- Modify: `apps/api/src/routes/conversations.routes.ts`
- Modify: `apps/api/src/realtime/socket.test.ts`

**Interfaces:**
- Consumes the three pin service functions from Task 2.
- Produces authenticated routes and emits `ConversationPinEventPayload` to `conversation:${conversationId}` after successful mutation.

- [ ] **Step 1: Write failing controller/route tests**

Cover authentication, status and event behavior:

```ts
it("returns pins for an authorized agent", async () => {
  pinMocks.list.mockResolvedValue({ pinnedMessages: [] });
  await listConversationPins(requestWithAuth, response as never, next);
  expect(pinMocks.list).toHaveBeenCalledWith("conversation-1", agentAuth);
  expect(state.body).toEqual({ pinnedMessages: [] });
});

it("emits the canonical pin payload after pinning", async () => {
  pinMocks.pin.mockResolvedValue({ pinnedMessages: [pinnedMessage] });
  await pinConversationMessage(requestWithAuth, response as never, next);
  expect(socketMocks.emitChatEvent).toHaveBeenCalledWith("chat:message_pin_updated", "conversation-1", { conversationId: "conversation-1", pinnedMessages: [pinnedMessage] });
});

it("does not emit when the service fails", async () => {
  const failure = new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found");
  pinMocks.pin.mockRejectedValue(failure);
  await pinConversationMessage(requestWithAuth, response as never, next);
  expect(socketMocks.emitChatEvent).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith(failure);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/controllers/conversation-pins.controller.test.ts apps/api/src/routes/conversations.routes.test.ts
```

Expected: FAIL because the controller and routes do not exist.

- [ ] **Step 3: Implement controllers/routes**

Add `requireRole("admin", "agent")` routes before the generic `/:id` routes:

```ts
conversationRouter.get("/:conversationId/pins", requireRole("admin", "agent"), listConversationPins);
conversationRouter.post("/:conversationId/pins", requireRole("admin", "agent"), pinConversationMessage);
conversationRouter.delete("/:conversationId/pins/:messageId", requireRole("admin", "agent"), unpinConversationMessage);
```

The controller parses params with the existing conversation id schema, parses POST body with `conversationPinMessageSchema`, calls the service, wraps the result as `{ conversationId, pinnedMessages }`, emits only after success, and returns `200` for GET/POST/DELETE. `next(error)` remains the error path.

- [ ] **Step 4: Run API tests to verify they pass**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/controllers/conversation-pins.controller.test.ts apps/api/src/routes/conversations.routes.test.ts apps/api/src/realtime/socket.test.ts
```

Expected: PASS, including room event name and no emission on failure.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/controllers/conversation-pins.controller.ts apps/api/src/controllers/conversation-pins.controller.test.ts apps/api/src/routes/conversations.routes.ts apps/api/src/realtime/socket.ts apps/api/src/realtime/socket.test.ts
git commit -m "feat: thêm api và realtime cho tin nhắn ghim"
```

### Task 4: Frontend pin state and realtime synchronization

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/pages/InboxPage.test.tsx`
- Create: `apps/web/src/state/inbox-pins.ts`
- Create: `apps/web/src/state/inbox-pins.test.ts`

**Interfaces:**
- Consumes `PinnedMessageContract`, `ConversationPinEventPayload`, `apiRequest`, and existing `createChatSocket` lifecycle.
- Produces `replacePinnedMessages(current, incoming)`, `load/pin/unpin` callbacks, and `ChatWindow` props `pinnedMessages`, `onPinMessage`, `onUnpinMessage`.

- [ ] **Step 1: Write failing pure state tests**

```ts
it("replaces the entire pin list with the canonical event payload", () => {
  expect(replacePinnedMessages([oldPin], [newPin])).toEqual([newPin]);
});

it("does not duplicate a pin when HTTP and Socket.IO deliver the same payload", () => {
  expect(replacePinnedMessages([newPin], [newPin])).toEqual([newPin]);
});
```

Add an `InboxPage.test.tsx` assertion that `chatEvents.messagePinUpdated` is subscribed and the resulting list is passed to `ChatWindow`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/web/src/state/inbox-pins.test.ts apps/web/src/pages/InboxPage.test.tsx
```

Expected: FAIL because the helper, state, event subscription and props do not exist.

- [ ] **Step 3: Implement the state and API/socket wiring**

Add the pure helper:

```ts
export function replacePinnedMessages(_current: PinnedMessageContract[], incoming: PinnedMessageContract[]) {
  return incoming;
}
```

In `InboxPage`, reset pins on `activeId` change, GET `/api/v1/conversations/${activeId}/pins`, and add:

```ts
async function pinActiveMessage(messageId: string): Promise<void> {
  if (!activeId) return;
  const result = await apiRequest<{ pinnedMessages: PinnedMessageContract[] }>(API_URL, `/api/v1/conversations/${activeId}/pins`, token, {
    method: "POST",
    body: JSON.stringify({ messageId })
  }, refresh);
  setPinnedMessages(result.pinnedMessages);
}
```

Implement `unpinActiveMessage` with DELETE, subscribe to `chatEvents.messagePinUpdated`, ignore payloads for another `activeId`, and clean up the listener with the socket. Pass errors through the existing UI error pattern without changing the message list.

- [ ] **Step 4: Run frontend tests to verify they pass**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/web/src/state/inbox-pins.test.ts apps/web/src/pages/InboxPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/InboxPage.tsx apps/web/src/pages/InboxPage.test.tsx apps/web/src/state/inbox-pins.ts apps/web/src/state/inbox-pins.test.ts
git commit -m "feat: đồng bộ trạng thái tin nhắn ghim trên inbox"
```

### Task 5: ChatWindow pin controls and pinned bar

**Files:**
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.test.tsx`
- Modify: `apps/web/src/pages/InboxPage.tsx` only to pass the props produced by Task 4

**Interfaces:**
- Consumes `pinnedMessages: PinnedMessageContract[]`, `onPinMessage(messageId)`, `onUnpinMessage(messageId)`.
- Produces DOM attributes `data-message-id`, visible `Đã ghim`, pin/unpin buttons, pinned bar and smooth scroll behavior.

- [ ] **Step 1: Write failing UI tests**

Add source/behavior assertions for the required controls:

```ts
it("renders pin controls and a pinned bar without reusing message actions", () => {
  expect(source).toContain('aria-label="Ghim tin nhắn"');
  expect(source).toContain('aria-label="Bỏ ghim tin nhắn"');
  expect(source).toContain("Tin đã ghim");
  expect(source).toContain("Đã ghim");
  expect(source).toContain("scrollIntoView");
  expect(source).toContain("stopPropagation");
  expect(source).toContain("data-message-id");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/web/src/components/conversations/ChatWindow.test.tsx
```

Expected: FAIL because the pin UI and callbacks do not exist.

- [ ] **Step 3: Implement the minimal UI**

Add a pinned bar before the scrollable message list. Render the newest pin with `Tin đã ghim · ${index + 1}/${pinnedMessages.length}`, a one-line quote using `truncate`, and previous/next controls when there is more than one pin. Attach a click handler only to the content area:

```tsx
function scrollToPinnedMessage(messageId: string) {
  document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}
```

Render `data-message-id={message.id}` on each article. On hover/focus, conditionally render one pin button instead of reaction/reply/more. For pinned messages render `Đã ghim` and an unpin button. The unpin handler must call `event.stopPropagation()` before `onUnpinMessage(message.id)`. Keep delivery indicators in their existing dedicated column.

- [ ] **Step 4: Run UI tests to verify they pass**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/web/src/components/conversations/ChatWindow.test.tsx apps/web/src/pages/InboxPage.test.tsx
```

Expected: PASS, including existing message rendering and optimistic delivery tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/conversations/ChatWindow.tsx apps/web/src/components/conversations/ChatWindow.test.tsx apps/web/src/pages/InboxPage.tsx
git commit -m "feat: thêm giao diện ghim tin nhắn trong chat"
```

### Task 6: Documentation and full verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`

- [ ] **Step 1: Write documentation checks**

Verify the docs mention all externally visible behavior: maximum 10 pins, role restriction, API/realtime behavior, hover pin action, pinned bar and scroll-to-message.

- [ ] **Step 2: Update documentation**

Add an Unreleased changelog entry and a README/wiki usage note. Do not add secrets, deployment assumptions, or unrelated Inbox behavior.

- [ ] **Step 3: Run complete verification**

```bash
pnpm exec vitest run --exclude '.worktrees/**' apps/api/src/services/conversation-pin.service.test.ts apps/api/src/controllers/conversation-pins.controller.test.ts apps/api/src/routes/conversations.routes.test.ts apps/api/src/realtime/socket.test.ts apps/web/src/state/inbox-pins.test.ts apps/web/src/components/conversations/ChatWindow.test.tsx apps/web/src/pages/InboxPage.test.tsx apps/web/src/state/inbox-realtime.test.ts apps/web/src/components/conversations/ConversationInfoSidebar.test.tsx
pnpm --filter api build
pnpm --filter web build
git diff --check
```

Expected: all selected tests pass, both builds exit 0, and `git diff --check` has no output. Inspect `git diff` and stage only pin feature files before the final focused commit/push.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md docs/wiki
git commit -m "docs: cập nhật hướng dẫn ghim tin nhắn"
```

- [ ] **Step 5: Push and report**

```bash
git push origin feature/nhuu-chat-mvp
```

Report test counts, build results, commit hashes, push result, and any unrelated dirty files preserved.
