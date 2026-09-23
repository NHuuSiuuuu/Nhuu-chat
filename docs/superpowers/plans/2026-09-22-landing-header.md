# Landing Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Landing Page header to use the requested transparent three-part layout and connect authenticated-user logout through a new `onLogout` prop.

**Architecture:** Keep the existing Landing Page as the owner of mobile-menu state and landing anchors, while extracting the visual header into a focused `LandingHeader` component. The app supplies its existing logout callback; unauthenticated login/register behavior and the existing logo remain unchanged.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, react-test-renderer.

**Spec:** User request in the current conversation.

## Global Constraints

- Preserve the existing `/nhuu-logo-landing.svg` logo asset and all unrelated dirty files.
- Use the requested header layout: `w-full absolute top-0 left-0 z-50 bg-transparent py-5 px-6 md:px-12 flex justify-between items-center`.
- Desktop navigation contains exactly `Sản phẩm`, `Tích hợp`, `Bảng giá`, and `Tài nguyên`, with `hidden md:flex`, `text-sm font-medium`, `text-slate-600`, `hover:text-slate-900`, and `gap-8` styling.
- Authenticated state shows a circular avatar, user email, and `Đăng xuất` action with `onLogout`; unauthenticated state keeps the existing login/register callbacks.
- Mobile navigation remains accessible and hidden on desktop; no header underline border is introduced.
- Follow TDD: add and observe a failing focused test before production implementation.

### Task 1: Implement and integrate the Landing Header

**Files:**
- Create: `apps/web/src/components/landing/LandingHeader.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.test.tsx`

**Interfaces:**
- `LandingPageProps` gains `onLogout: () => void`.
- `LandingHeader` consumes `user`, `landingLinks`, `mobileMenuOpen`, `onMobileMenuToggle`, `onDashboard`, `onLogin`, `onRegister`, `onLogout`, and `onMobileLinkClick`.

- [ ] Write focused failing tests for authenticated logout, requested navigation labels/classes, and the `onLogout` callback.
- [ ] Run the focused Landing Page test and verify it fails because the new behavior is absent.
- [ ] Implement the minimal `LandingHeader` component and wire it into `LandingPage`.
- [ ] Pass the existing app logout callback from `App.tsx` to `LandingPage`.
- [ ] Run the focused tests, then the web build and `git diff --check`.
- [ ] Commit only the Header implementation and its focused test changes.
