# Setting History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng trang Lịch sử hoạt động có Timeline, ghi nhận AI Settings và kết nối/ngắt kết nối Facebook Page, phân trang và giữ tối đa 500 bản ghi cho mỗi người dùng.

**Architecture:** Backend tách model, diff/retention service và read API. Các mutation hiện có gọi recorder sau khi lưu thành công; OAuth Facebook đi qua cùng `facebookPageService.connect` nên không ghi trùng. Frontend dùng component Timeline riêng trong tab `/settings/history`, gọi API theo user session và không chứa logic diff/retention.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, Zod, Vitest, React 19, Vite, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-22-setting-history-design.md`

## Global Constraints

- Giữ nguyên hoàn toàn đăng nhập Facebook thủ công bằng Page ID + Page Access Token.
- Mọi query lịch sử bắt buộc giới hạn theo authenticated user; không nhận `userId` từ query/body.
- Không ghi Page Access Token, OAuth token, cookie, password hoặc secret vào history.
- Giữ tối đa 500 bản ghi lịch sử cho mỗi người dùng.
- Không tạo log giả cho các hành động chưa có API.
- Không sửa logic xác thực, OAuth, mã hóa token hoặc quyền hiện tại ngoài điểm tích hợp recorder.
- Chỉ stage file thuộc task; giữ nguyên mọi dirty file ngoài phạm vi.
- Comment code mới, nếu cần, phải viết bằng tiếng Việt.
- Cập nhật `CHANGELOG.md`, `README.md` và `docs/wiki/README.md` cho hệ thống mới.

---

### Task 1: Core model, diff và retention service

**Files:**
- Create: `apps/api/src/models/setting-history.model.ts`
- Create: `apps/api/src/services/setting-history.service.ts`
- Create: `apps/api/src/models/setting-history.model.test.ts`
- Create: `apps/api/src/services/setting-history.service.test.ts`

**Interfaces:**
- Produces `SettingHistoryActionType`, `SettingHistoryChange`, `diffSettings(oldValue, newValue)`, `recordSettingHistory(input)` and `listSettingHistories(input)` for later tasks.
- `recordSettingHistory` receives `{ userId: string; actionType: SettingHistoryActionType; actionTitle: string; oldValue: unknown; newValue: unknown }` and returns `Promise<SettingHistory | null>`; it returns `null` when there is no diff.
- `listSettingHistories` receives `{ userId: string; page: number; pageSize: number; actionType?: SettingHistoryActionType }` and returns `{ items, pagination }`.

- [ ] **Step 1: Write the failing diff/model tests**

Add tests that assert:

```ts
expect(diffSettings({ enabled: true }, { enabled: false })).toEqual([
  { fieldName: "enabled", oldValue: true, newValue: false }
]);
expect(diffSettings({ ai: { mode: "smart" } }, { ai: { mode: "economy" } })).toEqual([
  { fieldName: "ai › mode", oldValue: "smart", newValue: "economy" }
]);
expect(diffSettings({ values: ["a"] }, { values: ["a", "b"] })).toEqual([
  { fieldName: "values › 1", oldValue: undefined, newValue: "b" }
]);
expect(diffSettings({ enabled: true }, { enabled: true })).toEqual([]);
```

Add model assertions for required `userId`, `actionType`, `actionTitle`, `changes`, timestamps and both compound indexes.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run apps/api/src/models/setting-history.model.test.ts apps/api/src/services/setting-history.service.test.ts`

Expected: FAIL because the model and exported diff/service functions do not exist yet.

- [ ] **Step 3: Implement the model and diff**

Use a Mongoose schema with `userId` ref `User`, `changes` subdocuments with `_id: false`, timestamps, and indexes `{ userId: 1, createdAt: -1, _id: -1 }` and `{ userId: 1, actionType: 1, createdAt: -1, _id: -1 }`. Implement recursive object/array traversal with `›` paths and stable conversion of missing values without stringifying secrets.

- [ ] **Step 4: Implement recording, listing and 500-row retention**

Create the record only when `diffSettings` returns at least one change. Generate `versionHash` from the saved ObjectId or a short cryptographic random value. After saving, query records for that user sorted oldest first, keep the newest 500 IDs, and delete older records. Listing must clamp `pageSize` to 50, sort newest first with `_id` tie-breaker, and return `total`, `totalPages`, `hasNextPage`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the same Vitest command. Expected: all model, diff, no-op, nested-value and retention tests pass.

- [ ] **Step 6: Commit the focused core change**

