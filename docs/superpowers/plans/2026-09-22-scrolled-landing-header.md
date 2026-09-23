# Scrolled Landing Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the fixed Landing Page Header visually distinct after the user scrolls so page content does not show through it.

**Architecture:** Track whether `window.scrollY` exceeds 10px in `LandingHeader`, update the state from a scroll listener, and switch only the Header's background, blur, shadow, and vertical padding classes. Preserve all existing branding, navigation, auth, mobile-menu, and logout behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, react-test-renderer.

**Spec:** User-approved design in the current conversation.

## Global Constraints

- Modify only `apps/web/src/components/landing/LandingHeader.tsx` and `apps/web/src/components/landing/LandingPage.test.tsx`.
- Keep `fixed top-0 left-0 z-50`, `w-full`, horizontal padding, flex layout, logo, navigation, auth controls, mobile menu, and logout unchanged.
- At the top (`scrollY <= 10`), use `bg-transparent py-5`.
- After scrolling (`scrollY > 10`), use `bg-white/95 backdrop-blur-md shadow-md py-3`.
- Follow TDD: observe the new scroll-state assertion fail before changing production code.

### Task 1: Add scroll-aware Landing Header styling

**Files:**
- Modify: `apps/web/src/components/landing/LandingHeader.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.test.tsx`

- [ ] Add failing regression assertions for top and scrolled Header classes.
- [ ] Run the focused Landing Page test and capture the expected failure.
- [ ] Add `isScrolled` state and a `window` scroll listener with cleanup; initialize from current `window.scrollY`.
- [ ] Apply the top/scrolled class variants while preserving the fixed positioning and existing controls.
- [ ] Run focused tests, build, and `git diff --check`.
- [ ] Commit and push only the scoped change.
