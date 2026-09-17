# Outbound Media Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhân viên gửi một ảnh hoặc file kèm chú thích từ Inbox tới Zalo cá nhân và Telegram cá nhân.

**Architecture:** API nhận một multipart upload trong request gửi tin, xác thực file tại biên bằng Multer và giữ buffer trong request. Service lưu media qua Cloudinary để có URL bền vững, đồng thời gửi chính buffer qua connector tương ứng, sau đó lưu message cùng metadata attachment; không đổi schema MongoDB ngoài trường `attachments` đã có. Frontend giữ một `File` trong state composer, gửi `FormData`, hiển thị tên/preview và render attachment từ message.

**Tech Stack:** Node.js, Express, TypeScript, Multer, Mongoose, zca-js, GramJS, React, Vitest, React Testing Library, pnpm.

**Spec:** Approved in chat on 2026-09-17; scope is one image/file up to 20 MB with optional caption for Zalo personal and Telegram personal.

## Global Constraints

- Mỗi request chỉ có tối đa một file.
- Kích thước tối đa là 20 MB.
- Cho phép JPG, PNG, GIF, WEBP, PDF, DOC/DOCX, XLS/XLSX, ZIP và file thông thường.
- Từ chối `.exe`, `.js`, `.sh` và MIME nguy hiểm.
- Chỉ hỗ trợ `telegram_personal` và `zalo_personal`; text-only flow hiện tại phải giữ nguyên.
- Media phải được lưu qua Cloudinary trước khi persistence để `attachments.url` dùng được sau khi reload.
- Không sửa hoặc stage các thay đổi dang dở ngoài phạm vi task.
- Text giao diện và code comments mới dùng tiếng Việt.

### Task 1: Message contract, validation boundary, and persistence shape

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/schemas/message.schemas.ts`
- Modify: `apps/api/src/models/message.model.ts`
- Modify: `apps/api/src/services/message.service.ts`
- Test: `apps/api/src/schemas/conversation-message.schemas.test.ts`
- Test: `apps/api/src/services/outbound-message.service.test.ts`

**Interfaces:**
- `ChatMessageContract` gains `attachments: MessageAttachmentContract[]`.
- `MessageAttachmentContract` contains `url`, `fileName`, and `mimeType`.
- `sendOutboundMessage` consumes `{ conversationId, content, attachment? }`, where attachment is `{ buffer: Buffer; originalname: string; mimetype: string; size: number }`.
- `toMessage` always returns `attachments`, defaulting to `[]`.

- [ ] **Step 1: Write failing contract and service tests**

```ts
it("accepts an attachment with an optional caption", () => {
  expect(outboundMessageSchema.safeParse({ conversationId: "c", type: "image", content: "x" }).success).toBe(true);
});

it("sends a Telegram personal attachment with its caption", async () => {
  await sendOutboundMessage({ conversationId: "conversation-1", content: "Bảng giá", attachment: { buffer: Buffer.from("pdf"), originalname: "bang-gia.pdf", mimetype: "application/pdf", size: 3 } }, ownerAuth);
  expect(dependencyMocks.personalSendFile).toHaveBeenCalledWith("peer-42", expect.objectContaining({ caption: "Bảng giá" }));
});
```

- [ ] **Step 2: Run focused tests and confirm the new behavior fails**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/schemas/conversation-message.schemas.test.ts src/services/outbound-message.service.test.ts`

Expected: FAIL because outbound schema only accepts text and service has no attachment argument.

- [ ] **Step 3: Implement the minimal shared types and persistence plumbing**

Extend the contract and mapper, change the schema to accept `text | image | file`, and pass `attachments` through `createOutboundMessage` without removing the existing text validation. Add a small `UploadedOutboundFile` type in the service and use the attachment's original filename and MIME type in the persisted attachment metadata.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/schemas/conversation-message.schemas.test.ts src/services/outbound-message.service.test.ts`

Expected: PASS for the new contract/persistence assertions and all existing outbound tests.

### Task 2: Telegram personal media delivery

**Files:**
- Modify: `apps/api/src/services/message.service.ts`
- Test: `apps/api/src/services/outbound-message.service.test.ts`

**Interfaces:**
- Telegram personal client call is `client.sendFile(entity, { file: CustomFile, caption: string })`.
- Text-only messages continue using `client.sendMessage(entity, { message: content })`.

- [ ] **Step 1: Add failing Telegram media tests**

Assert that an image uses `sendFile` with a `CustomFile`, caption, and no `sendMessage`; assert that an empty caption still sends the file with `caption: ""`.

- [ ] **Step 2: Run the Telegram service test and verify RED**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/services/outbound-message.service.test.ts -t "Telegram personal attachment"`

Expected: FAIL because the service currently calls only `sendMessage`.

- [ ] **Step 3: Implement the smallest connector branch**

Import `CustomFile` from `telegram/client/uploads`, construct it from the request buffer, and call `sendFile` only when an attachment exists. Use the returned message id and persist `type: "image"` for image MIME types, otherwise `type: "file"`.

- [ ] **Step 4: Run the focused test and the existing Telegram tests**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/services/outbound-message.service.test.ts src/channels/telegram-personal/telegram-personal.service.test.ts`

