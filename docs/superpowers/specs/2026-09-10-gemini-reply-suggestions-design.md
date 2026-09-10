# Gemini Reply Suggestions Design

## Status

Proposed — waiting for user review before implementation.

## Goal

Cho phép nhân viên nhận 3 câu trả lời gợi ý bằng tiếng Việt trong form nhập tin nhắn Inbox. Gợi ý được sinh bởi Gemini dựa trên tin nhắn gần nhất của khách trong hội thoại đang mở. Nhân viên chỉ chọn để điền vào textarea; hệ thống không tự gửi tin.

## Scope

### In scope

- Gemini client chỉ chạy ở backend.
- API lấy 3 gợi ý cho một conversation.
- Kiểm tra quyền admin/agent và quyền truy cập conversation.
- Structured JSON output để kết quả luôn là mảng 3 chuỗi.
- Loading, lỗi và fallback gợi ý cục bộ ở composer.
- Nút làm mới gọi lại Gemini.
- Cập nhật contract, test, README, Wiki và CHANGELOG.

### Out of scope

- Không lưu prompt, response hoặc lịch sử AI vào MongoDB.
- Không tự động gửi tin nhắn.
- Không dùng Gemini cho chatbot customer hoặc RAG trong task này.
- Không thay đổi schema database, auth model hoặc cơ chế gửi outbound message.

## User flow

1. Nhân viên mở một conversation trong Inbox.
2. Composer hiển thị các gợi ý cục bộ hiện có trong khi chưa gọi API.
3. Composer gọi API gợi ý khi conversation đã có tin nhắn gần nhất hoặc khi người dùng bấm làm mới.
4. Backend lấy tin nhắn gần nhất của khách, gọi Gemini và trả tối đa 3 câu trả lời.
5. Composer thay chip bằng kết quả Gemini.
6. Bấm chip chỉ điền câu trả lời vào textarea; Enter vẫn là thao tác gửi riêng.
7. Nếu Gemini chưa cấu hình, timeout, trả dữ liệu sai hoặc lỗi quota, UI giữ/khôi phục gợi ý cục bộ và hiển thị trạng thái lỗi nhẹ.

## API contract

### `POST /api/v1/conversations/:id/ai-suggestions`

Access: `admin` hoặc `agent`. Agent chỉ được gọi với conversation được phân công; admin được gọi với mọi conversation.

Request body: `{}`.

Success response:

```json
{
  "suggestions": [
    "Dạ, em đã kiểm tra thông tin của anh/chị rồi ạ.",
    "Anh/chị đợi em một chút để em xác nhận lại nhé.",
    "Em sẽ phản hồi lại anh/chị trong ít phút ạ."
  ],
  "source": "gemini"
}
```

`source` là `gemini` hoặc `fallback`. API luôn giới hạn tối đa 3 chuỗi, mỗi chuỗi không quá 240 ký tự.

Errors:

- `401 AUTHENTICATION_REQUIRED` khi thiếu token.
- `403 FORBIDDEN` khi agent không được phân công.
- `404 CONVERSATION_NOT_FOUND` khi conversation không tồn tại hoặc không thuộc quyền truy cập.
- Lỗi cấu hình/provider được xử lý nội bộ; controller trả fallback response để composer không bị hỏng.

## Backend design

- Thêm `@google/genai` vào `apps/api` vì SDK chính thức hỗ trợ `GoogleGenAI` và `models.generateContent`.
- Mở rộng `packages/config/src/env.ts` với `GEMINI_API_KEY` optional và `GEMINI_CHAT_MODEL` optional, không làm API fail startup khi Gemini chưa được cấu hình.
- Tạo provider Gemini cạnh `apps/api/src/ai/llm.provider.ts`, với interface riêng cho reply suggestions để không làm thay đổi RAG provider hiện tại.
- Dùng response schema JSON dạng `{ suggestions: string[] }`; service lọc chuỗi rỗng, giới hạn 3 câu và giới hạn độ dài.
- Service lấy tin nhắn inbound gần nhất (`senderType: customer`) của conversation. Chỉ gửi nội dung tin nhắn cần thiết cho Gemini, không gửi token, metadata nhạy cảm hoặc toàn bộ lịch sử.
- Prompt yêu cầu câu trả lời lịch sự, ngắn, tiếng Việt, không bịa giá/chính sách/trạng thái đơn hàng và không tự nhận đã thực hiện hành động chưa có dữ liệu.
- Đặt timeout hữu hạn cho request Gemini. Lỗi provider không làm lỗi composer; controller trả fallback suggestions với `source: fallback`.
- Thêm comment ngắn trên service/provider vì đây là business logic không hiển nhiên, theo quy định `Code Comments` trong `AGENTS.md`.

## Frontend design

- `InboxPage` nhận response API và truyền callback `onLoadAiSuggestions` xuống `ChatWindow`/`MessageComposer`.
- `MessageComposer` nhận `conversationId`/callback thay vì tự biết API URL hoặc token.
- Khi đổi conversation, reset suggestions về fallback và trạng thái lỗi/loading.
- Khi bấm refresh, disable nút trong lúc gọi API và giữ nội dung hiện tại cho tới khi có response mới.
- Chip Gemini dùng cùng layout hiện tại trong ảnh tham chiếu; bấm chip gọi hàm điền textarea, không submit form.
- Lỗi hiển thị bằng trạng thái nhỏ cạnh “AI gợi ý”, không chặn nhập/gửi tin.

## Configuration

Trong `apps/api/.env`:

```env
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite
```

Không commit `.env`, API key hoặc response có dữ liệu khách hàng.

## Testing

- Provider test: gửi prompt/response schema đúng và parse 3 gợi ý.
- Provider failure test: timeout, lỗi API và JSON sai đều trả lỗi có thể fallback.
- Service test: lấy đúng latest customer message; agent không được truy cập conversation ngoài assignment.
- Controller test: auth, 404/403 và response `{ suggestions, source }`.
- Web test: loading, render chip Gemini, click chip điền textarea, refresh và fallback khi lỗi.
- Chạy focused tests, API typecheck, web build và `git diff --check`.

## References

- Google Gemini Generate Content API: https://ai.google.dev/api/generate-content
- Google structured output: https://ai.google.dev/gemini-api/docs/structured-output
