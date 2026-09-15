# Chatbot, Knowledge và phạm vi kênh độc lập theo trợ lý

## Mục tiêu

Mỗi chatbot được tạo trong Nhuu-chat là một cấu hình độc lập theo chủ đề. Chatbot chỉ sử dụng hướng dẫn, mẫu chào và tài liệu Knowledge của chính nó; việc chọn chatbot trong trang Trợ lý AI được giữ lại sau khi tải lại trang. Người dùng có thể áp dụng một chatbot cho một hoặc nhiều tài khoản/kênh đã kết nối như Facebook Page, Zalo OA hoặc tài khoản Telegram cá nhân.

## Phạm vi

- Tách tài liệu Knowledge theo `assistantId` cùng với `ownerId`.
- Giới hạn list, upload, delete và vector search theo đúng chatbot đang chọn.
- Giữ chatbot đang chọn trong trình duyệt qua reload, nhưng kiểm tra lại ID với danh sách chatbot của tài khoản hiện tại.
- Cho phép áp dụng một chatbot cho nhiều kênh bằng một giao diện chung, không gắn cứng vào riêng Facebook.
- Không thay đổi auth, schema Assistant, migration database thủ công hoặc hành vi các kênh ngoài luồng chatbot hiện có.

## Thiết kế dữ liệu

Thêm trường `assistantId` vào `KnowledgeDocument` và `KnowledgeChunk`. Trường này tham chiếu `Assistant` và được index cùng `ownerId`.

- Tài liệu mới bắt buộc có `assistantId` hợp lệ thuộc cùng owner.
- Chunk được tạo từ tài liệu phải copy cùng `assistantId`; vector store giữ trường này để lọc runtime.
- Tài liệu cũ chưa có `assistantId` được xem là tài liệu legacy của trợ lý mặc định. Chúng chỉ được truy xuất khi chatbot mặc định được chọn, không được trả về cho chatbot chủ đề khác.
- Xóa tài liệu phải kiểm tra đồng thời `ownerId`, `assistantId` và document ID để không thể xóa tài liệu của chatbot khác.

`Assistant.channelScope` là phạm vi áp dụng của chatbot và giữ nguyên dạng `{ mode, identifiers }`. Mỗi identifier có định dạng ổn định `<platform>:<externalId>`, ví dụ `facebook:page-123`, `zalo:oa-456` hoặc `telegram_personal:user-789`; không dùng tên hiển thị làm khóa. Một tài khoản/kênh chỉ có một assistant trực tiếp hiệu lực, trong khi một assistant có thể áp dụng cho nhiều tài khoản/kênh.

## Luồng API và RAG

- `POST /api/v1/knowledge` nhận `assistantId`; controller/service xác minh Assistant thuộc owner trước khi ingest.
- `GET /api/v1/knowledge?assistantId=...` chỉ trả tài liệu của owner và assistant đó; với assistant mặc định có thể bao gồm tài liệu legacy chưa có `assistantId`.
- `DELETE /api/v1/knowledge/:id?assistantId=...` chỉ xóa tài liệu đúng owner và assistant.
- `ChatbotOrchestrator` truyền `assistant.id` vào vector search.
- Preview Assistant truyền `assistant.id` vào vector search.
- Hydration vector store chỉ nạp chunk khi owner của chunk khớp owner của document và assistant của chunk khớp assistant của document; chunk legacy chỉ được giữ với quy tắc legacy đã nêu.

Khi runtime nhận tin nhắn, connector phải cung cấp `accountIdentifier` của tài khoản/kênh kết nối cùng với `channelId` của cuộc trò chuyện. `resolveAssistant` ưu tiên assistant đang khai báo identifier chính xác cho tài khoản/kênh; nếu không có thì dùng assistant mặc định đang bật. Không dùng `channelId` của từng cuộc trò chuyện để gán toàn bộ tài khoản Telegram cá nhân. Nếu nhiều assistant cùng khai báo một identifier do dữ liệu cũ hoặc request đồng thời, hệ thống không chọn ngẫu nhiên mà trả lỗi cấu hình và không tự động trả lời.

Danh sách kênh để giao diện áp dụng lấy từ một contract kênh chung của tài khoản hiện tại, gồm `platform`, `externalId`, `displayName` và `status`. Với Telegram cá nhân, contract được dựng từ `TelegramPersonalSession` đang active (`telegramUserId`, `displayName`, `username`); không tạo hoặc yêu cầu Telegram Bot token. Connector mới phải cung cấp contract này; modal áp dụng không cần biết chi tiết API riêng của Facebook, Zalo hay Telegram. Chỉ các tài khoản/kênh thuộc owner hiện tại và ở trạng thái có thể sử dụng mới được trả về.