Run:

```bash
git add apps/api/src/models/setting-history.model.ts apps/api/src/models/setting-history.model.test.ts apps/api/src/services/setting-history.service.ts apps/api/src/services/setting-history.service.test.ts
git commit -m "feat: thêm lõi lưu lịch sử cài đặt"
```

### Task 2: Integrate AI Settings and Facebook Page mutations

**Files:**
- Modify: `apps/api/src/services/ai-settings.service.ts`
- Modify: `apps/api/src/services/facebook-page.service.ts`
- Modify: `apps/api/src/services/ai-settings.service.test.ts`
- Modify: `apps/api/src/services/facebook-page.service.test.ts`
- Modify: `apps/api/src/controllers/ai-settings.controller.test.ts` only if needed for regression coverage

**Interfaces:**
- Consumes Task 1 `recordSettingHistory`.
- Mutation return values and existing API behavior remain unchanged.

- [ ] **Step 1: Write failing integration tests**

Test that AI update reads the old normalized settings and records only changed fields after a successful update. Test that identical AI patch does not create a history record. Test Facebook `connect` records a connect action without the token, `remove` records the previous Page identity, and OAuth’s callback to `facebookPageService.connect` produces one record because no controller-level second recorder is added.

- [ ] **Step 2: Run the focused integration tests and verify RED**

Run: `pnpm exec vitest run apps/api/src/services/ai-settings.service.test.ts apps/api/src/services/facebook-page.service.test.ts`

Expected: FAIL because mutation services do not call the recorder.

- [ ] **Step 3: Add recorder calls after successful mutations**

In AI update, snapshot normalized settings before `findByIdAndUpdate`, normalize the saved settings, then call the recorder in a non-blocking failure-isolated helper. In Facebook connect, snapshot the existing safe connection metadata before validation/save, then record only safe fields such as `pageId`, `pageName` and `status`. In remove, record the safe metadata before `deleteOne`. Never pass `pageAccessToken` or encrypted token to the recorder.

- [ ] **Step 4: Run integration and existing service tests**

Run: `pnpm exec vitest run apps/api/src/services/ai-settings.service.test.ts apps/api/src/services/facebook-page.service.test.ts apps/api/src/controllers/ai-settings.controller.test.ts`

Expected: existing behavior and new audit assertions pass.

- [ ] **Step 5: Commit the focused integration change**

Run:

```bash
git add apps/api/src/services/ai-settings.service.ts apps/api/src/services/facebook-page.service.ts apps/api/src/services/ai-settings.service.test.ts apps/api/src/services/facebook-page.service.test.ts apps/api/src/controllers/ai-settings.controller.test.ts
git commit -m "feat: ghi log thay đổi AI và Facebook"
```

### Task 3: History read API with auth, filter and pagination

**Files:**
- Create: `apps/api/src/controllers/setting-history.controller.ts`
- Create: `apps/api/src/controllers/setting-history.controller.test.ts`
- Create: `apps/api/src/routes/setting-history.routes.ts`
- Create: `apps/api/src/routes/setting-history.routes.test.ts`
- Create: `apps/api/src/schemas/setting-history.schemas.ts`
- Create: `apps/api/src/schemas/setting-history.schemas.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces `GET /api/v1/setting-histories?page=1&pageSize=20&actionType=...`.
- Response shape: `{ items: SettingHistoryResponse[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNextPage: boolean } }`.

- [ ] **Step 1: Write failing schema/controller/route tests**

Assert that page defaults to 1, page size defaults to 20 and clamps at 50, unsupported `actionType` is rejected with `400 INVALID_REQUEST`, unauthenticated requests fail with the existing auth behavior, and the controller passes only `request.auth.id` to the service. Assert the app mounts `/api/v1/setting-histories`.

- [ ] **Step 2: Run focused API tests and verify RED**

Run: `pnpm exec vitest run apps/api/src/schemas/setting-history.schemas.test.ts apps/api/src/controllers/setting-history.controller.test.ts apps/api/src/routes/setting-history.routes.test.ts`

Expected: FAIL because the schema, controller and route do not exist.

- [ ] **Step 3: Implement schema, controller, route and app mount**

Use the existing `requireRole("admin", "agent")` guard, parse query with Zod, call `listSettingHistories({ userId: authenticatedUserId(request), ... })`, and return the service response without exposing raw Mongoose documents. Mount the router after the other authenticated resource routers.

- [ ] **Step 4: Run focused API tests and relevant regression tests**

Run: `pnpm exec vitest run apps/api/src/schemas/setting-history.schemas.test.ts apps/api/src/controllers/setting-history.controller.test.ts apps/api/src/routes/setting-history.routes.test.ts apps/api/src/routes/ai-settings.routes.test.ts`

Expected: all pass and existing route declarations remain unchanged.

- [ ] **Step 5: Commit the focused API change**

Run:

```bash
git add apps/api/src/controllers/setting-history.controller.ts apps/api/src/controllers/setting-history.controller.test.ts apps/api/src/routes/setting-history.routes.ts apps/api/src/routes/setting-history.routes.test.ts apps/api/src/schemas/setting-history.schemas.ts apps/api/src/schemas/setting-history.schemas.test.ts apps/api/src/app.ts
git commit -m "feat: thêm API đọc lịch sử cài đặt"
```

### Task 4: Settings History Timeline UI

**Files:**
- Create: `apps/web/src/components/settings/SettingHistoryTimeline.tsx`
- Create: `apps/web/src/components/settings/SettingHistoryTimeline.test.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes `GET /api/v1/setting-histories` response from Task 3.
- Component props: `{ token: string; refresh: () => Promise<string | null>; apiUrl: string }`.

