# Đăng bài Facebook Page V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng luồng V1 để mỗi user kết nối một Facebook Page bằng Page ID/Access Token, đăng text hoặc một ảnh ngay/lên lịch và tự phục hồi bài đến hạn sau khi server khởi động lại.

**Architecture:** Tách connection/token, Facebook Graph publisher, post persistence và scheduler thành các module độc lập. Token được mã hóa bằng crypto hiện có; media dùng CloudinaryMediaService; MongoDB lưu trạng thái bài và atomic lease để worker không claim trùng.

**Tech Stack:** Node.js, Express, TypeScript, MongoDB/Mongoose, Vitest, React/TypeScript, Cloudinary hiện có, native `fetch` tới Meta Graph API.

**Spec:** `docs/superpowers/specs/2026-09-21-facebook-page-publishing-design.md`

## Global Constraints

- V1 chỉ hỗ trợ một Facebook Page trên mỗi user.
- Kết nối V1 nhận `pageId` và `pageAccessToken` thủ công; chưa triển khai OAuth/App Review.
- Bài viết bắt buộc có text và có tối đa một ảnh JPG/PNG/WebP, tối đa 5 MiB.
- Múi giờ nhập/hiển thị là `Asia/Ho_Chi_Minh`; MongoDB lưu `Date` UTC.
- Trạng thái hợp lệ: `draft`, `scheduled`, `publishing`, `published`, `failed`.
- Worker kiểm tra mỗi 30 giây; bài quá hạn vẫn được publish sau restart.
- Không trả token/ciphertext/raw Meta response về frontend hoặc log.
- Không sửa các file dirty ngoài phạm vi task hiện tại.
- Không thêm dependency mới nếu native fetch và module hiện có đủ dùng.

## File Map

- Create `apps/api/src/models/facebook-page-connection.model.ts`: connection schema, encrypted token và unique user index.
- Create `apps/api/src/models/facebook-post.model.ts`: post schema, media metadata, status và scheduler indexes.
- Create `apps/api/src/schemas/facebook-page.schemas.ts`: connection/request validation và safe error codes.
- Create `apps/api/src/schemas/facebook-post.schemas.ts`: multipart field validation, status transitions và timezone parsing.
- Create `apps/api/src/services/facebook-page.service.ts`: validate/store/read/remove one Page connection.
- Create `apps/api/src/services/facebook-publisher.service.ts`: Graph API calls and normalized errors.
- Create `apps/api/src/services/facebook-post.service.ts`: create/update/list/retry/cancel/publish orchestration.
- Create `apps/api/src/jobs/facebook-post.scheduler.ts`: 30-second polling, atomic claim and lease recovery.
- Create `apps/api/src/controllers/facebook-page.controller.ts` and `apps/api/src/controllers/facebook-post.controller.ts`.
- Create `apps/api/src/routes/facebook-page.routes.ts` and `apps/api/src/routes/facebook-post.routes.ts`.
- Modify `apps/api/src/app.ts` and `apps/api/src/server.ts`: register routes and scheduler lifecycle.
- Modify `packages/config/src/env.ts` and its tests: add Graph API version and scheduler settings with safe defaults.
- Modify `packages/contracts/src/index.ts`: shared connection/post/status response types.
- Modify `apps/web/src/App.tsx`: route `/posts` to the publishing page without disturbing auth.
- Create `apps/web/src/pages/FacebookPublishingPage.tsx` and focused tests.
- Create `apps/web/src/lib/facebook-publishing.api.ts`: typed API client using cookie credentials.
- Modify `CHANGELOG.md`, `README.md`, and `docs/wiki/README.md` after behavior is implemented.

### Task 1: Add shared contracts, configuration, and model tests

**Files:**
- Create: `packages/contracts/src/index.ts` additions for Facebook types.
- Modify: `packages/config/src/env.ts`.
- Modify: `packages/config/src/env.test.ts`.
- Create: `apps/api/src/models/facebook-page-connection.model.ts`.
- Create: `apps/api/src/models/facebook-post.model.ts`.
- Create: `apps/api/src/models/facebook-post.model.test.ts`.
- Create: `apps/api/src/models/facebook-page-connection.model.test.ts`.

