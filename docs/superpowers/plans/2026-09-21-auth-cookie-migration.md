# Auth Cookie Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển phiên đăng nhập của Nhuu-chat từ token trong `localStorage`/JSON sang HttpOnly access và refresh cookie, đồng thời giữ tương thích Bearer cho client cũ.

**Architecture:** Backend phát hành và xóa hai cookie JWT, xác thực access cookie trước Bearer fallback, xoay refresh cookie bằng hash trong user và cung cấp session/logout route. Frontend chỉ giữ user trong memory, bootstrap bằng session/refresh, gửi credentials cho mọi API và Socket.IO; các props `token` cũ được giữ tạm thời nhưng không còn chứa JWT để tránh refactor lan rộng.

**Tech Stack:** Express 5, TypeScript, jose, Mongoose, Socket.IO, React 19, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-21-auth-cookie-design.md`

## Global Constraints

- Cookie names are `nhuu_access_token` and `nhuu_refresh_token`.
- Access cookie expires in 15 minutes; refresh cookie expires in 7 days; both use `HttpOnly` and `Path=/`.
- `Secure=true` in production and `Secure=false` in development/test; `SameSite` comes from `AUTH_COOKIE_SAME_SITE`, defaulting to `lax` outside production and `none` in production.
- No access or refresh token may be returned in auth JSON, stored in browser storage, logged, or placed in error messages.
- Access middleware keeps `Authorization: Bearer` fallback; refresh accepts the cookie contract only.
- Mutation requests with a disallowed `Origin` return 403; requests without `Origin` remain allowed for server-to-server and tests.
- Preserve unrelated dirty files and stage only files listed by the task.

### Task 1: Cookie primitives and environment configuration

**Files:**
- Create: `apps/api/src/auth/auth.cookies.ts`
- Create: `apps/api/src/auth/auth.cookies.test.ts`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Modify: `.env.example`

**Interfaces:**
- `readCookie(request, name): string | undefined`
- `setAuthCookies(response, tokens): void`
- `clearAuthCookies(response): void`

- [x] **Step 1: Write failing tests** for parsing a named cookie, HttpOnly/SameSite/Max-Age/Path attributes, production Secure behavior, and clearing both cookies.
- [x] **Step 2: Run `pnpm exec vitest run apps/api/src/auth/auth.cookies.test.ts packages/config/src/env.test.ts` and confirm failure because the helpers/config do not exist.
- [x] **Step 3: Implement the cookie helper with explicit serialization and environment-derived flags; never expose token values outside `Set-Cookie` headers.
- [x] **Step 4: Add optional `AUTH_COOKIE_SAME_SITE` and `WEB_ALLOWED_ORIGINS` parsing/defaults and document both variables in `.env.example`.
- [x] **Step 5: Re-run the focused tests and commit `feat: thêm primitive cookie cho xác thực`.

### Task 2: Auth service/controller/routes and CSRF/CORS enforcement

**Files:**
- Create: `apps/api/src/auth/auth.cookies.test.ts` additions only if service integration needs shared assertions
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/auth/auth.middleware.ts`
- Modify: `apps/api/src/controllers/auth.controller.ts`
- Modify: `apps/api/src/routes/auth.routes.ts`
- Modify: `apps/api/src/common/security.middleware.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/controllers/auth.controller.test.ts`
- Modify: `apps/api/src/auth/auth.integration.test.ts`
- Create: `apps/api/src/common/security.middleware.test.ts`

**Interfaces:**
- `AuthUser` remains the public in-memory user shape.
- `register` and `login` return `{ user, tokens }` internally, but controllers return `{ user }` after setting cookies.
- `rotateRefreshToken(refreshToken): Promise<{ user: AuthUser; tokens: TokenPair }>` and `revokeRefreshToken(refreshToken): Promise<void>`.
- Routes: `POST /session`, `POST /refresh`, `POST /logout`.

