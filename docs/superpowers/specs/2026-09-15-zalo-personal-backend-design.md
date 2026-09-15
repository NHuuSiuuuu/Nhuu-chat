# Thiết kế backend kết nối Zalo cá nhân qua QR

**Ngày:** 2026-09-15
**Trạng thái:** Chờ người dùng review
**Phạm vi:** Backend thử nghiệm, không thay đổi frontend trong phase này

## 1. Bối cảnh và mục tiêu

Nhuu-chat hiện đã có canonical conversation/message flow và connector Telegram. Mục tiêu của phase này là bổ sung connector backend cho một tài khoản Zalo cá nhân do owner tự đăng nhập bằng QR, để nhận và gửi tin nhắn qua Inbox hiện có.

Connector sử dụng `zca-js`, một API không chính thức mô phỏng Zalo Web. Đây là tính năng thử nghiệm; tài khoản có thể bị giới hạn hoặc khóa, API có thể hỏng khi Zalo thay đổi giao thức, và mỗi tài khoản chỉ được chạy một web listener tại một thời điểm. Không hỗ trợ lấy cookie thủ công từ DevTools hoặc kết nối tài khoản của người khác.

## 2. Phạm vi

### Bao gồm

- Tạo phiên đăng nhập QR cho owner hiện tại.
- Trả trạng thái phiên để UI hiện có polling.
- Lưu session sau khi đăng nhập thành công bằng mã hóa at-rest.
- Khởi động, dừng và khôi phục listener Zalo cá nhân.
- Chuẩn hóa tin nhắn direct/group về model chung của Nhuu-chat.
- Gửi tin nhắn văn bản từ endpoint gửi tin nhắn hiện có.
- Chống xử lý trùng inbound và chống chạy nhiều listener cho cùng owner.
- Phân quyền admin và cô lập dữ liệu theo owner.
- Unit/integration tests và log lỗi không chứa session secret.

### Không bao gồm

- Thay đổi UI, route frontend hoặc thiết kế QR.
- Zalo Official Account/OpenAPI.
- Facebook, Instagram hoặc các connector khác.
- Lấy session/cookie bằng thao tác thủ công.
- Đầy đủ media, gọi thoại/video, tìm kiếm bạn bè hoặc đồng bộ lịch sử cũ.
- Chatbot RAG trong phase kết nối; chỉ phát sự kiện inbound để flow chatbot hiện có có thể tích hợp sau.

## 3. Quyết định kiến trúc

### 3.1. Adapter tách khỏi session manager

Tạo module `apps/api/src/channels/zalo-personal/` gồm:

- `zalo-personal.client.ts`: lớp bọc tối thiểu quanh `zca-js` cho QR login, login bằng credentials đã lưu, listener và gửi text.
- `zalo-personal.schemas.ts`: schema cho trạng thái phiên và payload chuẩn hóa.
- `zalo-personal.normalizer.ts`: chuyển event direct/group của Zalo sang `NormalizedInboundMessage` dùng chung.

`ZaloPersonalSessionManager` trong service chịu trách nhiệm vòng đời phiên, không để controller truy cập trực tiếp vào instance `zca-js`. Manager giữ instance runtime trong memory, còn credentials được đọc từ storage đã giải mã khi khởi động/reconnect.

### 3.2. Một listener cho mỗi owner

Mỗi owner chỉ có một Zalo personal session active. Trước khi bắt đầu listener, service phải:

1. Kiểm tra session runtime hiện tại.
2. Dùng distributed lock Redis nếu deployment có nhiều process.
3. Dừng/giải phóng instance cũ trước khi tạo instance mới.
4. Ghi trạng thái chuyển tiếp để request polling không nhận trạng thái sai.

Trong phase thử nghiệm, nếu Redis không khả dụng thì không tự chạy song song; service trả lỗi cấu hình thay vì cố khởi động hai listener.

### 3.3. Không lưu QR lâu dài

QR và callback data chỉ tồn tại trong memory của phiên đang chờ quét. API status trả `qrData` tạm thời cho UI hiện có; không lưu QR vào MongoDB, log hoặc secret storage. Phiên QR có thời hạn và khi hết hạn chuyển sang `expired`, yêu cầu tạo phiên mới.

## 4. Dữ liệu và bảo mật

### 4.1. Session record

Thêm model MongoDB `ZaloPersonalSession` với các trường tối thiểu:

- `ownerId`: owner sở hữu kết nối, index và unique theo owner.
- `status`: `disconnected | waiting_qr | connected | expired | error`.
- `displayName`, `username`, `zaloUserId`: metadata không nhạy cảm nếu API cung cấp.
- `encryptedCredentials`: credentials cần cho reconnect, mã hóa bằng secret storage hiện có.
- `qrSessionId`, `qrExpiresAt`, `lastErrorCode`, `connectedAt`, `lastSeenAt`.

Không ghi plaintext cookie, IMEI, user-agent hoặc serialized credentials vào document, log, response lỗi hay telemetry.

### 4.2. Quyền và cô lập owner

- Các endpoint quản lý Zalo yêu cầu JWT và role `admin`.
- Mọi truy vấn session, conversation và outbound connector đều lọc theo owner đã xác thực.
- Không nhận `ownerId` từ body để quyết định quyền sở hữu.
- `platform` canonical là `zalo_personal`; `channelId` là Zalo user id của tài khoản đã kết nối.
- `channelScope` dùng định danh `zalo_personal:<zaloUserId>` khi chọn trợ lý.

## 5. API contract

Tất cả route dùng prefix `/api/v1/channels/zalo-personal` và JWT admin.

### `POST /qr`

Tạo hoặc thay thế phiên QR của owner hiện tại.

