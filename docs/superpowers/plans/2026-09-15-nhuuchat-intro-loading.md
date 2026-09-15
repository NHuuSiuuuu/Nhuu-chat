# NHuuChat Intro Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a short NHuuChat Netflix-style intro that appears on each full app load, waits for real JavaScript/font readiness, then reveals the existing app without changing authentication or routing behavior.

**Architecture:** Keep the existing Vite SPA and eager route imports. `App` owns a boolean `showIntro` initialized to `true`, starts a guarded preload promise for `document.fonts.ready`, and renders `NetflixIntro` until both the minimum intro duration and preload settle. The existing authenticated/unauthenticated tree is wrapped in `Suspense` with a local static skeleton; no storage, API endpoint, router, dependency, or artificial delay is added.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Tailwind CSS v4, Vitest, CSS keyframes.

**Spec:** `docs/superpowers/specs/2026-09-15-nhuuchat-intro-design.md`

## Global Constraints

- Intro appears on every full page load and does not use `sessionStorage`, `localStorage`, or cookies.
- Internal route changes stay in the same `App` instance and must not replay the intro.
- Intro completion waits for a minimum duration of approximately 1.2 seconds and for real preload completion or safe failure.
- Do not call the nonexistent `/api/config` endpoint or add a backend/API change.
- Preserve `loadAuth`, `ProtectedRoute`, `pageFromPath`, token refresh, and existing page data loading.
- All user-facing UI text remains Vietnamese except the required brand text `NHuuChat`.
- All code comments added to the repository are Vietnamese and explain only non-obvious behavior.
- Update `CHANGELOG.md` under `## [Unreleased]`.

## File Map

- Create `apps/web/src/components/NetflixIntro.tsx`: typed intro component and lifecycle timer.
- Create `apps/web/src/components/NetflixIntro.css`: pure CSS animation and reduced-motion rules.
- Modify `apps/web/src/App.tsx`: intro state, preload coordination, Suspense fallback, and unchanged app tree.
- Modify `apps/web/src/App.test.tsx`: App integration and preload assertions.
- Create `apps/web/src/components/NetflixIntro.test.tsx`: component source/behavior regression tests.
- Modify `apps/web/src/styles/tailwind.css` only if the fallback skeleton needs a shared shimmer keyframe; prefer colocated CSS in `App.tsx` or the intro stylesheet if existing utilities are sufficient.
- Modify `CHANGELOG.md`: user-facing entry for the intro/loading behavior.

### Task 1: Add the Netflix intro component

**Files:**
- Create: `apps/web/src/components/NetflixIntro.tsx`
- Create: `apps/web/src/components/NetflixIntro.css`
- Create: `apps/web/src/components/NetflixIntro.test.tsx`

**Interfaces:**
- Produces `NetflixIntro({ onComplete, duration = 1200, ready = true }: { onComplete: () => void; duration?: number; ready?: boolean })`.
- Renders an accessible full-screen overlay with five bars, `NHuuChat`, and `aria-label="Đang khởi động NHuuChat"`.

- [ ] **Step 1: Write the failing tests**

  Add tests that assert the component source imports its CSS, renders exactly five bar elements with stable class/data markers, includes `NHuuChat`, uses the required easing/stagger values, and cleans up completion timers. Add behavior tests with fake timers proving `onComplete` waits for both the minimum duration and `ready`, runs once after the 0.6-second exit transition, and is not called after unmount.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npx vitest run apps/web/src/components/NetflixIntro.test.tsx`

  Expected: FAIL because the component and stylesheet do not exist yet.

- [ ] **Step 3: Implement the minimal component and CSS**

  In the component, render the overlay and bars from `[0, 1, 2, 3, 4]`, set each bar's CSS custom property with `React.CSSProperties`, track the minimum-duration and exit timers, and clear both in effect cleanup. Keep the overlay mounted while `ready` is false; once duration and `ready` are complete, apply the exit class, wait 600ms, then invoke the callback once. Use CSS keyframes for bar rise, glow pulse, brand reveal, and overlay exit. Use `motion-reduce`/`prefers-reduced-motion` to reduce motion without skipping lifecycle completion.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `npx vitest run apps/web/src/components/NetflixIntro.test.tsx`

  Expected: PASS with all intro tests green.

### Task 2: Coordinate preload and App rendering

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- `App` keeps the existing public props-free API.
- Add a local typed preload helper, e.g. `preloadIntroDependencies(): Promise<void>`, which resolves `document.fonts.ready` when available and otherwise resolves immediately.
- Pass `ready={introReady}` to `NetflixIntro`; `introReady` becomes true only after preload resolves or rejects safely.
- Add a `PageSkeleton` fallback component with Vietnamese accessible status text.

- [ ] **Step 1: Write the failing tests**

  Add assertions that `App.tsx` owns `showIntro` initialized to `true`, renders `NetflixIntro` with `ready={introReady}`, waits on `Promise.all`/preload before allowing completion, wraps the real app in `Suspense`, and contains a non-white skeleton fallback. Assert there are no storage calls or `/api/config` references. Add a unit test for the preload helper with supported and unsupported `document.fonts` shapes if the test environment permits.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `npx vitest run apps/web/src/App.test.tsx`

  Expected: FAIL because App has no intro state, preload, or Suspense integration.

- [ ] **Step 3: Implement minimal App integration**

  Add `showIntro` and `introReady` state. Start preload in an effect only when the intro is shown; catch preload failures so `introReady` always becomes true. Pass `ready={introReady}` to `NetflixIntro`, which owns the minimum-duration and fade-out lifecycle and sets `showIntro(false)` through `onComplete`. Keep auth state initialization synchronous and leave the existing page selection tree intact beneath `<Suspense fallback={<PageSkeleton />}>`. Do not add a fake API request or delay beyond the intro's minimum visual duration.

- [ ] **Step 4: Run focused tests and existing App tests**

  Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/components/NetflixIntro.test.tsx`

  Expected: PASS with the new integration and existing navigation assertions green.

### Task 3: Document and verify the user flow

**Files:**
- Modify: `CHANGELOG.md`
- Test/verify: `apps/web/src/App.test.tsx`, `apps/web/src/components/NetflixIntro.test.tsx`

- [ ] **Step 1: Add the Unreleased changelog entry**

  Record that the app now shows the short NHuuChat intro on full reload and waits for real font/preload readiness before revealing the app. Record that authentication and routing behavior remain unchanged.

- [ ] **Step 2: Run the frontend test suite and production build**

  Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/components/NetflixIntro.test.tsx`

  Run: `npm run build --prefix apps/web`

  Expected: both commands exit 0; no new failures or TypeScript/Vite errors.

- [ ] **Step 3: Run final diff verification**

  Run: `git diff --check`

  Expected: no whitespace errors. Review the diff to confirm no storage, backend, dependency, auth, or routing changes were introduced.

- [ ] **Step 4: Manually validate the supported states**

  Check desktop and mobile, first load, hard reload, new tab, internal route navigation, logged-out auth screen, logged-in dashboard/inbox, and a slow/unavailable preload. Confirm the intro does not hang indefinitely and existing loading/empty/error states still appear after it completes.

## Self-Review Checklist

- Spec coverage: Tasks 1–2 cover animation, responsive CSS, cleanup, preload, Suspense, auth/routing preservation, and reduced motion; Task 3 covers changelog and validation.
- Placeholder scan: no TODO/TBD or unspecified implementation steps.
- Type consistency: `NetflixIntro` props and `preloadIntroDependencies` signatures are explicit and consumed only by `App`/tests.
- Scope: no `useIntroOnce.ts` is created because the approved design explicitly removes storage behavior.
