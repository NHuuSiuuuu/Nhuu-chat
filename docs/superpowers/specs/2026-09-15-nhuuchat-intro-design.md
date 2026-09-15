# NHuuChat Intro Loading Design

## Mục tiêu

Thêm intro ngắn theo phong cách Netflix cho mỗi lần tải toàn bộ ứng dụng, đồng thời giữ giao diện ổn định trong lúc các tài nguyên JavaScript và font cần thiết sẵn sàng. Intro không được dùng timeout giả để che lỗi tải dữ liệu.

## Phạm vi

- Tạo component `NetflixIntro` với nền đen, năm thanh đỏ, glow, chữ `NHuuChat` và hiệu ứng fade-out.
- Tạo stylesheet CSS thuần cho animation, responsive bằng `clamp()`/media query và hỗ trợ `prefers-reduced-motion`.
- Tích hợp intro vào `App.tsx` với thời lượng mặc định khoảng 1.2 giây.
- Trong lúc intro hiển thị, chờ các preload thực tế bằng `Promise.all`, tối thiểu là `document.fonts.ready` khi API tồn tại.
- Bọc nội dung ứng dụng bằng `Suspense` và fallback skeleton tĩnh để bảo vệ các route lazy trong tương lai.

## Quyết định thiết kế

### Thời điểm kết thúc intro

Intro chỉ được phép tháo overlay khi cả hai điều kiện hoàn tất:

1. Thời lượng tối thiểu khoảng 1.2 giây đã trôi qua để animation không bị cắt.
2. Preload cần thiết đã hoàn tất hoặc thất bại an toàn.

Không gọi endpoint `/api/config` vì project hiện không có endpoint này; cũng không thêm API mới cho intro. Các page hiện tại đang được import eager nên JavaScript route đã có mặt khi `App` chạy. Các request dữ liệu nghiệp vụ tiếp tục do từng page quản lý và giữ nguyên behavior.

### Hiển thị intro

`App` khởi tạo `showIntro` là `true`, nên intro hiển thị sau mỗi lần tải toàn bộ trang hoặc mở lại tab. Không dùng `sessionStorage`, `localStorage` hay cookie. Khi intro hoàn tất, `showIntro` chuyển thành `false`; chuyển route nội bộ chỉ đổi state `page` trong cùng instance của `App` nên không chạy lại intro.

### Auth và routing

Không thay đổi `loadAuth`, `ProtectedRoute`, `pageFromPath`, redirect hay token refresh. Intro chỉ là lớp hiển thị bên ngoài nội dung hiện tại; auth chưa đăng nhập vẫn thấy màn hình đăng nhập sau khi intro kết thúc.

### Animation

- Năm thanh dọc dùng gradient `#e50914` đến `#b20710`.
- Delay tuần tự 0.12 giây, easing `cubic-bezier(0.65, 0, 0.35, 1)`.
- Chữ `NHuuChat` fade/slide sau khi thanh bắt đầu hoàn tất.
- Overlay fade-out kết hợp scale lên 1.15 trong khoảng 0.6 giây.
- Timer và listener được cleanup khi component unmount.
- Khi người dùng bật reduced motion, animation giảm còn transition tối thiểu nhưng lifecycle callback vẫn chạy.

## Interfaces

```ts
type NetflixIntroProps = {
  onComplete: () => void;
  duration?: number;
  ready?: boolean;
};

`duration` là thời lượng hiển thị tối thiểu; `ready` mặc định là `true` để component có thể dùng độc lập. Khi `ready` là `false`, intro giữ nguyên overlay sau khi hết duration. Khi cả duration và `ready` hoàn tất, component chuyển sang trạng thái fade-out 0.6 giây rồi mới gọi `onComplete` một lần.
```

## Error handling

- `document.fonts` không tồn tại: coi preload font đã hoàn tất.
- Preload bị reject: vẫn cho intro hoàn tất để app hiển thị lỗi/loading của chính page, không bị loading vô hạn.
- Không thêm spinner hoặc delay vô hạn.

## Kiểm thử và nghiệm thu

- Test App: `showIntro` mặc định bật sau mount và chuyển sang app sau khi intro hoàn tất; không đọc/ghi storage.
- Test component: có đúng năm thanh, brand text, callback được gọi một lần sau duration và timer cleanup.
- Test App: intro bao quanh app, preload được gọi trong lúc intro, auth/routing vẫn giữ nguyên.
- Production build web phải pass và `git diff --check` phải pass.
- Kiểm tra thủ công desktop/mobile, tải lại toàn trang, mở tab mới, chuyển route nội bộ, chưa đăng nhập, đã đăng nhập và preload chậm.