**Interfaces:**
- Produce `FacebookPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed"`.
- Produce `FacebookPostMedia`, `FacebookPageConnectionResponse`, and `FacebookPostResponse` without token fields.
- Produce Mongoose models `FacebookPageConnectionModel` and `FacebookPostModel`.
- Add `META_GRAPH_API_VERSION` defaulting to `v26.0`, `FACEBOOK_POST_SCHEDULER_INTERVAL_MS` defaulting to `30000`, and `FACEBOOK_POST_LEASE_MS` defaulting to `120000`.

- [ ] **Step 1: Write failing model/config tests.** Assert the connection requires `userId`, `pageId`, and encrypted token; hides the encrypted token by default; enforces one connection per user; post status enum rejects unknown values; and config parses the two scheduler values and Graph version.
- [ ] **Step 2: Run the focused tests and verify RED.**

Run:

```bash
pnpm exec vitest run apps/api/src/models/facebook-page-connection.model.test.ts apps/api/src/models/facebook-post.model.test.ts packages/config/src/env.test.ts
```

Expected: FAIL because the new models, contracts, and config fields do not exist.

- [ ] **Step 3: Implement the schemas and contracts.** Add the exact fields from the spec, `select: false` for `encryptedPageAccessToken`, `{ userId: 1 }` unique connection index, `{ status: 1, scheduledAt: 1 }` post index, and `{ status: 1, publishingLeaseUntil: 1 }` recovery index. Keep `pageAccessToken` out of all response types.
- [ ] **Step 4: Run the focused tests and verify GREEN.**

Run the same command. Expected: all new tests and existing config tests pass.

- [ ] **Step 5: Commit the self-contained data contract.**

```bash
git add packages/contracts/src/index.ts packages/config/src/env.ts packages/config/src/env.test.ts apps/api/src/models/facebook-page-connection.model.ts apps/api/src/models/facebook-page-connection.model.test.ts apps/api/src/models/facebook-post.model.ts apps/api/src/models/facebook-post.model.test.ts
git commit -m "feat: thêm contract và model đăng bài facebook"
```

### Task 2: Implement Page connection validation and secure storage

**Files:**
- Create: `apps/api/src/schemas/facebook-page.schemas.ts`.
- Create: `apps/api/src/services/facebook-page.service.ts`.
- Create: `apps/api/src/controllers/facebook-page.controller.ts`.
- Create: `apps/api/src/routes/facebook-page.routes.ts`.
- Create: `apps/api/src/services/facebook-page.service.test.ts`.
- Create: `apps/api/src/controllers/facebook-page.controller.test.ts`.
- Modify: `apps/api/src/app.ts`.

**Interfaces:**
- `FacebookPageService.connect(userId: string, input: { pageId: string; pageAccessToken: string }): Promise<FacebookPageConnectionResponse>`.
- `FacebookPageService.get(userId: string): Promise<FacebookPageConnectionResponse | null>`.
- `FacebookPageService.remove(userId: string): Promise<void>`.
- Routes: `GET/POST/DELETE /api/v1/facebook-page/connection`.

- [ ] **Step 1: Write failing service tests.** Cover successful Graph metadata validation and encrypted persistence, invalid token rejection without persistence, Page ID mismatch rejection, one-user replacement behavior, and response redaction of token/ciphertext.
- [ ] **Step 2: Run tests and verify RED.**

```bash
pnpm exec vitest run apps/api/src/services/facebook-page.service.test.ts apps/api/src/controllers/facebook-page.controller.test.ts
```

Expected: FAIL because service/routes do not exist.

