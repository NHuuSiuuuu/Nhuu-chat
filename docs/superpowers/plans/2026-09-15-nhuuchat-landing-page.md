# NHuuChat Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng landing page public tiếng Việt cho NHuuChat tại `/` và điều hướng avatar/logo sang `/dashboard` mà không thay đổi behavior auth của các route private.

**Architecture:** Tạo `LandingPage` độc lập gồm header, hero, social proof, các section sản phẩm, pricing, testimonial, FAQ và footer. Dùng component `Reveal` dựa trên Intersection Observer + CSS class để các phần tử slide-up/slide-left/slide-right/zoom khi đi vào viewport; không thêm Framer Motion vì project chưa có dependency này và prompt cho phép Intersection Observer. Mở rộng bộ định tuyến hiện tại với page `landing`; `/` render landing public, còn `/dashboard` và route hiện có vẫn đi qua auth/ProtectedRoute.

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind CSS v4, CSS animation, Intersection Observer API, Vitest.

**Spec:** `DEVELOPMENT_PROMPT.md`

## Global Constraints

- Tất cả UI text mới phải bằng tiếng Việt và dùng brand `NHuuChat`.
- Không thay đổi API, database, authentication, authorization hoặc connector.
- Không thêm dependency animation; dùng Intersection Observer và CSS thuần.
- Avatar/logo ở header landing là semantic link tới `/dashboard`.
- FAQ dùng `button`, `aria-expanded` và vùng nội dung truy cập được.
- Giữ responsive desktop, narrow desktop và mobile bằng breakpoint Tailwind hiện có.
- Cập nhật `CHANGELOG.md`, README và Wiki source theo quy tắc dự án.

---

### Task 1: Route contract and landing-page regression tests

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: current `pageFromPath`, `pathForPage`, `AuthPage` and navigation callbacks.
- Produces: `AppPage` value `landing`, `/` resolution, and public `LandingPage` render contract.

- [ ] **Step 1: Write the failing tests**

Add source-level assertions requiring `AppPage` to include `landing`, `pathname === "/"` to resolve to it, and `<LandingPage` to be rendered. The landing component test in Task 2 owns the avatar link assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/App.test.tsx`

Expected: FAIL because the landing route and component do not exist yet.

- [ ] **Step 3: Implement the minimum route contract**

Add `landing` to `AppPage` and make `pageFromPath("/")` return `landing`. Render `<LandingPage onLogin={() => navigate("dashboard")} />` for the public root before the authenticated branch. Keep `AuthPage` for unauthenticated private paths and preserve all existing private route callbacks.

- [ ] **Step 4: Run the route test**

Run: `npx vitest run apps/web/src/App.test.tsx`

Expected: route source assertions pass; the production build remains deferred until Task 2 supplies the imported component.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: add public landing route"
```

### Task 2: Landing page content and responsive layout

**Files:**
- Create: `apps/web/src/pages/LandingPage.tsx`
- Create: `apps/web/src/pages/LandingPage.test.tsx`
- Create: `apps/web/src/components/landing/LandingIcon.tsx`

**Interfaces:**
- Consumes: `onLogin: () => void` and route-safe anchor links.
- Produces: `<LandingPage onLogin={...} />`, a complete public landing page with no API-backed hardcoded data.

- [ ] **Step 1: Write the failing component tests**

