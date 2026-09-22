# About Section Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make each About subsection addressable by its own settings URL and remove the duplicated in-content navigation list on mobile and desktop.

**Architecture:** Keep `/settings` routing owned by `SettingsPage`, and add a stable nested path `/settings/about/<slug>` for About subsections. The mobile topbar emits a dedicated nested-navigation callback; `SettingsPage` owns URL/state synchronization, while `AboutSettings` renders only the selected content.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest.

**Spec:** Approved in chat: nested About URLs, mobile submenu navigation to the selected section, remove the duplicated About navigation block, preserve existing header/content.

## Global Constraints

- UI-only; do not change backend, API, OAuth, authentication, or manual Page ID/access-token behavior.
- Preserve unrelated dirty files and stage only files required by this task.
- Keep Vietnamese interface text and existing responsive patterns.
- Add regression coverage before implementation and update `CHANGELOG.md` under `[Unreleased]`.

### Task 1: Add failing route and mobile-navigation regression tests

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.test.tsx`
- Modify: `apps/web/src/components/dashboard/DashboardTopbar.fixed.test.tsx`

- [ ] Test stable About section slug mapping and parsing.
- [ ] Test the nested mobile menu calls the nested navigation callback with the selected section instead of the parent only.
- [ ] Test the About renderer no longer contains the duplicate internal navigation block.
- [ ] Run focused tests and confirm they fail for the missing behavior.

### Task 2: Implement URL-backed About navigation and remove duplicate menu

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/components/dashboard/DashboardTopbar.tsx`

- [ ] Add stable slug helpers for all seven About sections.
- [ ] Synchronize About section state with browser history and nested URLs.
- [ ] Add the nested callback to the topbar and invoke it with the clicked child section.
- [ ] Remove the `AboutSettings` aside/nav while preserving all section content and responsive layout.
- [ ] Run focused tests, full frontend tests, production build, and `git diff --check`.

### Task 3: Document the user-facing navigation change

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add one concise Vietnamese `[Unreleased]` entry describing nested About navigation and removal of the duplicate menu.