- [ ] **Step 1: Write failing component/source tests**

Assert that the Timeline renders one shared history view, filter labels `Tất cả`, `Cài đặt AI`, `Kết nối Facebook`, old/new values, version hash, `HH:mm • DD/MM/YYYY`, loading/error/empty states and pagination controls. Assert that the old labels `Xóa bình luận`, `Chặn khách hàng`, `Chế độ xoay vòng` are not rendered by the history view. Assert responsive classes include a desktop two-column layout and a mobile single-column layout.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `pnpm exec vitest run apps/web/src/components/settings/SettingHistoryTimeline.test.tsx apps/web/src/pages/SettingsPage.test.tsx`

Expected: FAIL because the component and history branch do not exist.

- [ ] **Step 3: Implement the Timeline component**

Use `apiRequest` with `credentials: include` through the existing helper. Keep `page`, `actionType`, loading, error and response state local. Render a timeline with `border-l`, anchor circles, safe value badges, fallback initials, Vietnamese labels and a sticky note card stating the 500-record limit. Fetch again on filter/page changes and reset page to 1 when the filter changes.

- [ ] **Step 4: Integrate `/settings/history` without changing unrelated Settings behavior**

Render `SettingHistoryTimeline` for `activeTab === "Lịch sử"`. Keep the Settings sidebar item/icon and existing route. Do not add the removed three history tabs to mobile or desktop navigation.

- [ ] **Step 5: Run focused tests and production build**

Run:

```bash
pnpm exec vitest run --exclude '**/.worktrees/**' apps/web/src/components/settings/SettingHistoryTimeline.test.tsx apps/web/src/pages/SettingsPage.test.tsx
pnpm --filter web build
```

Expected: all focused tests pass and Vite build exits 0.

- [ ] **Step 6: Commit the focused UI change**

Run:

```bash
git add apps/web/src/components/settings/SettingHistoryTimeline.tsx apps/web/src/components/settings/SettingHistoryTimeline.test.tsx apps/web/src/pages/SettingsPage.tsx apps/web/src/pages/SettingsPage.test.tsx
git commit -m "feat: thêm giao diện lịch sử hoạt động"
```

### Task 5: Documentation, full verification and delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update docs**

Add the feature under current status, usage/API behavior, security limitation and retention behavior. Add one Vietnamese `Unreleased` CHANGELOG entry; do not rewrite existing entries.

- [ ] **Step 2: Run the complete applicable verification**

Run:

```bash
pnpm exec vitest run --exclude '**/.worktrees/**' apps/api/src apps/web/src
pnpm --filter web build
git diff --check
git diff --cached --check
```

Record unrelated environment failures separately; do not weaken or delete tests to make the suite pass.

- [ ] **Step 3: Inspect staged scope and commit documentation**

Stage only the three documentation files, inspect `git diff --cached`, then run:

```bash
git add README.md docs/wiki/README.md CHANGELOG.md
git commit -m "docs: cập nhật tài liệu lịch sử hoạt động"
```

- [ ] **Step 4: Push the current feature branch**

Run `git push origin feature/nhuu-chat-mvp`. Verify the pushed commit and report the commit hashes, test/build outputs, and intentionally preserved dirty files. Do not merge into another branch.