## Trạng thái lựa chọn trên frontend

`ChatbotAutomationSettings` lưu ID chatbot đã chọn vào `localStorage` bằng một key cố định. Khi tải danh sách:

1. Nếu ID đã lưu còn thuộc danh sách tài khoản hiện tại, chọn chatbot đó.
2. Nếu không còn tồn tại hoặc bị xóa, chọn chatbot `isDefault`, sau đó fallback sang chatbot đầu tiên.
3. Khi click chatbot khác, cập nhật localStorage, nạp lại hướng dẫn/mẫu chào/Knowledge của chatbot đó và xóa lịch sử preview để không trộn nội dung.
4. Khi tạo hoặc xóa chatbot, cập nhật lại ID đã lưu theo chatbot được chọn tiếp theo.
5. Nút **Áp dụng cho kênh** mở danh sách kênh đã kết nối và cho phép chọn nhiều kênh. Kênh đang thuộc assistant khác phải hiển thị assistant hiện tại; khi lưu chuyển kênh, giao diện phải yêu cầu xác nhận. Hủy xác nhận không thay đổi kênh nào.
6. Bỏ chọn một kênh rồi lưu sẽ gỡ identifier khỏi assistant hiện tại; kênh đó quay về assistant mặc định.

Modal Knowledge nhận `assistantId` từ chatbot đang chọn và luôn gửi ID này trong list/upload/delete. Không hiển thị tài liệu của chatbot khác.

## Xử lý lỗi và bảo mật

- Assistant ID sai, không thuộc owner hoặc thiếu khi upload mới trả lỗi validation/không tìm thấy, không fallback sang tài liệu của owner khác.
- Channel identifier sai, không thuộc owner hoặc thuộc kênh đã ngắt kết nối phải bị từ chối; không cho client tự gán một identifier không có trong danh sách kênh của owner.
- Khi chuyển kênh khỏi assistant khác, API phải cập nhật theo cách không để kênh cùng lúc có hai assistant trực tiếp hiệu lực.
- Nếu không có chatbot được chọn, không cho upload và hiển thị trạng thái phù hợp.
- Không đưa token, secret hoặc nội dung tài liệu của owner khác vào response.
- Khi tài liệu không có context phù hợp, chatbot tiếp tục dùng fallback hiện có.

## Kiểm thử và tiêu chí nghiệm thu

Backend:

- Service/controller test xác minh upload/list/delete đều nhận và kiểm tra `assistantId`.
- Vector-store/runtime test chứng minh hai chatbot cùng owner không nhìn thấy chunk của nhau.
- Preview/orchestrator test chứng minh truy xuất truyền đúng assistant ID.
- Legacy document test chứng minh tài liệu chưa có assistant ID chỉ thuộc chatbot mặc định.

Frontend:

- Test chứng minh assistant ID được lưu/khôi phục và bị loại nếu không còn trong danh sách.
- Test chứng minh modal Knowledge gửi assistant ID và không dùng danh sách global.
- Test chứng minh đổi chatbot xóa lịch sử preview và cập nhật nội dung bot.
- Test chứng minh modal áp dụng tải danh sách kênh theo contract chung, gửi đúng identifier đã chọn và yêu cầu xác nhận khi chuyển kênh đang thuộc assistant khác.
- Test chứng minh bỏ chọn kênh sẽ gỡ áp dụng và kênh quay về assistant mặc định.
- Production build và `git diff --check` phải pass.

## Giới hạn

Tài liệu legacy không có `assistantId` không thể tự động xác định chủ đề ban đầu; hệ thống quy ước chúng thuộc trợ lý mặc định. Người dùng có thể upload lại dưới chatbot chủ đề tương ứng nếu cần chuyển dữ liệu.

Việc kết nối Facebook Page hoặc Zalo OA là phạm vi của connector tương ứng. Spec này chỉ quy định contract và cơ chế áp dụng chatbot; không giả lập OAuth, webhook hoặc API nhắn tin của các nền tảng chưa được kết nối. Telegram trong phạm vi này là tài khoản cá nhân đã kết nối bằng QR, không phải Telegram Bot.
