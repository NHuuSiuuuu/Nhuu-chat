# Tailwind CSS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all frontend styling in `apps/web` from handwritten CSS files to Tailwind CSS utilities while preserving the current UI and behavior.

**Architecture:** Tailwind CSS v4 is compiled by the official Vite plugin. React components own their visual classes through `className`; one `src/styles/tailwind.css` entry imports Tailwind and replaces the old global stylesheet. No shadcn layer, CSS modules, legacy `@apply`, or API/state changes are introduced.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, `@tailwindcss/vite`, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-09-tailwind-css-migration-design.md`

## Global Constraints

- Scope is `apps/web`; do not change backend behavior or API contracts.
- Keep the existing Dashboard, Telegram QR/2FA modal, Inbox, realtime socket flow, and responsive behavior.
- Keep the existing SVG logos/icons and all user-facing Vietnamese copy.
- Use Tailwind CSS v4 with `@tailwindcss/vite` and `@import "tailwindcss"`.
- Keep exactly one source CSS entry: `apps/web/src/styles/tailwind.css`.
- Do not leave imports or references to the six deleted CSS files.
- Update `CHANGELOG.md` in Vietnamese under the unreleased section.
- Run focused frontend tests, web build from `apps/web`, and `git diff --check` after each migration group.

### Task 1: Install and wire Tailwind

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/src/styles/tailwind.css`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/styles/tailwind-entry.test.ts`

**Interfaces:**
- Produces a Vite build plugin and a global Tailwind entry consumed by every React page.

- [ ] **Step 1: Write the failing entry test**

Create a test that reads the source entry and Vite config, asserting the entry contains `@import "tailwindcss"` and the Vite config imports/calls `tailwindcss()`.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tailwind entry", () => {
  it("uses the Vite plugin and Tailwind import", () => {
    const entry = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
    const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

    expect(entry).toContain('@import "tailwindcss"');
    expect(viteConfig).toContain('from "@tailwindcss/vite"');
    expect(viteConfig).toContain("tailwindcss()");
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run `pnpm exec vitest run apps/web/src/styles/tailwind-entry.test.ts`.

Expected result: FAIL because `tailwind.css` and the plugin configuration do not exist yet.

- [ ] **Step 3: Install and configure Tailwind**

Run `pnpm --filter web add -D tailwindcss @tailwindcss/vite`.

Add the plugin to `apps/web/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: { /* preserve the existing proxy configuration */ }
});
```

Create `apps/web/src/styles/tailwind.css` containing only:

```css
@import "tailwindcss";
```

Change `apps/web/src/main.tsx` to import `./styles/tailwind.css` instead of `./styles/global.css`.

- [ ] **Step 4: Run the test and verify it passes**

Run `pnpm exec vitest run apps/web/src/styles/tailwind-entry.test.ts`.

Expected result: PASS.

- [ ] **Step 5: Commit the tooling change**

Run `git add apps/web/package.json apps/web/src/styles/tailwind.css apps/web/src/styles/tailwind-entry.test.ts apps/web/src/main.tsx apps/web/vite.config.ts pnpm-lock.yaml && git commit -m "build: configure Tailwind for web"`.

### Task 2: Migrate global styles and Dashboard

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/components/dashboard/DashboardTopbar.tsx`
- Modify: `apps/web/src/components/dashboard/PlatformIcon.tsx`
- Modify: `apps/web/src/styles/tailwind.css`
- Delete after verification: `apps/web/src/styles/global.css`, `apps/web/src/pages/DashboardHeader.css`, `apps/web/src/pages/DashboardPage.css`
- Test: create `apps/web/src/pages/dashboard-tailwind.test.ts` and run existing `apps/web/src/components/dashboard/DashboardTopbar.test.tsx` and `apps/web/src/state/dashboard-ui.test.ts`

**Interfaces:**
- Consumes Tailwind utilities from Task 1.
- Preserves `DashboardTopbar()` output, dashboard filters, account click handler, modal opening, and status loading flow.

- [ ] **Step 1: Write the failing Dashboard migration test**