- [x] **Step 1: Add failing controller/integration tests** asserting login/register do not return tokens and set two HttpOnly cookies; session authenticates from access cookie; refresh reads only refresh cookie, rotates it, and rejects replay; logout returns 204 and clears cookies.
- [x] **Step 2: Add failing middleware tests** for cookie-first access authentication, Bearer fallback, valid preflight, and 403 mutation from an unallowed Origin.
- [x] **Step 3: Run the focused backend tests and confirm failures describe the missing cookie contract.
- [x] **Step 4: Implement service revoke/rotation return values, cookie-aware authentication, controller cookie handling, session/logout routes, and the mutation Origin guard.
- [x] **Step 5: Ensure preflight runs before auth, returns credentials plus allowed headers, and never emits wildcard origin with credentials.
- [x] **Step 6: Run `pnpm exec vitest run apps/api/src/auth apps/api/src/controllers/auth.controller.test.ts apps/api/src/common/security.middleware.test.ts` and commit `feat: chuyển auth backend sang cookie`.

### Task 3: Socket.IO cookie authentication

**Files:**
- Modify: `apps/api/src/realtime/socket.ts`
- Modify: `apps/api/src/realtime/socket.test.ts`

- [x] **Step 1: Add a failing test that a Socket.IO handshake containing `nhuu_access_token` authenticates without `handshake.auth.token`, while the old auth-token fallback still works.
- [x] **Step 2: Run the focused socket test and confirm the cookie handshake fails before implementation.
- [x] **Step 3: Read the cookie from `socket.handshake.headers.cookie`, verify it, then fall back to `socket.handshake.auth.token` only when no cookie is present.
- [x] **Step 4: Run `pnpm exec vitest run apps/api/src/realtime/socket.test.ts` and commit `feat: xác thực socket bằng cookie`.

### Task 4: Frontend cookie session state and API transport

**Files:**
- Modify: `apps/web/src/state/auth.store.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/socket.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/lib/api.test.ts`
- Create: `apps/web/src/state/auth.store.test.ts`

**Interfaces:**
- `AuthState = { user: { id: string; email: string; role: AuthRole } }`.
- `loadAuth(): null`, `saveAuth(auth): void` is memory-only compatibility and must not access `localStorage`.
- `apiRequest(..., refresh?: () => Promise<boolean>)` always uses `credentials: "include"`, omits Authorization, and retries once after a 401 when refresh returns true.
- `createChatSocket(baseUrl): Socket` uses `withCredentials: true` and no `auth` token.

- [x] **Step 1: Add failing tests** for no auth localStorage access, credentials on API requests, no Authorization header, cookie refresh retry, and Socket.IO options.
- [x] **Step 2: Run focused frontend tests and confirm they fail against the current token/localStorage behavior.
- [x] **Step 3: Implement memory-only auth state, cookie API transport, and credentialed socket creation.
- [x] **Step 4: Update `App.tsx` to bootstrap session on mount, refresh once on a 401/session failure, render loading while bootstrap is pending, accept `{ user }` after login/register, call cookie logout, and keep existing page props using an empty compatibility token.
- [x] **Step 5: Keep the existing page refresh callback seam type-compatible; it returns only the non-secret `cookie-session` success marker and never a JWT.
- [x] **Step 6: Run `pnpm exec vitest run apps/web/src/App.test.tsx apps/web/src/lib/api.test.ts apps/web/src/state/auth.store.test.ts` and commit `feat: khôi phục phiên frontend bằng cookie`.

### Task 5: Documentation and full verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md` only if setup/auth environment instructions are absent

- [x] **Step 1: Add an Unreleased entry describing HttpOnly cookies, required allowed origins, HTTPS/SameSite production requirements, and temporary Bearer fallback.
- [x] **Step 2: Run the backend auth/realtime tests, full workspace Vitest suite, TypeScript checks/build available in the repo, production frontend build, and `git diff --check`.
- [x] **Step 3: Inspect the final diff and `rg` for `localStorage` auth key, auth JSON token responses, refresh-token request bodies, and Socket.IO `auth: { token }`; fix only in-scope findings.
- [x] **Step 4: Stage only cookie-auth files, create a focused Conventional Commit, push `feature/nhuu-chat-mvp`, and report unrelated dirty files left untouched.

## Self-review

- Cookie flags, session bootstrap, refresh rotation/replay rejection, logout clearing, CORS credentials, Origin protection, Socket.IO cookie auth, frontend memory state, retry behavior, tests, and operational documentation are covered by Tasks 1–5.
- No schema or password-hashing change is required.
- Existing page-level token props remain only as a temporary type-compatible seam; no JWT is placed in them or sent by transport.
