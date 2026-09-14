# Báo cáo Task 4: Lưu mẫu trả lời nhanh và tải ảnh Cloudinary

## Kết quả

Settings tải các mẫu trả lời nhanh từ `GET /api/v1/quick-replies`, lưu mới/cập nhật bằng `FormData` qua `POST`/`PATCH`, và xóa qua `DELETE`. Ảnh đã lưu sử dụng `attachment.secureUrl` để hiển thị preview có liên kết; state `File` cục bộ được xóa chỉ sau khi save thành công.

## RED

Lệnh:

```text
npm test -- --run apps/web/src/pages/SettingsPage.test.tsx
```

Kết quả ban đầu: 3/14 test mới fail đúng vì chưa có `QuickReplyContract`/GET, chưa tạo `FormData`, và chưa render URL ảnh hay có điều khiển sửa/xóa. Sau self-review, bổ sung một test RED cho việc chỉ xóa file cục bộ sau save thành công; test fail vì thiếu `if (saved) setAttachment(null)`.

## GREEN

Lệnh:

```text
npm test -- --run apps/web/src/pages/SettingsPage.test.tsx
pnpm --dir apps/web run build
```

Kết quả: 14/14 SettingsPage tests pass; Vite production build pass, 127 modules transformed. `npm --workspace apps/web run build` không phù hợp vì root package không khai báo npm workspaces; đã thay bằng lệnh pnpm đúng cấu hình `pnpm-workspace.yaml`.

## Tệp thay đổi

- `apps/web/src/pages/SettingsPage.tsx`: persistence, multipart submit, preview, edit/delete và trạng thái UI tiếng Việt.
- `apps/web/src/pages/SettingsPage.test.tsx`: source tests cho API persistence, multipart, preview/control và lỗi upload.
- `apps/web/src/lib/api.ts`: không tự đặt `content-type: application/json` khi body là `FormData`; JSON hiện hữu được giữ nguyên.

## Tự rà soát

- Dùng `QuickReplyContract` và attachment contract, không giữ `File` trong dữ liệu đã lưu.
- FormData gửi `shortcut`, `message`, và `attachment`; không gán JSON content type cho multipart.
- Có loading, error, empty và disabled/saving/deleting states bằng tiếng Việt.
- Preview dùng `secureUrl` trong liên kết `target="_blank"` với `rel="noreferrer"`.
- `git diff --check` không báo lỗi whitespace.

## Lưu ý

- Không khởi chạy hoặc dừng dev server. Tiến trình `tsx watch src/server.ts` quan sát được đã chạy hơn ba giờ trước phiên này, nên được giữ nguyên.
- Test hiện có của SettingsPage là source-level test theo convention của repo; chưa có React DOM harness trong package để kiểm thử tương tác browser đầy đủ.

## Bổ sung sau review Task 4

### RED

Thêm regression source tests cho hai lỗi review và chạy:

```text
npm test -- --run apps/web/src/pages/SettingsPage.test.tsx
```

Kết quả RED: 2/15 fail đúng vì Settings dùng một `error` ở ngoài modal và import `DashboardAccount` từ DashboardTopbar chưa commit. Sau đó, test regression cho cleanup file tiếp tục bảo đảm chỉ xóa `File` sau save thành công.

### GREEN

```text
npm test -- --run apps/web/src/pages/SettingsPage.test.tsx
pnpm --dir apps/web run build
```

Kết quả GREEN: 15/15 tests pass; Vite build pass, 127 modules transformed. Không có `apps/web/tsconfig.json` hay script typecheck trong repo (chỉ có `tsconfig.base.json` chứa compiler options), nên `tsc -p apps/web/tsconfig.json` không phải lệnh kiểm chứng hợp lệ.

### Nội dung sửa

- Tách `pageError`, `actionError`, và `modalError`: GET error thay vùng bảng thay vì hiện empty state; lỗi upload/lưu hiển thị bên trong modal z-50.
- Bỏ `DashboardAccount`, `user`, `onLogout`, `onProfile` khỏi code và source test Task 4, nên Settings commit không cần symbol Dashboard/App chưa commit.