- [ ] **Step 3: Implement a Graph metadata client seam.** Inject a `fetch`-compatible function into the service so tests never call Meta. Validate `/{pageId}?fields=id,name&access_token=...`, require the returned ID to equal the submitted ID, map Graph errors to stable codes, and call `encryptSecret` only after validation succeeds.
- [ ] **Step 4: Implement authenticated routes.** Use existing cookie auth and `requireRole("admin", "agent")`; scope every query by `request.auth.id`. Return only safe metadata and use 4xx errors for invalid credentials/page mismatch.
- [ ] **Step 5: Run focused tests and verify GREEN.**
- [ ] **Step 6: Commit the connection slice.**

```bash
git add apps/api/src/schemas/facebook-page.schemas.ts apps/api/src/services/facebook-page.service.ts apps/api/src/services/facebook-page.service.test.ts apps/api/src/controllers/facebook-page.controller.ts apps/api/src/controllers/facebook-page.controller.test.ts apps/api/src/routes/facebook-page.routes.ts apps/api/src/app.ts
git commit -m "feat: thêm kết nối facebook page thủ công"
```

### Task 3: Implement Graph publisher and media upload boundary

**Files:**
- Create: `apps/api/src/services/facebook-publisher.service.ts`.
- Create: `apps/api/src/services/facebook-publisher.service.test.ts`.
- Modify: `apps/api/src/media/cloudinary.service.ts` only if an existing typed method cannot accept the V1 upload options.
- Create: `apps/api/src/services/facebook-post-media.service.ts`.
- Create: `apps/api/src/services/facebook-post-media.service.test.ts`.

**Interfaces:**
- `FacebookPublisher.publish(input: { pageId: string; pageAccessToken: string; message: string; mediaUrl?: string }): Promise<{ publishedPostId: string }>`.
- `FacebookPostMediaService.upload(userId: string, file: Express.Multer.File): Promise<FacebookPostMedia>`.
- `FacebookPostMediaService.destroy(media: FacebookPostMedia): Promise<void>`.

- [ ] **Step 1: Write failing publisher tests.** Assert text maps to the Page feed endpoint, image maps to the Page photo endpoint with caption, Graph success returns only post ID, and invalid token/permission/rate-limit/timeout errors map to stable codes without exposing the token.
- [ ] **Step 2: Run publisher tests and verify RED.**
- [ ] **Step 3: Implement publisher with injected fetch.** Use `META_GRAPH_API_VERSION`, pass token only in the server-side request, parse only the response fields needed, and never include the token in thrown errors.
- [ ] **Step 4: Write failing media tests.** Cover JPG/PNG/WebP acceptance, 5 MiB boundary, invalid MIME/oversize rejection, Cloudinary metadata mapping, and cleanup after a later persistence failure.
- [ ] **Step 5: Implement media service using `CloudinaryMediaService`.** Upload to `nhuu-chat/facebook-posts/{userId}` and retain the asset after publish failure so retry can reuse it.
- [ ] **Step 6: Run focused publisher/media tests and verify GREEN.**
- [ ] **Step 7: Commit the external-integration boundary.**

```bash
git add apps/api/src/services/facebook-publisher.service.ts apps/api/src/services/facebook-publisher.service.test.ts apps/api/src/services/facebook-post-media.service.ts apps/api/src/services/facebook-post-media.service.test.ts apps/api/src/media/cloudinary.service.ts
git commit -m "feat: thêm publisher facebook và upload media"
```

### Task 4: Implement post service and HTTP API

**Files:**
- Create: `apps/api/src/schemas/facebook-post.schemas.ts`.
- Create: `apps/api/src/services/facebook-post.service.ts`.
- Create: `apps/api/src/controllers/facebook-post.controller.ts`.
- Create: `apps/api/src/routes/facebook-post.routes.ts`.
- Create: `apps/api/src/services/facebook-post.service.test.ts`.
- Create: `apps/api/src/controllers/facebook-post.controller.test.ts`.
- Modify: `apps/api/src/app.ts` to register post routes and multer limits.

