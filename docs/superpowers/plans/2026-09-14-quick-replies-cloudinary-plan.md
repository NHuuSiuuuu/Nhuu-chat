# Mẫu trả lời nhanh Cloudinary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu mẫu trả lời nhanh theo user, upload ảnh lên Cloudinary và dùng cùng dữ liệu đó trong Settings và Inbox.

**Architecture:** API Express nhận multipart upload, kiểm tra file bằng memory storage rồi dùng Cloudinary service để upload/xóa media. MongoDB lưu quick reply và metadata attachment, luôn lọc theo `request.auth.id`. Frontend tải quick replies qua API; composer nhận danh sách từ Inbox và chèn message/attachment khi chọn mẫu.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, Cloudinary SDK, Multer, React, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-14-quick-replies-cloudinary-design.md`

## Global Constraints

- Chỉ nhận ảnh trong phase này, MIME bắt đầu bằng `image/`, tối đa 5 MiB.
- Không lưu binary trong MongoDB; chỉ lưu metadata Cloudinary.
- Mọi quick reply phải thuộc user hiện tại; không cho đọc/sửa/xóa chéo user.
- Không ghi credential Cloudinary vào repository; dùng `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Giữ nguyên các thay đổi dirty không liên quan trong worktree.
- Cập nhật `CHANGELOG.md`, `README.md` và `docs/wiki/README.md` bằng tiếng Việt.
- Comment business logic mới viết bằng tiếng Việt.

### Task 1: Cấu hình media và contract

**Files:**
- Modify: `packages/config/src/env.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `.env.example`
- Test: `packages/config/src/env.test.ts`, `packages/contracts/src/index.test.ts` nếu file test contract đã có; nếu chưa có thì thêm test source nhỏ phù hợp pattern hiện tại.

**Interfaces:**
- Produces `QuickReplyAttachmentContract` và `QuickReplyContract` dùng chung cho API/web.
- Produces optional Cloudinary env fields; env vẫn phải cho phép test không cấu hình Cloudinary.

- [ ] **Step 1: Write failing tests** kiểm tra env nhận đủ ba biến khi có cấu hình và contract có các field `secureUrl`, `publicId`, `resourceType`, `mimeType`, `bytes`.
- [ ] **Step 2: Run focused tests**: `pnpm exec vitest run packages/config/src/env.test.ts`; xác nhận fail vì schema/contract chưa có.
- [ ] **Step 3: Implement minimal env/contract changes** và thêm tên biến vào `.env.example`.
- [ ] **Step 4: Run focused tests** và xác nhận pass.

### Task 2: Cloudinary media service

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/media/cloudinary.service.ts`
- Create: `apps/api/src/media/cloudinary.service.test.ts`

**Interfaces:**
- `uploadImage(input: { buffer: Buffer; filename: string; mimeType: string; userId: string; folder: string }): Promise<MediaUploadResult>`.
- `destroyMedia(publicId: string, resourceType: "image" | "video"): Promise<void>`.
- `MediaUploadResult` chứa `secureUrl`, `publicId`, `resourceType`, `mimeType`, `bytes`, `width?`, `height?`, `duration?`.

- [ ] **Step 1: Add failing tests** cho upload success, thiếu cấu hình, MIME không hợp lệ, quá 5 MiB và destroy.
- [ ] **Step 2: Run** `pnpm exec vitest run apps/api/src/media/cloudinary.service.test.ts`; xác nhận fail vì service chưa tồn tại.
- [ ] **Step 3: Add `cloudinary` dependency** và implement service bằng Cloudinary SDK, inject/mock uploader trong test để không gọi mạng.
- [ ] **Step 4: Run focused tests** và xác nhận pass.

### Task 3: Quick reply model/service/controller/routes

