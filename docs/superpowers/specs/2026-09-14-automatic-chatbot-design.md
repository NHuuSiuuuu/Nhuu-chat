# Thiết kế chatbot tự động đa kênh

## 1. Mục tiêu và phạm vi

Chatbot tự động nhận mọi tin nhắn đến từ khách trên các kênh đang kết nối, chọn trợ lý phù hợp, trả lời theo mẫu hoặc tùy biến nhẹ bằng Gemini, sau đó gửi câu trả lời lại đúng kênh.

Phạm vi MVP:

- Áp dụng cho mọi kênh có connector nhận và gửi tin nhắn trong hệ thống.
- Chỉ xử lý tin do khách gửi; không xử lý tin của bot hoặc nhân viên để tránh vòng lặp.
- Xử lý văn bản, lời chào và tin media chưa có nội dung đọc được bằng câu trả lời phù hợp, không âm thầm bỏ qua.
- Ưu tiên mẫu chatbot tự động có từ khóa; câu hỏi còn lại dùng RAG, Hướng dẫn và lịch sử hội thoại.
- Khi không đủ thông tin, bot gửi `Em chưa có đủ thông tin, nhân viên sẽ hỗ trợ.`, chuyển quyền xử lý cho nhân viên và tạm dừng bot.
- Không thay đổi logic Gemini chạy ở frontend; API key và prompt chỉ nằm ở backend.

Không nằm trong MVP:

- Workflow kéo-thả nhiều bước.
- Gửi media chủ động từ bot nếu connector chưa hỗ trợ.
- Cho Gemini trả lời theo kiến thức chung khi RAG không có dữ liệu chắc chắn.
- Tách riêng một hệ thống billing cho chatbot.

## 2. Quy tắc nghiệp vụ

### 2.1. Chọn trợ lý

Mỗi cấu hình trợ lý thuộc về một user/shop và có thể được áp dụng cho tất cả kênh đang kết nối hoặc danh sách kênh cụ thể. Khi tin khách đến, hệ thống chọn cấu hình theo thứ tự:

1. Cấu hình trợ lý được gắn trực tiếp với channel/page nhận tin.
2. Cấu hình mặc định của user/shop.
3. Nếu không có cấu hình bật, không tự động trả lời.

### 2.2. Thứ tự tạo phản hồi

1. Chuẩn hóa nội dung tin khách và xác định loại tin.
2. Kiểm tra tính hợp lệ của hội thoại, quyền sở hữu và trạng thái `botPausedUntil`.
3. Tìm các mẫu đang bật, đúng channel và khớp từ khóa; chọn mẫu có độ ưu tiên cao nhất.
4. Nếu mẫu cho phép AI tùy biến, gửi mẫu cùng ngữ cảnh ngắn cho Gemini để diễn đạt lại nhưng không thay đổi ý nghĩa.
5. Nếu không khớp mẫu, truy xuất knowledge chunks liên quan rồi gọi Gemini với Hướng dẫn, lịch sử hội thoại và context đã truy xuất.
6. Gemini phải trả về trạng thái đủ thông tin hay cần bàn giao. Chỉ trạng thái đủ thông tin mới được gửi câu trả lời tự động.
7. Nếu cần bàn giao, gửi câu fallback, tạm dừng bot và đánh dấu hội thoại cần nhân viên.

### 2.3. Tin nhắn không phải văn bản

- Ảnh, sticker hoặc file có caption: dùng caption làm input nếu có.
- Ảnh, sticker hoặc file không có nội dung đọc được: bot yêu cầu khách mô tả hoặc đặt câu hỏi bằng văn bản.
- Không bỏ qua sự kiện; mọi phản hồi bot đều được lưu và gửi qua connector nếu connector hỗ trợ text.

### 2.4. Chống vòng lặp và trùng gửi

- Chỉ message có `senderType: "customer"` mới kích hoạt bot.
- Dùng khóa idempotency từ `conversationId` và message id/external id để một tin khách chỉ tạo tối đa một lượt xử lý.
- Ghi trạng thái xử lý và kết quả gửi trước khi phát sự kiện realtime.
- Nếu nhân viên gửi tin, đặt `botPausedUntil` theo chính sách pause hiện có; không gửi bot đồng thời trong khoảng xử lý đó.
- Timeout, lỗi provider hoặc lỗi connector không được tạo thêm câu trả lời thứ hai tự động.

## 3. Kiến trúc đề xuất

### 3.1. Các lớp

- `AssistantConfigService`: đọc và cập nhật trợ lý, hướng dẫn, model, tài liệu, trạng thái và channel scope.
- `AutomationTemplateService`: CRUD mẫu chatbot và tìm mẫu khớp từ khóa theo ưu tiên.
- `ChatbotOrchestrator`: điều phối một inbound customer message, kiểm tra pause/idempotency, gọi matcher/RAG/LLM và quyết định handoff.
- `BotReplyProvider`: interface chung cho tạo câu trả lời; triển khai mẫu tùy biến và RAG Gemini.
- `ChannelBotAdapter`: interface gửi text bot về channel; mỗi connector tự chịu trách nhiệm xác thực, định dạng và delivery status.
- `BotDeliveryService`: gửi qua adapter, lưu message `senderType: "bot"`, cập nhật trạng thái và phát event.

Luồng tổng quát:

