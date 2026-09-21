# Task 7 — Báo cáo bổ sung behavioral security tests

## Trạng thái

Đã hoàn tất phần bổ sung test executable. Không thay đổi OAuth/manual behavior hoặc các file dirty không liên quan; chỉ thêm helper tối thiểu trong ConnectModal để test đúng logic production.

## Phạm vi đã bổ sung

- `apps/api/src/services/facebook-oauth.service.test.ts`
  - State OAuth không tồn tại/hết hạn bị từ chối trước khi gọi Facebook.
  - State OAuth bị replay: callback đầu tiên consume state, callback thứ hai bị từ chối.
  - Page `canPublish: false` bị từ chối; không gọi persistence và không consume selection.
- `apps/api/src/controllers/facebook-page.controller.test.ts`
  - Callback failure redirect chỉ chứa safe error code, không làm lộ message hoặc access token.
- `apps/web/src/components/dashboard/ConnectModal.test.tsx`
  - Kiểm tra selection success/onConnected và callback-query restart thông qua helper được component sử dụng thật.

## Coverage đã có và được giữ nguyên

- Wrong-owner selection không invalidate selection đã có test trong OAuth service test.
- Modal success/restart behavior đã có test render thực tế và behavioral helper coverage trong ConnectModal test.
- Manual Page ID + Page Access Token flow không bị thay đổi; boundary test xác nhận request contract.

## Verification

- Targeted suite:
  - `pnpm exec vitest run apps/api/src/controllers/facebook-page.controller.test.ts apps/api/src/services/facebook-oauth.service.test.ts apps/web/src/components/dashboard/ConnectModal.test.tsx`
  - Kết quả: **7 files, 39 tests passed** (Vitest cũng thu thập các bản test tương ứng trong `.worktrees`).
- `git diff --check`: passed.
- Full `pnpm test` không thể dùng làm signal sạch trong workspace hiện tại vì Vitest thu thập các `.worktrees` và có failure có sẵn ngoài phạm vi, gồm SettingsPage, assistant-preview, outbound-message, architecture path, cùng môi trường MongoMemoryServer thiếu `libcrypto.so.1.1`. Không có failure nào thuộc ba file test Facebook được sửa trong targeted suite.

## Concerns

Workspace đang có nhiều thay đổi dirty/untracked có trước task này; chỉ các test liên quan, report và hai helper tối thiểu trong ConnectModal được chỉnh sửa.

## Review follow-up

- Fake store của OAuth service giờ có expiry thực theo `Date.now()`; test dùng fake clock để state đã lưu thực sự hết hạn trước callback.
- Manual flow boundary được kiểm tra executable qua `connectFacebookPage`, với exact endpoint, một POST request, cookie credentials và JSON body gồm Page ID + Page access token.
- `ConnectModal` có hai helper tối thiểu được production component sử dụng thật: callback query parsing/restart action và selection success transition gọi `onConnected`. Test modal kiểm tra cả hai đường này.

Focused verification sau review:

- `pnpm exec vitest run apps/api/src/controllers/facebook-page.controller.test.ts apps/api/src/services/facebook-oauth.service.test.ts apps/web/src/lib/facebook-publishing.api.test.ts apps/web/src/components/dashboard/ConnectModal.test.tsx`
- Kết quả: **8 files, 60 tests passed** (bao gồm các bản test tương ứng trong `.worktrees`).
