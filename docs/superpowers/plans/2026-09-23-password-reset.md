# Quên và đặt lại mật khẩu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện luồng quên mật khẩu bằng email SMTP/Nodemailer, token một lần và màn hình đặt lại mật khẩu.

**Architecture:** API auth tạo và xác thực token ngẫu nhiên lưu dưới dạng SHA-256 digest trong collection riêng, gửi email bằng Nodemailer qua SMTP, rồi cập nhật hash mật khẩu và thu hồi refresh token. Frontend nối form quên mật khẩu hiện tại và thêm route đặt lại mật khẩu; cấu hình và hướng dẫn vận hành được cập nhật cùng tính năng.

**Tech Stack:** Node.js, Express 5, TypeScript, Mongoose/MongoDB, Zod, Vitest, React, Vite, Nodemailer/SMTP.

**Spec:** `docs/superpowers/specs/2026-09-23-password-reset-design.md`

## Global Constraints

- Token đặt lại mật khẩu hết hạn sau 30 phút, chỉ dùng một lần và chỉ digest được lưu.
- Gửi yêu cầu luôn trả cùng mã trạng thái và thông báo chung cho email tồn tại/không tồn tại.
- Dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` và `WEB_APP_URL`; chấp nhận thêm bí danh `SMTP_PASSWORD`, `SMTP_USER` cũng là địa chỉ gửi.
- Khi thành công, cập nhật `passwordHash`, xóa `refreshTokenHash` và yêu cầu đăng nhập lại.
- Không ghi raw token, liên kết có token hoặc API key vào log.
- Không sửa file môi trường có secret; giữ nguyên thay đổi ngoài phạm vi đang có trong checkout.

---

## File Structure

- `apps/api/src/models/password-reset-token.model.ts`: schema, unique indexes và TTL index cho token reset.
- `apps/api/src/services/password-reset-email.service.ts`: gửi email qua Nodemailer/SMTP.
- `apps/api/src/services/password-reset.service.ts`: yêu cầu reset, xác thực token, đặt lại mật khẩu và thu hồi refresh token.
- `apps/api/src/schemas/auth.schemas.ts`, `apps/api/src/controllers/auth.controller.ts`, `apps/api/src/routes/auth.routes.ts`: request validation và API endpoints.
- `apps/api/src/auth/password-reset.integration.test.ts` cùng service tests: kiểm tra route, dữ liệu Mongo và hành vi bảo mật.
- `apps/web/src/components/auth/AuthPage.tsx` và tests: nối form yêu cầu reset hiện tại.
- `apps/web/src/App.tsx`, `apps/web/src/components/auth/auth-route.ts`, `apps/web/src/components/auth/ResetPasswordPage.tsx` và tests: route và form đặt mật khẩu mới.
- `.env.example`, `README.md`, `docs/wiki/README.md`, `CHANGELOG.md`: cấu hình và hướng dẫn vận hành.

## Task 1: Token store và gửi email SMTP bằng Nodemailer

**Files:**
- Create: `apps/api/src/models/password-reset-token.model.ts`
- Create: `apps/api/src/services/password-reset-email.service.ts`
- Create: `apps/api/src/services/password-reset-email.service.test.ts`
- Test: `apps/api/src/models/password-reset-token.model.test.ts`

**Interfaces:**
- Produce `PasswordResetTokenModel` với trường `userId`, `tokenHash`, `expiresAt`, `createdAt`.
- Produce `sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>`; hàm ném lỗi nếu thiếu cấu hình hoặc SMTP gửi lỗi.

- [x] **Step 1: Viết test model cho indexes** — kiểm tra unique index của `userId`/`tokenHash` và TTL index trên `expiresAt`.
- [x] **Step 2: Chạy test model để xác nhận thất bại vì model chưa có.**

Run: `pnpm --filter api exec vitest run src/models/password-reset-token.model.test.ts`
Expected: FAIL do module/model chưa tồn tại.

- [x] **Step 3: Thêm model tối thiểu** với đúng schema và indexes ở trên.
- [x] **Step 4: Viết test SMTP** cho gửi thành công, thiếu cấu hình và lỗi gửi; mock Nodemailer và xác nhận cấu hình transport cùng nội dung email.
- [x] **Step 5: Chạy test để xác nhận thất bại đúng do service chưa có.**

Run: `pnpm --filter api exec vitest run src/services/password-reset-email.service.test.ts`
Expected: FAIL do module/service chưa tồn tại.

- [x] **Step 6: Cài đặt `sendPasswordResetEmail`** bằng Nodemailer SMTP, không ghi thông tin đăng nhập hoặc lỗi provider ra log.
- [x] **Step 7: Chạy hai test focused.**

Run: `pnpm --filter api exec vitest run src/models/password-reset-token.model.test.ts src/services/password-reset-email.service.test.ts`
Expected: PASS.

## Task 2: API yêu cầu reset, đặt mật khẩu và rate limit

**Files:**
- Modify: `apps/api/src/schemas/auth.schemas.ts`
- Modify: `apps/api/src/services/auth.service.ts`
- Create: `apps/api/src/services/password-reset.service.ts`
- Create: `apps/api/src/services/password-reset.service.test.ts`
- Modify: `apps/api/src/controllers/auth.controller.ts`
- Modify: `apps/api/src/routes/auth.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/common/security.middleware.ts`
- Test: `apps/api/src/common/security.middleware.test.ts`
- Test: `apps/api/src/auth/password-reset.integration.test.ts`

**Interfaces:**
- Produce `requestPasswordReset(email: string): Promise<void>`; unknown user completes normally without sending mail.
- Produce `resetPassword(token: string, password: string): Promise<void>`; invalid/expired/consumed token raises the same public `AppError`.
- Routes: `POST /api/v1/auth/forgot-password` with `{email}`, `POST /api/v1/auth/reset-password` with `{token,password}`.

- [x] **Step 1: Viết service tests** cho email không tồn tại, token mới thay token cũ, token lưu hash chứ không lưu raw, token hết hạn/dùng lại, đặt lại thành công và refresh hash bị xóa.
- [x] **Step 2: Chạy tests và xác nhận lỗi vì các service chưa có.**

Run: `pnpm --filter api exec vitest run src/services/password-reset.service.test.ts`
Expected: FAIL do module/service chưa tồn tại.

- [x] **Step 3: Cài đặt service tối thiểu** — tạo 32-byte random token, SHA-256 digest, hết hạn 30 phút; thay token cũ trước khi gửi mail; kiểm tra hạn trong truy vấn; tiêu thụ token bằng thao tác atomic; hash mật khẩu qua `hashPassword`; cập nhật user và xóa refresh hash.
- [x] **Step 4: Chạy service tests và sửa đến khi đạt PASS.**
- [x] **Step 5: Viết integration tests** chứng minh cả endpoint forgot trả cùng status/body cho email có và không có tài khoản, reset token hợp lệ đổi được password, và lỗi token trả response chung.
- [x] **Step 6: Chạy integration tests xác nhận lỗi vì routes/controller/schema chưa có.**
- [x] **Step 7: Thêm Zod schemas, controller và routes**; thêm `keyPrefix` cho `rateLimit` để rate limit 5 yêu cầu/15 phút riêng của `forgot-password` không dùng chung bucket với giới hạn auth 60 yêu cầu/phút; cấu hình Express tin cậy một reverse proxy để nhận IP client; reset endpoint tiếp tục dùng giới hạn auth chung.
- [x] **Step 8: Chạy service và route tests focused.**

Run: `pnpm --filter api exec vitest run src/services/password-reset.service.test.ts src/auth/password-reset.integration.test.ts`
Expected: PASS.

## Task 3: Nối frontend và thêm route reset

**Files:**
- Modify: `apps/web/src/components/auth/AuthPage.tsx`
- Modify: `apps/web/src/components/auth/AuthPage.test.tsx`
- Modify: `apps/web/src/components/auth/auth-route.ts`
- Modify: `apps/web/src/components/auth/auth-route.test.ts`
- Create: `apps/web/src/components/auth/ResetPasswordPage.tsx`
- Create: `apps/web/src/components/auth/ResetPasswordPage.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.routes.test.ts`

**Interfaces:**
- `AuthRoute` thêm `reset-password`.
- `ResetPasswordPage` đọc `token` từ query string, submit `{token,password}` tới API reset, không nhận mật khẩu rỗng hoặc password confirmation không khớp, và điều hướng `/login` sau thành công.

- [x] **Step 1: Thêm test AuthPage** xác nhận submit email gọi `POST /api/v1/auth/forgot-password` và hiển thị cùng thông báo xác nhận chung khi API trả thành công.
- [x] **Step 2: Chạy test để thấy thất bại vì form chưa gọi API.**
- [x] **Step 3: Nối submit form** với API client/fetch hiện có, disable trạng thái gửi và hiển thị lỗi chung khi request lỗi.
- [x] **Step 4: Thêm test route** cho `/reset-password` và test component cho confirm mismatch, token thiếu, submit thành công, token lỗi/hết hạn.
- [x] **Step 5: Chạy tests để xác nhận thất bại vì route/component chưa có.**
- [x] **Step 6: Thêm `ResetPasswordPage`** dùng cùng field/button/style auth hiện tại; submit token/password, báo lỗi chung, và khi thành công xóa token bằng `history.replaceState`, hiển thị xác nhận rồi chuyển tới login.
- [x] **Step 7: Thêm route, document title và route guards phù hợp** trong `App.tsx` và `auth-route.ts`; người đã đăng nhập vẫn mở được link reset.
- [x] **Step 8: Sau khi reset thành công, API xóa cả auth cookies và frontend xóa auth state** để người dùng phải đăng nhập lại.
- [x] **Step 9: Chạy toàn bộ auth component/route tests frontend.**

Run: `pnpm --filter web exec vitest run --root src components/auth App.routes.test.ts`
Expected: PASS.

## Task 4: Cấu hình, hướng dẫn, changelog và kiểm chứng

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Ghi các biến SMTP** vào `.env.example` bằng giá trị mẫu không phải secret; dùng `SMTP_USER` làm địa chỉ người gửi và giữ `WEB_APP_URL` làm origin frontend.
- [x] **Step 2: Cập nhật README/Wiki** phần setup SMTP, hai API route, 30 phút hết hạn và đăng nhập lại sau reset.
- [x] **Step 3: Thêm mục phù hợp vào `## [Unreleased]` trong CHANGELOG.**
- [x] **Step 4: Chạy API full suite, web full suite, production build và kiểm tra TypeScript bằng các lệnh hiện có.** Repo hiện không khai báo lint/format scripts; không thêm tooling ngoài phạm vi.