**Files:**
- Create: `apps/api/src/models/quick-reply.model.ts`
- Create: `apps/api/src/schemas/quick-reply.schemas.ts`
- Create: `apps/api/src/services/quick-reply.service.ts`
- Create: `apps/api/src/services/quick-reply.service.test.ts`
- Create: `apps/api/src/controllers/quick-reply.controller.ts`
- Create: `apps/api/src/controllers/quick-reply.controller.test.ts`
- Create: `apps/api/src/routes/quick-reply.routes.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `listQuickReplies(userId: string): Promise<{ quickReplies: QuickReplyContract[] }>`.
- `createQuickReply(userId: string, input: { shortcut: string; message: string; attachment?: UploadedFile }): Promise<QuickReplyContract>`.
- `updateQuickReply(userId: string, id: string, input: ...): Promise<QuickReplyContract>`.
- `deleteQuickReply(userId: string, id: string): Promise<void>`.

- [ ] **Step 1: Write service/controller tests** for create/list, duplicate shortcut per user, invalid/oversized image, cross-user 404, update replacement, delete cleanup and unauthenticated/forbidden route.
- [ ] **Step 2: Run focused tests** and confirm expected red failures.
- [ ] **Step 3: Implement model** with compound unique index `{ userId: 1, shortcut: 1 }`, attachment metadata and timestamps.
- [ ] **Step 4: Implement service** with user filter, Cloudinary upload, orphan cleanup on Mongo failure, replacement cleanup and delete cleanup.
- [ ] **Step 5: Implement multer memory middleware**, schemas, controller and authenticated `admin|agent` routes at `/api/v1/quick-replies`.
- [ ] **Step 6: Run focused API tests** and confirm pass.

### Task 4: Frontend Settings persistence and attachment upload

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.test.tsx`
- Modify: `apps/web/src/lib/api.ts` only if a multipart helper is required; preserve JSON behavior.

**Interfaces:**
- Settings calls `GET /api/v1/quick-replies` and `POST/PATCH/DELETE` with `FormData`.
- `QuickReply` uses `QuickReplyContract`, with `attachment?: QuickReplyAttachmentContract` instead of local `File` after successful save.

- [ ] **Step 1: Add failing frontend source tests** for GET endpoint, FormData fields, reload persistence, attachment URL rendering, delete/edit controls and upload error state.
- [ ] **Step 2: Run** `npm test -- --run apps/web/src/pages/SettingsPage.test.tsx`; confirm red.
- [ ] **Step 3: Implement API loading and FormData submit**; do not set JSON content type for multipart requests.
- [ ] **Step 4: Implement loading/error states and show image preview/link from `secureUrl`; clean local file state after save.
- [ ] **Step 5: Run focused frontend tests and web build**.

### Task 5: Inbox slash-command integration

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.test.tsx`
- Modify: `apps/web/src/pages/InboxPage.test.tsx`

**Interfaces:**
- `MessageComposer` receives `quickReplies: QuickReplyContract[]` and `onSelectQuickReply` behavior remains local to composer.
- Selecting a quick reply sets message text and exposes its `attachment.secureUrl`; it never calls `onSend`.

- [ ] **Step 1: Add failing tests** that `/` lists backend shortcuts, selecting one fills message, attachment URL is visible, and no send occurs.
- [ ] **Step 2: Run focused frontend tests** and confirm red.
- [ ] **Step 3: Load quick replies once in `InboxPage` with auth/refresh guard and pass them through `ChatWindow` to `MessageComposer`.
- [ ] **Step 4: Replace hardcoded quick replies with backend contracts and preserve keyboard navigation/escape behavior.
- [ ] **Step 5: Run focused tests and build.

### Task 6: Documentation and full verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`

- [ ] **Step 1: Document Cloudinary env variables, upload limits, route behavior and current limitation that message sending media is not yet implemented.
- [ ] **Step 2: Run focused API tests, focused web tests, full `pnpm test`, `pnpm --filter web build`, and `git diff --check`.
- [ ] **Step 3: Record MongoDB/environment blockers exactly if integration suites cannot run.
- [ ] **Step 4: Review scoped diff and report unrelated dirty files left untouched.
