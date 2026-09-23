# Sticky Landing Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Landing Page Header visible at the top of the viewport while the page scrolls.

**Architecture:** Change only the Header positioning utility from absolute document positioning to fixed viewport positioning. Preserve all existing navigation, auth, mobile-menu, branding, spacing, and color behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, react-test-renderer.

**Spec:** User request in the current conversation.

## Global Constraints

- Modify only the Landing Header and its regression test; preserve unrelated dirty files.
- The Header must use `fixed top-0 left-0 z-50` so it remains visible during scroll.
- Preserve `w-full bg-transparent py-5 px-6 md:px-12 flex justify-between items-center`, existing logo, navigation, mobile menu, auth controls, and logout behavior.
- Follow TDD: observe the new fixed-position assertion fail before changing production code.

### Task 1: Make the Landing Header fixed while scrolling

**Files:**
- Modify: `apps/web/src/components/landing/LandingHeader.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.test.tsx`

- [ ] Add a failing regression assertion requiring the Header to use `fixed`.
- [ ] Run the focused Landing Page test and capture the expected failure.
- [ ] Replace `absolute` with `fixed` in the Header class.
- [ ] Run focused tests, build, and `git diff --check`.
- [ ] Commit and push only the scoped change.