Require the page source to contain the exact prompt copy: `Quản lý tin nhắn đa kênh & AI Chatbot tự động`, `Tích hợp tất cả các kênh bán hàng của bạn`, `Tính năng cốt lõi cho tăng trưởng`, `Bắt đầu trong 3 bước đơn giản`, `Gói dịch vụ phù hợp với mọi quy mô`, `Doanh nghiệp nói gì về NHuuChat`, `Câu hỏi thường gặp`, and `Sẵn sàng tăng doanh số với NHuuChat?`. Also assert `href="/dashboard"`, `onLogin`, and `aria-expanded`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/pages/LandingPage.test.tsx`

Expected: FAIL because the page and icon component do not exist.

- [ ] **Step 3: Implement the page**

Export `LandingPage({ onLogin }: { onLogin: () => void })`. Build semantic header, hero, social proof, channel grid, 3x3 feature grid, 3-step flow, AI two-column section, pricing with local monthly/yearly state, integrations, testimonials/stats, FAQ accordion, final CTA, and footer. Use local arrays for static marketing copy and inline SVG/initial icons from `LandingIcon`; do not add remote image dependencies. Make the avatar/logo a keyboard-accessible anchor:

```tsx
<a href="/dashboard" aria-label="Mở Dashboard NHuuChat">...</a>
```

Use one FAQ open index with buttons exposing `aria-expanded`; CTA buttons invoke `onLogin` or point to safe local anchors.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/pages/LandingPage.test.tsx`

Run: `npm run build --prefix apps/web`

Expected: all landing tests pass and Vite production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/LandingPage.tsx apps/web/src/pages/LandingPage.test.tsx apps/web/src/components/landing/LandingIcon.tsx
git commit -m "feat: build nhuu chat landing page"
```

### Task 3: Scroll-triggered reveal animation and interaction polish

**Files:**
- Create: `apps/web/src/components/landing/Reveal.tsx`
- Create: `apps/web/src/components/landing/landing.css`
- Modify: `apps/web/src/pages/LandingPage.tsx`
- Modify: `apps/web/src/pages/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `Reveal` props `{ children: React.ReactNode; variant?: "up" | "left" | "right" | "zoom"; delay?: number; className?: string }`.
- Produces: one-time viewport reveal with reduced-motion support and staggered grid usage.

- [ ] **Step 1: Write the failing animation tests**

Require `LandingPage.tsx` to use `<Reveal` with `variant="left"`, `variant="right"`, and `variant="zoom"`; require `Reveal.tsx` to contain `IntersectionObserver`; require CSS to contain `landing-reveal--visible` and `prefers-reduced-motion`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/pages/LandingPage.test.tsx`

Expected: FAIL because the reusable reveal component and stylesheet do not exist.

- [ ] **Step 3: Implement reveal behavior**

`Reveal` observes its own element with threshold `0.2`, adds the visible class once, disconnects after the first intersection, and falls back to visible content when Intersection Observer is unavailable. Apply CSS variables with `React.CSSProperties` for delay. Define up/left/right/zoom transform states, 0.6–0.8 second ease-out transitions, stagger delays at `index * 0.1`, hover scale/color changes for CTA, and a reduced-motion rule that removes transforms and transitions.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/pages/LandingPage.test.tsx`

Run: `npm run build --prefix apps/web`

Expected: route, content, animation assertions and production build pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/Reveal.tsx apps/web/src/components/landing/landing.css apps/web/src/pages/LandingPage.tsx apps/web/src/pages/LandingPage.test.tsx
git commit -m "feat: add landing page scroll reveals"
```

### Task 4: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: completed landing route and animation behavior.
- Produces: documented public route, local run instructions, limitation notes, and changelog entry.

- [ ] **Step 1: Update documentation**

Document `/` as the public landing route, `/dashboard` as the authenticated app entry, avatar/logo navigation, and the fact that marketing content is static/local while real channel data remains inside authenticated pages. Mirror this in `docs/wiki/README.md` and add the feature under `## [Unreleased]` in Vietnamese `CHANGELOG.md`.

- [ ] **Step 2: Run focused verification**

```bash
npx vitest run apps/web/src/App.test.tsx apps/web/src/pages/LandingPage.test.tsx
npm run build --prefix apps/web
git diff --check
git status --short
```

Expected: focused tests and build pass, diff check has no output, and status lists only intentional landing-page/doc changes before commit.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/wiki/README.md CHANGELOG.md
git commit -m "docs: document nhuu chat landing page"
```