Create a source-level test that fails while Dashboard still imports handwritten styles:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dashboard Tailwind migration", () => {
  it("does not import handwritten Dashboard styles", () => {
    const page = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
    const topbar = readFileSync(new URL("../components/dashboard/DashboardTopbar.tsx", import.meta.url), "utf8");

    expect(page).not.toMatch(/Dashboard(Page|Header)\\.css/);
    expect(topbar).not.toMatch(/DashboardHeader\\.css/);
    expect(page).toContain("min-h-screen");
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run `pnpm exec vitest run apps/web/src/pages/dashboard-tailwind.test.ts`.

Expected result: FAIL because the current Dashboard still imports handwritten CSS and does not yet contain the Tailwind utility contract.

- [ ] **Step 3: Record the Dashboard regression baseline**

Run `pnpm exec vitest run apps/web/src/components/dashboard/DashboardTopbar.test.tsx apps/web/src/state/dashboard-ui.test.ts` and `cd apps/web && pnpm exec vite build`.

Record the passing test count and successful build output before converting markup.

- [ ] **Step 2: Convert global and Dashboard class usages**

Replace semantic Dashboard classes with Tailwind utilities, including:

```tsx
<main className="min-h-screen bg-[#f2f5f9] text-[#273348]">
<header className="flex min-h-16 items-center bg-blue-600 px-7 text-white">
<div className="mx-auto w-full max-w-[954px]">
```

Preserve mobile behavior with `max-[700px]:` utilities, focus-visible outlines, button disabled states, brand colors, account card dimensions, and icon box sizes. Move body margin/font/background behavior into the Tailwind entry using the supported theme/base mechanism without adding a second stylesheet.

- [ ] **Step 3: Run focused Dashboard tests and build**

Run the two focused Vitest files from Step 1 and `cd apps/web && pnpm exec vite build`.

Expected result: existing behavior tests pass and the web build succeeds.

- [ ] **Step 4: Remove verified Dashboard CSS files and references**

Run `rg -n "DashboardHeader\.css|DashboardPage\.css|global\.css|dashboard-[a-z-]+" apps/web/src` and remove only references that belonged to the deleted CSS selectors. Delete the three CSS files after confirming no imports remain.

- [ ] **Step 5: Commit the Dashboard migration**

Run `git add apps/web/src/App.tsx apps/web/src/pages/DashboardPage.tsx apps/web/src/components/dashboard/DashboardTopbar.tsx apps/web/src/components/dashboard/PlatformIcon.tsx apps/web/src/styles/tailwind.css apps/web/src/components/dashboard/DashboardTopbar.test.tsx apps/web/src/state/dashboard-ui.test.ts apps/web/src/pages/DashboardHeader.css apps/web/src/pages/DashboardPage.css apps/web/src/styles/global.css && git commit -m "refactor: migrate Dashboard styles to Tailwind"`.

### Task 3: Migrate Telegram connection modal

**Files:**
- Modify: `apps/web/src/components/dashboard/ConnectModal.tsx`
- Delete after verification: `apps/web/src/components/dashboard/ConnectModal.css`, `apps/web/src/components/dashboard/ConnectModalV2.css`
- Test: create `apps/web/src/components/dashboard/ConnectModal.test.tsx` and run existing dashboard state tests

**Interfaces:**
- Consumes the unchanged QR login API, 2FA submission, close animation state, error state, and provider selection state.
- Produces the same modal DOM semantics and responsive two-column/single-column layout through utilities.

- [ ] **Step 1: Add the focused modal migration test**

Add a source-level test that asserts the modal no longer imports either handwritten stylesheet and contains Tailwind utilities while retaining dialog semantics. Do not mock or assert implementation-only CSS class names.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ConnectModal Tailwind migration", () => {
  it("removes handwritten modal stylesheet imports", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/ConnectModal(V2)?\\.css/);
    expect(source).toContain('role="dialog"');
    expect(source).toContain("grid");
  });
});
```

- [ ] **Step 2: Run the test to establish RED for the new contract**

Run `pnpm exec vitest run apps/web/src/components/dashboard/ConnectModal.test.tsx` and correct only test setup errors until the intended stylesheet-import assertion fails.

- [ ] **Step 3: Convert modal layout and states to utilities**

Replace classes from both modal CSS files with utilities for backdrop, dialog sizing, provider list, selected/hover states, platform icon boxes, QR frame, instructions, password form, error/success states, animation, reduced motion, and mobile layout. Preserve `role="dialog"`, `aria-modal`, existing labels, event handlers, and all API calls.

- [ ] **Step 4: Run modal tests and web build**

Run the focused modal/dashboard tests and `cd apps/web && pnpm exec vite build`.

Expected result: PASS and successful build.

- [ ] **Step 5: Delete old modal CSS and commit**

Run `rg -n "ConnectModal\.css|ConnectModalV2\.css" apps/web/src` and confirm no references remain. Delete both files, run `git diff --check`, then commit with `git commit -m "refactor: migrate connection modal styles to Tailwind"`.

### Task 4: Migrate Inbox and conversation components

**Files:**
- Modify: `apps/web/src/pages/InboxPage.tsx`
- Modify: `apps/web/src/components/conversations/ConversationList.tsx`
- Modify: `apps/web/src/components/conversations/ChatWindow.tsx`
- Modify: `apps/web/src/components/conversations/MessageComposer.tsx`
- Modify: `apps/web/src/components/conversations/InboxIcon.tsx` if icon sizing needs explicit utilities
- Delete after verification: `apps/web/src/pages/InboxPage.css`
- Test: create `apps/web/src/pages/InboxPage.test.tsx`, plus `apps/web/src/state/inbox-ui.test.ts` and `apps/web/src/state/inbox-realtime.test.ts`

**Interfaces:**
- Preserves `ConversationList` props, `ChatWindow` props, `MessageComposer` submit behavior, Socket.IO events, API requests, selected/unread state, and DashboardTopbar placement.

- [ ] **Step 1: Add structural Inbox regression coverage**

Add a source-level test that fails while `InboxPage.tsx` imports `InboxPage.css`, then verifies the shared topbar, `inbox-shell`, navigation label, conversation list label, and chat window label. Keep API/socket effects out of the assertion; existing state tests cover realtime behavior.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Inbox Tailwind migration", () => {
  it("uses the shared shell without handwritten Inbox CSS", () => {
    const source = readFileSync(new URL("./InboxPage.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/InboxPage\\.css/);
    expect(source).toContain("DashboardTopbar");
    expect(source).toContain('className="inbox-shell"');
    expect(source).toContain('aria-label="Thanh điều hướng"');
  });
});
```

