# Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Landing Page public tại `/` cho NhuuChat với animation, mockup Inbox và hành vi chỉ bấm user mới mở Dashboard khi đã đăng nhập.

**Architecture:** Tách Landing Page thành page/section components độc lập dưới `apps/web/src/components/landing/`. `App.tsx` giữ route `/` riêng với session bootstrap, truyền user và callback điều hướng Dashboard; các route private tiếp tục đi qua `ProtectedRoute`. Thêm `framer-motion` vào web dependencies để animation dùng chung.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-public-landing-page-design.md`

## Global Constraints

- `/` luôn là Landing Page; session hợp lệ không tự chuyển Dashboard.
- Chỉ click user/avatar trên Header Landing Page mới điều hướng `/dashboard`.
- Giữ nguyên API xác thực, `ProtectedRoute` và toàn bộ route private hiện có.
- UI text tiếng Việt; không dùng ảnh/CDN ngoài cho mockup.
- Không sửa backend, schema, migration hoặc logic Facebook/Zalo/Telegram.
- Giữ các thay đổi dirty ngoài phạm vi và chỉ stage file của task hiện tại.
- Cập nhật `CHANGELOG.md` trong `## [Unreleased]`.

### Task 1: Landing sections and motion primitives

**Files:**
- Create: `apps/web/src/components/landing/LandingPage.tsx`
- Create: `apps/web/src/components/landing/LandingPage.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `LandingPageProps = { user: { email: string; role: AuthRole } | null; onDashboard: () => void; onLogin: () => void; onRegister: () => void }`.
- Renders stable anchors `#tinh-nang`, `#kenh-tich-hop`, `#bang-gia`, `#faq` and a user button with accessible label when `user` exists.

- [ ] Write failing tests asserting the component renders the hero, four anchor sections, FAQ, and user button callback contract.
- [ ] Run `pnpm exec vitest run apps/web/src/components/landing/LandingPage.test.tsx --exclude '.worktrees/**'`; confirm failure because the component/dependency is missing.
- [ ] Add `framer-motion` to `apps/web/package.json`, install lockfile, and implement section primitives with `motion.div`, `whileInView`, and reduced-motion-safe transition settings.
- [ ] Build the mockup Inbox with React/Tailwind/SVG only; add FAQ local state and responsive layout matching the reference.
- [ ] Run the focused test and confirm all assertions pass.
- [ ] Commit only Task 1 files with `feat: thêm landing page public`.

### Task 2: Root route and authenticated user navigation

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- `pageFromPath("/")` returns a public landing route distinct from `dashboard`.
- `App` renders `LandingPage` after session bootstrap whether `auth` is null or present; it passes `onDashboard={() => navigate("dashboard")}`.

- [ ] Add failing route tests proving `/` is not treated as Dashboard and authenticated user navigation is wired to `/dashboard`.
- [ ] Run the focused App tests and confirm failure against the current fallback-to-dashboard behavior.
- [ ] Add the `landing` route type/path mapping and render branch without changing private route guards.
- [ ] Wire existing auth callbacks to Landing Page login/register entry points without changing auth API calls.
- [ ] Run App tests, current Settings tests, and production build.
- [ ] Commit only Task 2 files with `fix: giữ landing page tại route gốc`.

### Task 3: Documentation and branch verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add one concise Vietnamese Unreleased entry describing the public Landing Page and `/` behavior.
- [ ] Run `pnpm exec vitest run apps/web/src/components/landing/LandingPage.test.tsx apps/web/src/App.test.tsx --exclude '.worktrees/**'`.
- [ ] Run `pnpm --filter web build` and `git diff --check`.
- [ ] Inspect staged diff to ensure unrelated dirty files are not included.
- [ ] Commit documentation if not included in Task 1/2 and push the feature branch.
