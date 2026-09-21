# Task 7 — Báo cáo bổ sung behavioral security tests

## Trạng thái

Đã hoàn tất phần bổ sung test executable. Không thay đổi production code, flow nhập Page ID + Page Access Token thủ công, hoặc các file dirty không liên quan.

## Phạm vi đã bổ sung

- `apps/api/src/services/facebook-oauth.service.test.ts`
  - State OAuth không tồn tại/hết hạn bị từ chối trước khi gọi Facebook.
  - State OAuth bị replay: callback đầu tiên consume state, callback thứ hai bị từ chối.
  - Page `canPublish: false` bị từ chối; không gọi persistence và không consume selection.
- `apps/api/src/controllers/facebook-page.controller.test.ts`
  - Callback failure redirect chỉ chứa safe error code, không làm lộ message hoặc access token.
- `apps/web/src/components/dashboard/ConnectModal.test.tsx`
  - Không sửa vì đã có test executable cho cả completion state và restart state, gồm reducer transition và rendered surface; tránh duplicate assertion.

## Coverage đã có và được giữ nguyên

- Wrong-owner selection không invalidate selection đã có test trong OAuth service test.
- Modal success/restart behavior đã có test render thực tế trong ConnectModal test.
- Manual Page ID + Page Access Token flow không bị thay đổi.

## Verification

- Targeted suite:
  - `pnpm exec vitest run apps/api/src/controllers/facebook-page.controller.test.ts apps/api/src/services/facebook-oauth.service.test.ts apps/web/src/components/dashboard/ConnectModal.test.tsx`
  - Kết quả: **7 files, 39 tests passed** (Vitest cũng thu thập các bản test tương ứng trong `.worktrees`).
- `git diff --check`: passed.
- Full `pnpm test` không thể dùng làm signal sạch trong workspace hiện tại vì Vitest thu thập các `.worktrees` và có failure có sẵn ngoài phạm vi, gồm SettingsPage, assistant-preview, outbound-message, architecture path, cùng môi trường MongoMemoryServer thiếu `libcrypto.so.1.1`. Không có failure nào thuộc ba file test Facebook được sửa trong targeted suite.

## Concerns

Workspace đang có nhiều thay đổi dirty/untracked có trước task này; chỉ hai file API test trong phạm vi task được chỉnh sửa. Modal test không nằm trong commit vì coverage yêu cầu đã tồn tại.
