# Thiết kế migration CSS sang Tailwind

## Mục tiêu

Chuyển toàn bộ styling của frontend `apps/web` từ CSS thuần sang Tailwind CSS, giữ nguyên hành vi, nội dung, layout, màu sắc, trạng thái tương tác và responsive hiện tại. Sau migration, source chỉ giữ một file CSS entry tối thiểu để nạp Tailwind; các file CSS giao diện hiện hữu sẽ được xóa.

Phạm vi chỉ gồm frontend React/Vite/TypeScript. Backend Node.js/Express không có CSS nên không thay đổi.

## Hiện trạng

Frontend hiện có sáu file CSS:

- `apps/web/src/styles/global.css`
- `apps/web/src/pages/DashboardHeader.css`
- `apps/web/src/pages/DashboardPage.css`
- `apps/web/src/pages/InboxPage.css`
- `apps/web/src/components/dashboard/ConnectModal.css`
- `apps/web/src/components/dashboard/ConnectModalV2.css`

Styling hiện được gắn qua các class semantic như `dashboard-page`, `inbox-page`, `conversation-item`, `connect-modal` và nhiều selector trạng thái/media query. Các class này sẽ được thay bằng utility classes trong TSX; không giữ lại một lớp CSS tương thích để tránh migration nửa vời.

## Quyết định kỹ thuật

- Dùng Tailwind CSS v4 qua plugin Vite chính thức `@tailwindcss/vite`.
- Thêm `tailwindcss` và `@tailwindcss/vite` vào `apps/web/package.json` và lockfile.
- Cấu hình plugin trong `apps/web/vite.config.ts`.
- Tạo duy nhất `apps/web/src/styles/tailwind.css` với nội dung `@import "tailwindcss";` và import file này từ `apps/web/src/main.tsx`.
- Không dùng Play CDN, PostCSS legacy, `tailwind.config.js`, shadcn/ui hoặc dependency component ngoài phạm vi.
- Màu brand, spacing quan trọng và breakpoint sẽ được biểu diễn trực tiếp bằng utilities; giá trị không có utility chuẩn dùng arbitrary values có chủ đích.
- SVG logo/icon hiện có được giữ nguyên; chỉ chuyển layout/kích thước/màu wrapper sang utilities.

Tham chiếu cài đặt Vite và entry CSS: [Tailwind CSS — Install with Vite](https://tailwindcss.com/docs/installation).

## Phân rã migration

### 1. Tooling và nền tảng

Thiết lập plugin Tailwind, entry CSS và import toàn cục. Giữ `global.css` tạm thời trong giai đoạn chuyển để không làm hỏng màn hình giữa chừng, sau đó chuyển reset/body styles sang utilities hoặc các quy tắc mặc định phù hợp trong entry.

### 2. Dashboard

Chuyển `DashboardPage.tsx`, `DashboardTopbar.tsx` và các component dashboard sang utility classes. Phạm vi gồm topbar, navigation, account card, filter, empty/loading state, platform icon box và responsive breakpoint.

### 3. Modal kết nối Telegram

Chuyển markup của `ConnectModal.tsx` và các trạng thái QR/2FA/error/success từ hai file CSS sang utility classes. Không thay đổi request API, polling, xử lý token hoặc nội dung bảo mật.

### 4. Inbox và hội thoại

Chuyển `InboxPage.tsx`, `ConversationList.tsx`, `ChatWindow.tsx`, `MessageComposer.tsx` và icon liên quan. Giữ header Hchat dùng chung ở Inbox, layout ba vùng, empty state, selected/hover/focus state, cuộn độc lập và responsive mobile.

### 5. Dọn CSS cũ và tài liệu

Xóa sáu file CSS cũ sau khi không còn import/reference. Cập nhật `CHANGELOG.md`; cập nhật README/Wiki nếu hướng dẫn frontend hiện có đề cập cách styling hoặc lệnh cài đặt.

## Tiêu chí nghiệm thu

- `rg --files apps/web/src | rg '\\.css$'` chỉ còn `apps/web/src/styles/tailwind.css`.
- Không còn import các file CSS cũ hoặc class selector cũ được dùng như dependency styling.
- `pnpm exec vitest run` cho focused frontend tests pass; các test backend vẫn được tách khỏi kết luận UI nếu môi trường MongoDB chưa sẵn sàng.
- `pnpm exec vite build` chạy thành công từ `apps/web`.
- `git diff --check` pass.
- Kiểm tra thủ công các trạng thái: đăng nhập, Dashboard loading/empty/connected, mở modal, QR/2FA/error, chuyển Inbox, chọn hội thoại, gửi message, empty state và mobile layout.
- Không thay đổi API contract, state flow, quyền, realtime socket hoặc dữ liệu.

## Rủi ro và cách kiểm soát

- **Sai lệch pixel khi chuyển selector phức tạp:** chuyển theo từng màn hình, đối chiếu các breakpoint và chạy build sau mỗi nhóm.
- **Class động bị Tailwind không scan:** dùng class đầy đủ trong source hoặc ánh xạ tĩnh thay vì ghép chuỗi tùy ý.
- **CSS cũ bị sót:** kiểm tra import và file inventory bằng `rg` trước khi xóa.
- **Thay đổi hành vi do sửa TSX lớn:** không đổi handler/API; test helper/state hiện có phải pass sau từng nhóm.
- **Môi trường test MongoDB:** ghi riêng test UI/build và không che giấu lỗi integration do thiếu `libcrypto.so.1.1`.