Response thành công:

```json
{
  "id": "qr-session-id",
  "status": "waiting_qr",
  "qrData": "temporary-zca-qr-data",
  "expiresAt": "2026-09-15T16:00:00.000Z"
}
```

Nếu đã có listener active, service phải trả phiên đang kết nối hoặc lỗi business rõ ràng, không tạo listener thứ hai âm thầm.

### `GET /qr/:id`

Trả trạng thái phiên QR thuộc owner hiện tại. Các trạng thái:

- `waiting_qr`: đang chờ quét, có thể có `qrData` và `expiresAt`.
- `connected`: đã đăng nhập, có metadata tài khoản.
- `expired`: QR hết hạn.
- `error`: lỗi kết nối, có `errorCode` an toàn.

Không trả credentials trong bất kỳ trạng thái nào.

### `GET /status`

Trả trạng thái kết nối hiện tại của owner để dashboard kiểm tra sau reload.

### `POST /logout`

Dừng listener runtime, xóa credentials đã mã hóa và chuyển session về `disconnected`. Response không chứa dữ liệu nhạy cảm.

## 6. Luồng inbound

1. `zca-js` phát event message.
2. Normalizer xác định direct/group, sender id, thread id, text/media metadata và external message id.
3. Inbound service bỏ qua event do chính tài khoản gửi để tránh vòng lặp.
4. Message service upsert customer theo `{ platform: "zalo_personal", platformId: senderId }`.
5. Tìm hoặc tạo conversation theo owner, platform và thread/channel id.
6. Ghi message với `senderType: "customer"`, external id và delivery state phù hợp.
7. Cập nhật conversation summary/unread count và phát Socket.IO event cho owner/assigned agent.
8. Không để lỗi gửi chatbot làm mất việc acknowledge và lưu inbound message.

Idempotency key là `zalo_personal:<accountId>:<externalMessageId>`. Event thiếu external id phải được ghi nhận với quy tắc fallback ổn định hoặc bỏ qua có log mã lỗi không nhạy cảm.

## 7. Luồng outbound

Endpoint `POST /api/v1/messages/send` hiện có sẽ định tuyến `platform === "zalo_personal"` tới session manager. Service phải:

- xác nhận conversation thuộc owner của request;
- kiểm tra session đang `connected`;
- gửi text qua adapter;
- lưu external message id và delivery status;
- cập nhật `botPausedUntil` theo quy tắc outbound hiện có;
- trả lỗi rõ ràng nếu session hết hạn hoặc connector không hoạt động.

Retry outbound chỉ dùng cơ chế retry bounded hiện có; không retry vô hạn và không gửi trùng khi kết quả trước đó chưa xác định.

## 8. Xử lý lỗi và vòng đời

- QR tạo thất bại: `error`, mã `ZALO_QR_CREATE_FAILED`.
- QR hết hạn: `expired`, cho phép tạo phiên mới.
- Quét thành công nhưng lưu session thất bại: không báo connected bền vững; log mã lỗi và yêu cầu đăng nhập lại.
- Listener bị ngắt: cập nhật `error` hoặc `expired` theo nguyên nhân, thử reconnect có giới hạn và backoff.
- Logout: dừng listener trước, sau đó xóa credential; nếu dừng thất bại phải giữ trạng thái lỗi để không tạo listener cạnh tranh.
- Server restart: đọc credential đã mã hóa, kiểm tra đăng nhập và chỉ khởi động listener khi session hợp lệ.

## 9. Kiểm thử và tiêu chí nghiệm thu

### Unit

- Normalizer xử lý direct message, group message, self-message và payload thiếu trường.
- State machine chuyển đúng giữa `disconnected`, `waiting_qr`, `connected`, `expired`, `error`.
- Credentials không xuất hiện trong serialized response hoặc log helper.
- Owner isolation từ chối truy cập session/QR của owner khác.

### Integration

- `POST /qr` trả QR session và không ghi QR/credentials vào MongoDB.
- `GET /qr/:id` chỉ đọc được phiên của owner hiện tại.
- Polling chuyển sang `connected` sau event login thành công.
- Logout dừng listener và xóa encrypted credentials.
- Inbound direct/group tạo customer, conversation, message đúng canonical fields.
- Replay cùng external id chỉ tạo một message.
- Self-message không tạo inbound message.
- Outbound Zalo route gửi đúng session và giữ delivery failure traceable.
- Không thể tạo hai listener cho cùng owner, kể cả khi hai request bắt đầu đồng thời.

### Nghiệm thu thủ công

1. Admin mở UI kết nối Zalo hiện có và gọi tạo QR.
2. Quét QR bằng chính tài khoản Zalo cá nhân.
3. UI polling nhận `connected` sau khi backend cập nhật trạng thái.
4. Một tài khoản khác gửi tin direct và group; cả hai xuất hiện trong Inbox realtime.
5. Nhân viên trả lời từ Inbox; tin đi tới đúng thread Zalo.
6. Restart backend và xác nhận session reconnect hoặc hiển thị trạng thái cần đăng nhập lại.
7. Logout rồi xác nhận connector không còn nhận/gửi tin.

## 10. Giới hạn vận hành và kế hoạch sau phase này

Connector phụ thuộc vào giao thức không chính thức của Zalo Web, nên không có SLA tương thích. Cần chạy trên process có vòng đời ổn định, theo dõi reconnect/error rate và có cơ chế tắt connector khi thư viện không tương thích.

Sau khi inbound/outbound ổn định mới thiết kế phase chatbot RAG cho `zalo_personal`. Khi cần khả năng production ổn định, nên chuyển sang Zalo OA/OpenAPI thay vì mở rộng automation tài khoản cá nhân.