**Interfaces:**
- `createPost(userId, input): Promise<FacebookPostResponse>` for `draft`, `now`, and `scheduled`.
- `updatePost(userId, postId, input): Promise<FacebookPostResponse>` for `draft`/`scheduled` only.
- `listPosts(userId, filters): Promise<FacebookPostResponse[]>`.
- `retryPost(userId, postId, mode: "now" | "scheduled"): Promise<FacebookPostResponse>`.
- `cancelPost(userId, postId): Promise<void>`.

- [ ] **Step 1: Write failing service tests.** Cover draft persistence, future schedule conversion from `Asia/Ho_Chi_Minh` to UTC, immediate publish success/failure, ownership isolation, forbidden status transitions, retry, cancel and Cloudinary cleanup.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Implement validation and state transitions.** Require non-empty text, reject more than one file and invalid image types, reject scheduled times in the past, and keep all queries scoped by user ID.
- [ ] **Step 4: Implement immediate publish.** Create `publishing`, call the publisher, then atomically write `published`/`failed`, attempts, safe error, and published ID.
- [ ] **Step 5: Implement multipart routes.** Use existing auth/error middleware and return safe response shapes; never serialize the connection secret.
- [ ] **Step 6: Run controller/service focused tests and verify GREEN.**
- [ ] **Step 7: Commit the post API slice.**

```bash
git add apps/api/src/schemas/facebook-post.schemas.ts apps/api/src/services/facebook-post.service.ts apps/api/src/services/facebook-post.service.test.ts apps/api/src/controllers/facebook-post.controller.ts apps/api/src/controllers/facebook-post.controller.test.ts apps/api/src/routes/facebook-post.routes.ts apps/api/src/app.ts
git commit -m "feat: thêm api quản lý bài đăng facebook"
```

### Task 5: Implement scheduler, lease recovery, and server lifecycle

**Files:**
- Create: `apps/api/src/jobs/facebook-post.scheduler.ts`.
- Create: `apps/api/src/jobs/facebook-post.scheduler.test.ts`.
- Modify: `apps/api/src/server.ts`.
- Modify: `apps/api/src/server.lifecycle.test.ts`.

**Interfaces:**
- `FacebookPostScheduler.start(): void`.
- `FacebookPostScheduler.stop(): void`.
- `FacebookPostScheduler.runOnce(): Promise<boolean>` for deterministic tests.

- [ ] **Step 1: Write failing scheduler tests.** Cover due scheduled post, future post ignored, atomic claim, stale `publishing` lease recovery, publish success, publish failure, no retry on ambiguous timeout, and `start`/`stop` timer cleanup.
- [ ] **Step 2: Run scheduler tests and verify RED.**
- [ ] **Step 3: Implement `runOnce`.** Query one due `scheduled` or expired `publishing` post, claim with `findOneAndUpdate`, load the owner connection, decrypt only in memory, call the publisher, then persist the terminal state.
- [ ] **Step 4: Implement interval lifecycle.** Use the configured 30-second interval, run one recovery pass on startup, avoid overlapping runs, and expose stop for tests and graceful shutdown.
- [ ] **Step 5: Run scheduler/server tests and verify GREEN.**
- [ ] **Step 6: Commit the worker slice.**

```bash
git add apps/api/src/jobs/facebook-post.scheduler.ts apps/api/src/jobs/facebook-post.scheduler.test.ts apps/api/src/server.ts apps/api/src/server.lifecycle.test.ts
git commit -m "feat: thêm worker đăng bài theo lịch"
```

### Task 6: Build the Facebook publishing frontend

**Files:**
- Create: `apps/web/src/lib/facebook-publishing.api.ts`.
- Create: `apps/web/src/pages/FacebookPublishingPage.tsx`.
- Create: `apps/web/src/pages/FacebookPublishingPage.test.tsx`.
- Create: `apps/web/src/lib/facebook-publishing.api.test.ts`.
- Modify: `apps/web/src/App.tsx` to route `/posts` and render the publishing page.
- Modify: `CHANGELOG.md`.

**Interfaces:**
- API client functions use `credentials: "include"` and return shared contract types.
- Page component renders connection state, composer, preview, post list and safe error states.