- [ ] **Step 2: Run the structural test and verify the intended failure**

Run `pnpm exec vitest run apps/web/src/pages/InboxPage.test.tsx`. Expected result: FAIL because the current Inbox still imports `InboxPage.css`.

- [ ] **Step 3: Convert Inbox utilities**

Replace all selectors from `InboxPage.css` with utilities. Preserve three-column desktop sizing (`44px 395px minmax(0, 1fr)`), shell/header height behavior, independent overflow areas, mobile breakpoint hiding the chat pane, composer focus/send states, and selected/unread conversation visuals.

- [ ] **Step 4: Run all focused Inbox tests and build**

Run `pnpm exec vitest run apps/web/src/pages/InboxPage.test.tsx apps/web/src/state/inbox-ui.test.ts apps/web/src/state/inbox-realtime.test.ts` and `cd apps/web && pnpm exec vite build`.

Expected result: PASS and successful build.

- [ ] **Step 5: Delete Inbox CSS and commit**

Confirm `rg -n "InboxPage\.css|inbox-(page|nav|shell)|conversation-|chat-|message-composer" apps/web/src` contains only Tailwind class strings and no stylesheet imports. Delete `apps/web/src/pages/InboxPage.css`, run `git diff --check`, and commit with `git commit -m "refactor: migrate Inbox styles to Tailwind"`.

### Task 5: Final source cleanup, documentation, and verification

**Files:**
- Modify: `apps/web/src/main.tsx` if any old import remains
- Modify: `CHANGELOG.md`
- Modify: `README.md` and the relevant `docs/wiki/` page only if they describe CSS setup
- Delete: any remaining old CSS file under `apps/web/src`

**Interfaces:**
- Produces the final CSS inventory and documented Tailwind setup.

- [ ] **Step 1: Prove CSS inventory and imports are clean**

Run:

```bash
rg --files apps/web/src | rg '\.css$'
rg -n '\.(css|scss|sass)"|\.css\x27' apps/web/src || true
```

Expected result: only `apps/web/src/styles/tailwind.css` is listed and no deleted stylesheet is imported.

- [ ] **Step 2: Update changelog and any styling documentation**

Add a Vietnamese unreleased entry stating that the frontend was migrated to Tailwind CSS v4, old CSS files were removed, and the source retains one Tailwind entry. Do not claim production deployment or visual parity beyond the checks actually run.

- [ ] **Step 3: Run final verification**

Run the focused frontend tests, then `pnpm exec vitest run`, `cd apps/web && pnpm exec vite build`, and `git diff --check`.

Report the known MongoDB/OpenSSL and environment-key failures separately if they recur; do not alter backend tests to hide them.

- [ ] **Step 4: Review the complete diff**

Run `git status --short`, `git diff --stat`, and `git diff -- apps/web CHANGELOG.md README.md docs/wiki`. Confirm unrelated dirty files from earlier work remain untouched and no secrets or generated `dist` files are added.

- [ ] **Step 5: Commit final cleanup**

Run `git add apps/web CHANGELOG.md README.md docs/wiki && git commit -m "refactor: complete frontend Tailwind migration"` only after the final verification output confirms the stated checks.
