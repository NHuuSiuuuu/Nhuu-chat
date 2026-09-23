# Ghim tin nhắn — Thiết kế

## Mục tiêu

Cho phép agent/admin ghim tối đa 10 tin nhắn trong một hội thoại, xem nhanh tin đã ghim ở đầu khung chat, cuộn tới tin gốc và đồng bộ thao tác ghim/bỏ ghim realtime cho mọi client đang ở cùng phòng hội thoại.

## Phạm vi

- Hỗ trợ ghim tin nhắn text, image, file và các loại message hiện có.
- Chỉ role `admin` và `agent` có quyền ghim/bỏ ghim.
- Quyền thao tác dùng cùng `conversationAccessFilter`/`canJoinConversation` hiện tại.
- Không thay đổi flow gửi tin, delivery status, schema message hoặc pagination message.
- Giới hạn 10 tin ghim/hội thoại, hiển thị theo thứ tự ghim mới nhất trước.

## Lưu trữ

Thêm `pinnedMessages` vào `conversationSchema` dưới dạng subdocument không có `_id`:

```ts
{
  messageId: ObjectId,
  pinnedBy: ObjectId,
  pinnedAt: Date
}
```

`messageId` phải tham chiếu message thuộc đúng conversation. Service kiểm tra quyền conversation, message tồn tại và trạng thái đã ghim trước khi cập nhật. Khi ghim đủ 10 tin, trả lỗi nghiệp vụ `CONVERSATION_PIN_LIMIT_REACHED`; ghim trùng trả về trạng thái hiện tại, không tạo phần tử lặp. Bỏ ghim chỉ xóa đúng phần tử có `messageId`.

## Contract và API

Thêm `PinnedMessageContract`:

```ts
interface PinnedMessageContract {
  messageId: string;
  content: string;
  type: ChatMessageContract["type"];
  senderName?: string;
  createdAt: string;
  pinnedBy: string;
  pinnedAt: string;
}
```

Thêm `pinnedMessages: PinnedMessageContract[]` vào response hội thoại ghim, không đưa danh sách này vào mọi item conversation list nếu không cần thiết.

Endpoints dưới `/api/v1/conversations`:

- `GET /:conversationId/pins` — trả danh sách pin đã populate từ message.
- `POST /:conversationId/pins` — body `{ messageId }`, trả danh sách mới.
- `DELETE /:conversationId/pins/:messageId` — trả danh sách mới.

`messageId` và `conversationId` được validate trước service. Tất cả endpoint dùng `requireRole("admin", "agent")` và kiểm tra access trong service, không tin role middleware là đủ.

## Realtime

Thêm event contract `chat:message_pin_updated`. Payload:

```ts
{
  conversationId: string;
  pinnedMessages: PinnedMessageContract[];
}
```

Controller phát event bằng `emitChatEvent` vào `conversation:${conversationId}` sau khi MongoDB cập nhật thành công. Vì socket hiện đã authorize `joinRoom` bằng `canJoinConversation`, chỉ client có quyền trong hội thoại nhận được event. Frontend lắng nghe event cùng lifecycle socket hiện có và thay toàn bộ state pin theo payload; event đến trước response HTTP vẫn không tạo bản sao.

## Frontend state và UI

`InboxPage` sở hữu state `pinnedMessages` của hội thoại đang mở:

- Khi đổi `activeId`, reset state rồi gọi `GET /pins`.
- Gọi POST/DELETE và thay state bằng response server.
- Khi nhận socket event của `activeId`, thay state ngay lập tức.
- Nếu request lỗi, giữ state cũ và hiển thị lỗi nhẹ trong thanh pin; không làm mất messages.

`ChatWindow` nhận `pinnedMessages`, `onPinMessage` và `onUnpinMessage`:

- Hover một message: cụm reaction/reply/more hiện tại được thay bằng duy nhất nút `Ghim tin nhắn`; message đã ghim hiển thị trạng thái `Đã ghim` và nút chuyển thành `Bỏ ghim` để tránh thao tác lặp.
- Trạng thái `Đã ghim` nằm cạnh/dưới bubble, không phủ lên nội dung hoặc delivery indicator.
- Thanh pin nằm cố định phía trên vùng lịch sử chat, nền trắng, bo góc và shadow nhẹ; bên trái là vòng tròn xám có icon pin.
- Nội dung thanh pin hiển thị `Tin đã ghim · n/10` và quote một dòng có ellipsis.
- Click phần nội dung thanh pin gọi `scrollIntoView({ behavior: "smooth", block: "center" })` trên message gốc.
- Nút bỏ ghim có `stopPropagation()` để không kích hoạt scroll; chỉ hiện khi hover/focus thanh pin.
- Nếu có nhiều pin, thanh pin hiển thị pin mới nhất và có nút chuyển trước/sau trong cùng thanh; chỉ số vẫn là vị trí hiện tại trên tổng số.

Message article cần id DOM ổn định (`data-message-id` hoặc `id` được encode an toàn) để scroll không phụ thuộc vị trí pagination.

## Tương tranh và lỗi

- Pin/bỏ ghim được thực hiện bằng update MongoDB có điều kiện conversation access; service luôn đọc lại danh sách canonical trước khi trả response.
- Client không optimistic thay danh sách pin trước response vì socket và HTTP có thể đến khác thứ tự; response/event đều thay toàn bộ danh sách canonical.
- Nếu message bị xóa hoặc không còn đọc được, service không tạo pin mới; danh sách hiện tại được lọc bỏ reference không hợp lệ khi đọc.
- Nếu message cũ chưa nằm trong page hiện tại, thanh pin vẫn hiển thị quote từ API; click chỉ scroll được khi message đã được tải. Bản MVP giữ pagination hiện tại và ghi rõ đây là giới hạn.

## Kiểm thử và nghiệm thu

- Contract/schema: validate messageId, giới hạn 10, payload pin.
- Service: pin thành công, từ chối conversation/message khác quyền, chống trùng, giới hạn 10, bỏ ghim.
- Controller/routes: auth, status code, emit socket sau update thành công và không emit khi lỗi.
- Realtime: event dùng đúng conversation room.
- Frontend: thanh pin, quote ellipsis, nút hover, `stopPropagation`, scroll tới message, cập nhật state từ socket.
- Regression: test Inbox/ChatWindow, API test liên quan, TypeScript, web build và `git diff --check`.