Run: `pnpm --filter api exec vitest run && pnpm --filter web exec vitest run --root src && pnpm --filter web build && pnpm exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --jsx react-jsx --esModuleInterop --skipLibCheck apps/api/src/server.ts apps/web/src/main.tsx`
Expected: Ghi chính xác pass/skip/fail từng suite; phân biệt lỗi có trước với lỗi thuộc feature. Build PASS; mọi TypeScript issue nền được ghi riêng. Chạy từ package API/web để tránh root Vitest quét các worktree lân cận.
- [x] **Step 5: Chạy `git diff --check`, rà soát toàn bộ diff và ghi nhận lỗi nền ngoài phạm vi.**
- [ ] **Step 6: Stage riêng file thuộc tính năng, commit Conventional Commit tiếng Việt; không stage các thay đổi tồn tại trước đó.**
- [ ] **Step 7: Sau commit local và kiểm chứng, push branch tính năng theo hướng dẫn repo; không merge.**

## Self-review

- Bao phủ mọi tiêu chí spec: privacy/response parity, token hashing/expiry/atomic use, refresh revocation, SMTP failure/configuration, rate limit, UI states, docs và verification.
- Dùng Nodemailer để gửi qua SMTP; cần cấu hình SMTP của nhà cung cấp email.
- Schema token là collection riêng như spec, không chỉnh schema User.
- Giữ response không tiết lộ sự tồn tại tài khoản; SMTP lỗi vẫn trả `202` chung và ghi log mã lỗi không nhạy cảm.
- Rate limiter quên mật khẩu dùng bucket riêng (`keyPrefix`) để không đổi hành vi của giới hạn hiện có cho các endpoint auth khác.

