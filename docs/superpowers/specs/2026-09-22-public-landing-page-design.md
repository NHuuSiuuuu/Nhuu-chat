# Thiết kế Landing Page public NhuuChat

## Mục tiêu

Tạo trang giới thiệu sản phẩm SaaS tại `/` cho NhuuChat, mô phỏng bố cục ảnh tham chiếu và vẫn giữ nguyên các route ứng dụng hiện tại.

## Hành vi route và xác thực

- `/` luôn render Landing Page, kể cả khi phiên đăng nhập hợp lệ.
- Khi người dùng chưa đăng nhập, Landing Page hiển thị CTA đăng nhập/đăng ký theo header hiện có của trang public.
- Khi người dùng đã đăng nhập, thông tin user xuất hiện ở Header Landing Page; chỉ thao tác bấm vào user/avatar này mới gọi điều hướng đến `/dashboard`.
- Không tự động chuyển từ `/` sang `/dashboard` chỉ vì session đã tồn tại.
- Các route private `/dashboard`, `/inbox`, `/settings`, `/posts`, `/profile`, `/telegram`, `/orders`, `/analytics` giữ nguyên guard và hành vi hiện tại.
- Nút CTA chính của Landing Page dùng luồng đăng ký/đăng nhập hiện có hoặc điều hướng đến form xác thực; không thay đổi API xác thực.

## Bố cục giao diện

Landing Page gồm các phần theo thứ tự:

1. Header sticky: logo, liên kết neo đến các section, nút đăng nhập/đăng ký; user đã đăng nhập là nút điều hướng Dashboard.
2. Hero: tiêu đề quản lý tin nhắn đa kênh và AI Chatbot, mô tả, email CTA và mockup Inbox bằng UI code.
3. Kênh tích hợp: Facebook, Zalo, Telegram, Website và các kênh được hệ thống hỗ trợ.
4. Tính năng: các card về Inbox hợp nhất, AI/RAG, đăng bài, nhãn và realtime.
5. Quy trình ba bước: kết nối, quản lý, tự động hóa.
6. Chatbot AI: section hai cột mô phỏng hội thoại và lợi ích.
7. Bảng giá: các gói hiển thị rõ, không tạo thanh toán thật.
8. Đánh giá khách hàng và số liệu tin cậy.
9. FAQ accordion phía client.
10. CTA cuối trang và Footer.

## Kỹ thuật

- React + Tailwind hiện có, dùng SVG/icon component thay vì ký tự đặc biệt hoặc ảnh phụ thuộc CDN.
- Dùng `framer-motion` cho animation xuất hiện khi section vào viewport; chỉ animate transform/opacity và tôn trọng `prefers-reduced-motion`.
- Tách Landing Page và các section/mockup thành component trong `apps/web/src/components/landing/`.
- Không thêm backend endpoint, schema, migration hoặc thay đổi authentication.
- Nội dung giao diện bằng tiếng Việt.
- Test route `/` và hành vi user đã đăng nhập bấm user để đến `/dashboard`; test Landing Page có các section chính và FAQ.
