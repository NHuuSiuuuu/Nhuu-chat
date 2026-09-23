# Gradient Landing Headline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Apply the CTA's blue-to-cyan gradient to the Landing Page headline text `AI Chatbot tự động`.

**Architecture:** Replace only the existing solid text color utility on the headline span with Tailwind background clipping utilities. Keep the current headline structure, responsive line break, typography, and surrounding copy unchanged.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest.

**Spec:** User-approved design and attached reference image in the current conversation.

## Global Constraints

- Modify only `apps/web/src/components/landing/LandingPage.tsx`, `apps/web/src/components/landing/LandingPage.test.tsx`, and the required Unreleased entry in `CHANGELOG.md`.
- Apply `bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent` to the headline span containing `AI` and `Chatbot tự động`.
- Preserve the existing text, `<br>` responsive behavior, typography, layout, CTA, and motion behavior.
- Follow TDD: observe the new gradient assertion fail before changing production code.

### Task 1: Add gradient styling to the AI headline

**Files:**
- Modify: `apps/web/src/components/landing/LandingPage.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.test.tsx`
- Modify: `CHANGELOG.md`

- [ ] Add a failing regression assertion for the exact gradient text classes.
- [ ] Run the focused Landing Page test and capture the expected failure.
- [ ] Replace the solid blue text class with the approved gradient text utilities.
- [ ] Add a concise Vietnamese Unreleased changelog entry.
- [ ] Run focused tests, build, and `git diff --check`.
- [ ] Commit and push only the scoped change.