## Verification results (2026-09-23)

- Focused API sau khi chuyển sang Nodemailer: 18/18 pass across token model, SMTP mailer, reset service, integration routes, and rate limiter.
- Focused frontend auth/reset routes: 22/22 pass.
- Frontend production build: pass; existing large-chunk and dependency `use client` warnings remain.
- `git diff --check`: pass.
- Full API suite after the provider switch: 760 passed, 73 skipped, 3 failed assertions in unrelated existing tests; six Mongo-backed suites could not start because `libcrypto.so.1.1` is unavailable.
- Full frontend suite earlier in this checkout: 359 passed, 3 failed assertions in unrelated existing UI tests.
- Manual TypeScript command remains red with 154 existing repository errors. No password-reset or Nodemailer file errors were reported.
- Commit/push are left pending because shared docs and auth route files include existing unrelated changes that cannot be staged whole without bundling them.

## Runtime smoke check

- Smoke check trước khi thay provider xác nhận route trả `400` cho email sai định dạng và `202` chung cho request hợp lệ; địa chỉ `.invalid` không chứng minh email được gửi.
- Trong checkout hiện tại `apps/api/.env` chưa có các biến SMTP và API không chạy trên cổng `3000`; Nodemailer chưa được kiểm tra với hộp thư thật. Muốn gửi email thật, điền SMTP credentials và sender được nhà cung cấp cho phép rồi khởi động lại API.