```text
Inbound connector
  → normalize + persist customer message
  → ChatbotOrchestrator
  → AssistantConfig + TemplateMatcher/RAG + Gemini
  → BotDeliveryService
  → ChannelBotAdapter
  → persist bot message + realtime event
```

Orchestrator không import trực tiếp Telegram/Facebook/Instagram/Zalo. Nó chỉ nhận input chuẩn hóa và dùng adapter được resolve từ `platform`/`channelId`.

### 3.2. Dữ liệu chính

Tên collection/model có thể điều chỉnh theo convention Mongo hiện tại, nhưng phải giữ các trường nghiệp vụ sau:

`Assistant`:

- `ownerId`
- `name`
- `instructions`
- `modelTier`
- `enabled`
- `fallbackMessage`
- `channelScope` (`all` hoặc danh sách channel identifiers)
- `isDefault`
- timestamps

`AutomationTemplate`:

- `ownerId`, `assistantId`
- `name`
- `keywords: string[]`
- `responseTemplate`
- `allowAiRewrite`
- `priority`
- `enabled`
- `channelScope`
- timestamps

`BotProcessing` hoặc trường tương đương idempotency:

- `conversationId`
- `customerMessageId`/`externalMessageId`
- `status` (`processing`, `sent`, `handed_off`, `failed`)
- `assistantId`
- `botMessageId` nếu đã tạo
- timestamps và lỗi kỹ thuật không chứa prompt/secret

Knowledge documents vẫn dùng pipeline hiện có; trợ lý chỉ tham chiếu document ids/chunks được phép của đúng owner.

## 4. API và UI

API dự kiến, đều yêu cầu authentication và giới hạn theo owner:

- `GET/POST/PATCH/DELETE /api/v1/assistants`
- `GET/POST/PATCH/DELETE /api/v1/assistants/:assistantId/templates`
- `POST /api/v1/assistants/:assistantId/preview` để thử câu trả lời trong preview, không gửi ra channel thật.
- Endpoint hiện có cho AI settings và knowledge được tái sử dụng hoặc mở rộng tối thiểu, không tạo API trùng.

UI tab `Chatbot tự động`:

- Thanh trên cùng chọn trợ lý, Page, `Chat mới`, `Xuất bản`.
- Cột Hướng dẫn, Model/Kiến thức và Khung chat giữ bố cục đã duyệt.
- Bổ sung khu vực `Mẫu chatbot tự động` với danh sách, thêm/sửa/xóa, từ khóa, priority, AI rewrite, channel scope và bật/tắt.
- Preview chỉ gọi endpoint preview, hiển thị loading/error/fallback và không tạo message thật.

## 5. Handoff và trạng thái hội thoại

Khi fallback xảy ra:

1. Gửi đúng một câu fallback qua channel adapter.
2. Lưu message bot với `senderType: "bot"` và delivery status.
3. Cập nhật `botPausedUntil` và trạng thái/metadata handoff của conversation.
4. Phát cập nhật realtime để Inbox hiển thị hội thoại cần nhân viên.

Nếu adapter không tồn tại hoặc gửi thất bại, lưu lỗi delivery, giữ nguyên message khách và tạo trạng thái cần nhân viên; không retry vô hạn.

## 6. Bảo mật, độ tin cậy và giới hạn

- Mọi truy vấn assistant/template/knowledge phải lọc theo authenticated owner.
- Không log API key, session channel, prompt đầy đủ hoặc nội dung nhạy cảm.
- Giới hạn kích thước instruction, template, lịch sử và context RAG trước khi gọi Gemini.
- Gemini có timeout và retry hữu hạn; fallback kỹ thuật không được làm lộ lỗi provider cho khách.
- Webhook phải acknowledge đúng chuẩn sau khi đã enqueue/xử lý an toàn, tránh gửi trùng do retry của nền tảng.
- Chỉ tích hợp end-to-end các channel adapter thật sự có trong repo; Facebook/Instagram/Zalo cần adapter riêng trước khi bật gửi tự động trên các kênh đó.

## 7. Tiêu chí nghiệm thu

- Tin customer text trên mỗi channel được nhận diện, lưu và chỉ xử lý một lần.
- Mẫu có từ khóa được chọn đúng theo priority, channel scope và enabled state.
- Mẫu cho phép AI rewrite được tùy biến nhẹ nhưng giữ nội dung gốc; mẫu tắt rewrite trả nguyên nội dung.
- Câu hỏi không khớp mẫu dùng đúng assistant instructions, lịch sử và RAG context.
- Không có context đủ tin cậy thì gửi fallback, pause bot và chuyển nhân viên.
- Tin bot/agent không kích hoạt lại bot.
- Preview không gửi message thật.
- Kiểm thử quyền owner, lỗi Gemini, timeout, lỗi connector, webhook replay và mobile layout đều có bằng chứng.

## 8. Phân kỳ triển khai

1. Contracts, models, schemas và CRUD assistant/template.
2. Template matcher thuần hàm và test priority/scope/normalization.
3. Orchestrator + idempotency + pause/handoff + RAG/Gemini.
4. Adapter gửi bot và tích hợp inbound hiện có; hoàn thiện từng channel connector.
5. UI quản lý mẫu và preview thật qua API.
6. Test end-to-end, tài liệu, changelog và kiểm tra production có kiểm soát.