Expected: PASS.

### Task 3: Zalo personal media delivery and multipart API

**Files:**
- Modify: `apps/api/src/channels/zalo-personal/zalo-personal.client.ts`
- Modify: `apps/api/src/controllers/messages.controller.ts`
- Modify: `apps/api/src/routes/messages.routes.ts`
- Modify: `apps/api/src/services/message.service.ts`
- Test: `apps/api/src/channels/zalo-personal/zalo-personal.client.test.ts`
- Test: `apps/api/src/controllers/conversation-message.controller.test.ts`
- Test: `apps/api/src/services/outbound-message.service.test.ts`

**Interfaces:**
- Zalo adapter accepts `sendMessage(threadId, content, conversationType, attachment?)`.
- Multer exposes `request.file` as `{ buffer, originalname, mimetype, size }`.
- Endpoint remains `POST /api/v1/messages/send`; JSON text requests remain valid and multipart requests use fields `conversationId`, `type`, `content`, `attachment`.

- [ ] **Step 1: Add failing adapter, controller, and validation tests**

Cover a Zalo image buffer becoming zca-js `{ msg, attachments: [{ data, filename, metadata }] }`, reject more than one file, reject files above 20 MB and reject dangerous extensions before service invocation.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/channels/zalo-personal/zalo-personal.client.test.ts src/controllers/conversation-message.controller.test.ts src/services/outbound-message.service.test.ts`

Expected: FAIL because the adapter accepts text only and the route has no multipart parser.

- [ ] **Step 3: Implement shared upload middleware and Zalo adapter support**

Add a memory-storage Multer parser with `files: 1`, `fileSize: 20 * 1024 * 1024`, bounded field limits, MIME/extension filtering, and Vietnamese `INVALID_ATTACHMENT` errors. Extend the Zalo API boundary with `sendMessage` attachment input and call zca-js using a buffer source with the original filename and byte size.

- [ ] **Step 4: Wire controller and service**

Read `request.file`, parse the same schema for JSON and multipart fields, pass the uploaded file to `sendOutboundMessage`, and include persisted attachment metadata in the returned message.

- [ ] **Step 5: Run focused backend tests**

Run: `pnpm --filter @nhuu-chat/api exec vitest run src/channels/zalo-personal/zalo-personal.client.test.ts src/controllers/conversation-message.controller.test.ts src/services/outbound-message.service.test.ts`

Expected: PASS.

### Task 4: Composer upload and message rendering

**Files:**
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Test: `apps/web/src/components/conversations/MessageComposer.test.tsx`
- Test: `apps/web/src/pages/InboxPage.test.tsx`

**Interfaces:**
- Composer `onSend` consumes `{ content: string; attachment?: File }`.
- Inbox sends `FormData` with `conversationId`, `type`, `content`, and `attachment` to the existing endpoint.

- [ ] **Step 1: Add failing UI tests**

Test selecting an image/file through hidden inputs, showing the filename and remove action, and submitting an attachment with an empty caption. Test Inbox builds `FormData` and does not JSON-stringify it.

- [ ] **Step 2: Run frontend tests and verify RED**

Run: `pnpm --filter @nhuu-chat/web exec vitest run src/components/conversations/MessageComposer.test.tsx src/pages/InboxPage.test.tsx`

Expected: FAIL because the composer has no file input and Inbox currently sends text JSON.

- [ ] **Step 3: Implement composer state and controls**

Add separate image/file inputs with the approved accept lists, preserve one `File`, show image preview or file name/size, allow removal, disable duplicate selection while sending, and allow Enter submission when the caption is empty but a file exists.

- [ ] **Step 4: Implement Inbox FormData submission and render attachments**

Change only the outbound request body construction to `FormData`; keep refresh/error handling and realtime merge unchanged. In `ChatWindow`, render image thumbnails and downloadable file links before the caption, with accessible labels and safe `target="_blank"` links.

- [ ] **Step 5: Run focused frontend tests and production build**

Run: `pnpm --filter @nhuu-chat/web exec vitest run src/components/conversations/MessageComposer.test.tsx src/pages/InboxPage.test.tsx && pnpm --filter @nhuu-chat/web build`

Expected: PASS and a successful production build.

### Task 5: Documentation, full verification, and focused delivery

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`

- [ ] **Step 1: Document the user-visible feature and limitation**

Add Vietnamese Unreleased entries describing one attachment per send, 20 MB limit, supported channels, and the fact that other channel types remain text-only.

- [ ] **Step 2: Run the complete applicable verification**

Run: `pnpm test`, `pnpm build`, and `git diff --check`.

Expected: all applicable tests and builds exit 0; any pre-existing baseline failure is reported with its exact command and output.

- [ ] **Step 3: Inspect and stage only task files**

Run: `git diff --stat`, `git diff --check`, and `git status --short`; stage only the files listed in Tasks 1–5 that were actually changed, leaving all pre-existing modified files outside this feature unstaged.

- [ ] **Step 4: Commit and push**

Run: `git commit -m "feat: gửi file và ảnh từ inbox"` then `git push origin feature/nhuu-chat-mvp`.
