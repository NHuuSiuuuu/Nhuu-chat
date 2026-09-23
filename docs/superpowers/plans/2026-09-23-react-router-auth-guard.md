# React Router Authentication Guard Implementation Plan

> **For agentic workers:** Use the `superpowers:executing-plans` workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written history router with React Router v6 and redirect unauthenticated visitors away from every private application route.

**Architecture:** Mount a single `BrowserRouter` at the app entry point. Define public routes for landing and authentication, then group dashboard routes beneath a `ProtectedRoute` that waits for the existing cookie-backed session bootstrap and uses `Navigate replace` for unauthenticated users. Keep the existing backend session API and HttpOnly cookies; do not introduce localStorage tokens.

**Tech Stack:** React 19, TypeScript, React Router DOM v6, Vitest, React Test Renderer.

**Spec:** User request dated 2026-09-23: “Yêu cầu thiết lập bảo mật Route (Auth Guard) cho dự án React” and subsequent choice “Chuyển ứng dụng sang React Router v6”.

## Global Constraints

- Keep `/`, `/login`, `/register`, `/forgot-password`, and `/reset-password` public.
- Protect dashboard, inbox, Telegram, settings, profile, posts, orders, analytics, and unknown internal paths.
- Use verified in-memory session state backed by existing HttpOnly auth cookies; never treat a fixed string or localStorage value as authentication.
- Preserve inbox platform/query state, toast navigation, login redirect behavior, titles, intro visibility, and current role restrictions.
- Do not alter the backend auth API or cookie contract.

---

### Task 1: Add React Router v6 and route guard

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/components/common/ProtectedRoute.tsx`
- Create: `apps/web/src/components/common/ProtectedRoute.test.tsx`

**Interfaces:**
- `ProtectedRoute` consumes `isAuthenticated: boolean`, `isLoading: boolean`, and optional `children?: ReactNode` only if needed by existing test/render conventions.
- When loading, render an accessible route-loading fallback; when signed out, render `<Navigate replace to="/login" />`; otherwise render `<Outlet />`.

- [x] Add React Router DOM v6 as a frontend dependency.
- [x] Write tests for loading, unauthenticated redirect with replace semantics, and authenticated outlet rendering.
- [x] Run the focused guard tests and confirm they fail before implementing the guard.
- [x] Implement the guard and rerun the tests.

### Task 2: Replace hand-written navigation with React Router routes

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/App.routes.test.ts`

**Interfaces:**
- `App` renders public routes, a pathless protected route group, and a not-found redirect inside the router.
- Navigation callbacks use `useNavigate`; route and query state use `useLocation`/`useSearchParams` or the location object.
- Private route elements receive the existing user/session and page callbacks without changing API contracts.

- [x] Add router behavior tests covering public route access, private direct URL redirect, and private rendering after session verification.
- [x] Run the focused tests and confirm the expected failures before migration.
- [x] Mount `BrowserRouter` once at the app root and define public/private route groups.
- [x] Replace `window.history.pushState`, the manual `popstate` listener, and route-derived local page state with router hooks.
- [x] Preserve inbox query parameters, selected conversations, settings subsection paths, and browser back/forward behavior.
- [x] Run the focused router and app tests.

### Task 3: Document and verify the route migration

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md` only if routing setup requires new user-facing instructions.
- Modify: `docs/wiki/README.md` only if routing setup changes documented operating behavior.

- [x] Add an Unreleased changelog entry for the auth guard and route protection.
- [ ] Run frontend focused tests and the full frontend test suite.
- [x] Run the production frontend build and `git diff --check`.
- [x] Review the final diff to confirm the pre-existing dirty Messenger changelog entry remains intact and is not included in the auth-guard commit unless already committed separately.
