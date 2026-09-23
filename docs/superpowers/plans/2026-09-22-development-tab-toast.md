# Development Tab Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Show a clear Sonner toast when a user clicks a Settings tab that is not implemented yet.

**Architecture:** Keep the existing placeholder-tab guard in `SettingsLayout`. Change only the toast payload so the click does not navigate or change the active tab and explicitly tells the user that the selected feature is still under development.

**Tech Stack:** React, TypeScript, Sonner, Vitest.

**Spec:** User-approved bounded design in the current conversation.

## Global Constraints

- Modify only `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/pages/SettingsPage.test.tsx`, and the required Unreleased entry in `CHANGELOG.md`.
- Placeholder tabs must keep `aria-disabled`, disabled styling, and current active content; clicking them must not navigate.
- Use Sonner and show exactly `${item}: Chức năng đang được phát triển`.
- Preserve all existing behavior for Giới thiệu, Thẻ hội thoại, Trợ lý AI, and Lịch sử.
- Preserve unrelated dirty changes already present in the three files; stage only this task's lines.
- Follow TDD: observe the new toast-message assertion fail before changing production code.

### Task 1: Improve development-tab toast content

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.test.tsx`
- Modify: `CHANGELOG.md`

- [ ] Add a failing regression assertion for the full toast message.
- [ ] Run the focused Settings Page test and capture the expected failure.
- [ ] Change the placeholder click toast payload only.
- [ ] Add a concise Vietnamese Unreleased changelog entry.
- [ ] Run focused tests, build, and `git diff --check`.
- [ ] Commit and push only the scoped change.
