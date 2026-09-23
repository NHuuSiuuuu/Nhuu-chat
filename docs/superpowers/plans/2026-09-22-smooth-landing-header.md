# Smooth Landing Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the Landing Header's scroll-state changes animate smoothly.

**Architecture:** Add a single Tailwind transition utility bundle to the existing fixed Header. The existing `isScrolled` state remains the source of truth for the background, blur, shadow, and padding variants; no new animation library or scroll logic is needed.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, react-test-renderer.

**Spec:** User-approved bounded design in the current conversation.

## Global Constraints

- Modify only `apps/web/src/components/landing/LandingHeader.tsx` and `apps/web/src/components/landing/LandingPage.test.tsx`.
- Preserve the existing scroll threshold, `isScrolled` listener/cleanup, fixed positioning, logo, navigation, auth controls, mobile menu, and logout behavior.
- Add `transition-all duration-300 ease-in-out` to the Header so background, blur, shadow, and padding interpolate smoothly.
- Follow TDD: observe the new transition-class assertion fail before changing production code.

### Task 1: Add smooth Header transition classes

**Files:**
- Modify: `apps/web/src/components/landing/LandingHeader.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.test.tsx`

- [ ] Add a failing regression assertion requiring the transition bundle.
- [ ] Run the focused Landing Page test and capture the expected failure.
- [ ] Add the transition classes to the Header without changing state behavior.
- [ ] Run focused tests, build, and `git diff --check`.
- [ ] Commit and push only the scoped change.