- [ ] **Step 1: Write failing page tests.** Assert token input is password-only, page connection submit sends JSON without persisting token in browser storage, composer supports text/image preview, publish mode controls are mutually exclusive, Vietnam timezone is shown, and status actions map to the correct API calls.
- [ ] **Step 2: Run the focused page tests and verify RED.**
- [ ] **Step 3: Implement the typed API client.** Use cookie credentials, `FormData` for post create/update, and preserve server error codes for safe Vietnamese UI messages.
- [ ] **Step 4: Implement the connection form and composer.** Show only safe Page metadata after connection; validate text/file/size client-side for UX but keep backend validation authoritative; revoke object URLs on cleanup.
- [ ] **Step 5: Implement list/status/retry/cancel actions.** Poll the list after mutation, disable invalid actions by status, and never render token or raw Graph response.
- [ ] **Step 6: Add navigation without changing unrelated Inbox/dashboard behavior.**
- [ ] **Step 7: Run focused web tests and production build.**
- [ ] **Step 8: Commit the frontend slice.**

```bash
git add apps/web/src/lib/facebook-publishing.api.ts apps/web/src/lib/facebook-publishing.api.test.ts apps/web/src/pages/FacebookPublishingPage.tsx apps/web/src/pages/FacebookPublishingPage.test.tsx apps/web/src/App.tsx CHANGELOG.md
git commit -m "feat: thêm giao diện đăng bài facebook"
```

### Task 7: Documentation and operational configuration

**Files:**
- Modify: `README.md`.
- Modify: `docs/wiki/README.md`.
- Modify: `.env.example` only for non-secret names already supported by config.
- Modify: `CHANGELOG.md`.

- [ ] **Step 1: Document V1 setup.** Explain Cloudinary requirements, Graph API version, manual Page ID/token setup, Development Mode limitation, timezone, worker interval, token security, and the exact supported media/status behavior.
- [ ] **Step 2: Document known limitations.** State no OAuth, one Page/user, no video/multiple images, no recurring schedules, and ambiguous Meta timeout requires manual review.
- [ ] **Step 3: Run documentation diff check.**
- [ ] **Step 4: Commit documentation.**

```bash
git add README.md docs/wiki/README.md .env.example CHANGELOG.md
git commit -m "docs: hướng dẫn đăng bài facebook page v1"
```

### Task 8: Full verification and handoff

**Files:**
- No new production files; inspect all commits and preserve unrelated dirty files.

- [ ] **Step 1: Run all focused backend tests.**

```bash
pnpm exec vitest run \
  apps/api/src/models/facebook-page-connection.model.test.ts \
  apps/api/src/models/facebook-post.model.test.ts \
  apps/api/src/services/facebook-page.service.test.ts \
  apps/api/src/controllers/facebook-page.controller.test.ts \
  apps/api/src/services/facebook-publisher.service.test.ts \
  apps/api/src/services/facebook-post-media.service.test.ts \
  apps/api/src/services/facebook-post.service.test.ts \
  apps/api/src/controllers/facebook-post.controller.test.ts \
  apps/api/src/jobs/facebook-post.scheduler.test.ts
```

- [ ] **Step 2: Run focused frontend tests and production build.**

```bash
pnpm --filter web exec vitest run src/pages/FacebookPublishingPage.test.tsx src/lib/facebook-publishing.api.test.ts
pnpm --filter web build
```

- [ ] **Step 3: Run repository checks.**

```bash
pnpm exec tsc --noEmit
git diff --check
```

- [ ] **Step 4: Run a safe Graph API smoke test only with a user-provided test Page/token.** Verify connection validation, text publish, image publish and scheduled recovery; redact token, Page token, raw response and customer data from output.
- [ ] **Step 5: Review the final diff.** Confirm only Facebook publishing files/docs are staged, no secrets are present, and unrelated dirty UI/doc files remain untouched.
- [ ] **Step 6: Push the focused commits and report commit hashes, tests, build, smoke result, and any Meta/environment limitation.**
