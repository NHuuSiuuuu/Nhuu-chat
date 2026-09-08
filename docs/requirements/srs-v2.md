# Đặc tả Yêu cầu Phần mềm (SRS - Software Requirement Specification)

## Tên dự án: Hệ thống Quản lý Chăm sóc Khách hàng Đa kênh (Omnichannel) & Trợ lý ảo AI thông minh

---

## 1. Kiến trúc hệ thống & Công nghệ sử dụng

Hệ thống được thiết kế theo kiến trúc hướng sự kiện (event-driven) giữa Client và Server để đảm bảo tốc độ phản hồi thời gian thực:

```
+------------------------------------------------------------+
|                        FRONTEND CLIENT                     |
|            ReactJS + TypeScript SPA (Vite / Tailwind)       |
+------------------------------+-----------------------------+
                               | (HTTP REST / WebSocket IO)
                               v
+------------------------------------------------------------+
|                        BACKEND SERVER                      |
|                Node.js + ExpressJS (Stateless)             |
+----+-------------------+-----+-----------------------+-----+
     |                   |     |                       |
     v                   v     v                       v
+---------+         +---------+ +-----------------+ +--------+
| MongoDB |         |  Redis  | |   Vector DB     | | External|
| (NoSQL) |         | (Cache/ | | (Chroma/MongoDB | |  APIs  |
|         |         | PubSub) | | Vector Search)  | |        |
+---------+         +---------+ +-----------------+ +--------+
```

### 1.1. Công nghệ sử dụng
* **Frontend:** ReactJS, TypeScript, TailwindCSS để xây dựng giao diện; Axios để gọi REST API; Socket.io-client để kết nối WebSocket thời gian thực.
* **Backend:** Node.js, ExpressJS để xây dựng RESTful API; Mongoose để kết nối và thao tác với MongoDB; Socket.io để thiết lập WebSocket Server; Redis (thông qua thư viện `ioredis`) để làm cache và quản lý sự kiện.
* **Cơ sở dữ liệu & Bộ nhớ đệm:** MongoDB dùng làm cơ sở dữ liệu lưu trữ chính; Redis đóng vai trò lưu trữ phiên làm việc (session cache), làm adapter đồng bộ kênh Socket.IO giữa các máy chủ (Socket.IO Redis Adapter), và làm bộ giới hạn tần suất gọi API (API Rate Limiter).
* **Hệ sinh thái AI:** OpenAI API hoặc Gemini API; LangChain hoặc mã nguồn tự xây dựng quy trình RAG; Sử dụng cơ chế tìm kiếm Vector của MongoDB Atlas Vector Search hoặc cơ sở dữ liệu vector gọn nhẹ ChromaDB.
* **Kênh kết nối tích hợp:** Meta Graph API (cho Facebook & Instagram); Thư viện `zca-js` để kết nối Zalo cá nhân thông qua Session Cookies; Telegram Bot API để quản lý bot Telegram.

---

## 2. Thiết kế Cơ sở dữ liệu (MongoDB thông qua Mongoose)

Dưới đây là thiết kế chi tiết cấu trúc các bảng (Mongoose Schemas) phục vụ cho dự án để các công cụ AI hỗ trợ sinh mã nguồn chuẩn xác.

### 2.1. Bảng Khách hàng (`customers`)
Lưu trữ thông tin hồ sơ của khách hàng được thu thập tập trung từ tất cả các kênh nhắn tin kết nối vào hệ thống.

```typescript
const CustomerSchema = new Schema({
  name: { type: String, required: true },
  avatarUrl: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  email: { type: String, default: "" },
  platform: { type: String, enum: ["facebook", "instagram", "zalo", "telegram"], required: true },
  platformId: { type: String, required: true, index: true }, // ID định danh của khách hàng trên nền tảng đó
  tags: [{ type: String, index: true }], // Hệ thống nhãn phân loại tự định nghĩa e.g. ["VIP", "Lead"]
  notes: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

// Đảm bảo tính duy nhất của một khách hàng trên một nền tảng
CustomerSchema.index({ platform: 1, platformId: 1 }, { unique: true });
```

### 2.2. Bảng Hội thoại (`conversations`)
Liên kết giữa kênh nhắn tin, khách hàng, nhân viên tư vấn được phân công và lưu trạng thái bật/tắt Bot.

```typescript
const ConversationSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
  platform: { type: String, enum: ["facebook", "instagram", "zalo", "telegram"], required: true },
  channelId: { type: String, required: true }, // ID của Trang Facebook, ID của Zalo OA, hoặc Số điện thoại Zalo cá nhân
  assignedAgentId: { type: Schema.Types.ObjectId, ref: "Agent", default: null, index: true }, // Nhân viên được phân công xử lý
  unreadCount: { type: Number, default: 0 }, // Số lượng tin nhắn chưa đọc
  status: { type: String, enum: ["open", "pending", "closed"], default: "open", index: true },
  botPausedUntil: { type: Date, default: null }, // Mốc thời gian tạm dừng hoạt động của AI Bot (Bot Pause)
  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastMessageSnippet: { type: String, default: "" } // Đoạn trích dẫn tin nhắn mới nhất để hiển thị ngoài danh sách
});
```

### 2.3. Bảng Tin nhắn (`messages`)
Lưu trữ tất cả nội dung tin nhắn đi và đến từ mọi kênh nhắn tin kết nối.

```typescript
const MessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  senderType: { type: String, enum: ["customer", "agent", "bot"], required: true },
  senderId: { type: String, required: true }, // MongoID của Agent, Platform ID của khách hàng, hoặc "AI_BOT"
  type: { type: String, enum: ["text", "image", "video", "audio", "file", "template"], default: "text" },
  content: { type: String, default: "" },
  attachments: [{
    url: { type: String, required: true },
    fileType: { type: String, required: true }, // Định dạng tệp (MIME type e.g. image/png)
    fileName: { type: String }
  }],
  metadata: {
    messageId: { type: String, index: true }, // ID tin nhắn gốc từ API bên ngoài (để đối chiếu hoặc cập nhật trạng thái)
    callDuration: { type: Number }, // Thời lượng cuộc gọi (chỉ áp dụng cho tin nhắn cuộc gọi WebRTC)
    callStatus: { type: String, enum: ["init", "ringing", "accepted", "rejected", "ended"] }
  },
  createdAt: { type: Date, default: Date.now, index: true }
});
```

### 2.4. Bảng Cơ sở tri thức (`knowledge_bases`)
Lưu trữ các đoạn tài liệu và các vector biểu diễn tương ứng phục vụ cho việc tìm kiếm ngữ nghĩa trong luồng RAG.

```typescript
const KnowledgeBaseSchema = new Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  embedding: { type: [Number], required: true }, // Mảng số thực (float) biểu diễn vector (ví dụ 1536 chiều của OpenAI)
  sourceUrl: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now }
});
```

---

## 3. Giao thức truyền thông & Đặc tả API

### 3.1. Các RESTful API chính

Tất cả các tuyến đường (route) của quản trị viên đều được cấu hình với tiền tố `/api/v1` và được bảo vệ bằng cơ chế xác thực JWT Bearer token qua Header.

#### 3.1.1. Thiết lập kết nối kênh Zalo cá nhân
* **Endpoint:** `POST /api/v1/channels/zalo/qr-login`
  * **Mô tả:** Gọi thư viện `zca-js` để sinh mã QR đăng nhập.
  * **Dữ liệu trả về (Response):**
    ```json
    {
      "success": true,
      "qrCodeUrl": "https://zalo.me/g/xyz...",
      "sessionId": "zalo_session_temp_9201"
    }
    ```
* **Endpoint:** `POST /api/v1/channels/zalo/session-check`
  * **Mô tả:** Kiểm tra xem người dùng đã quét mã QR thành công chưa và lấy trạng thái Cookie.
  * **Dữ liệu gửi lên (Payload):** ` { "sessionId": "string" } `
  * **Dữ liệu trả về (Response):**
    ```json
    {
      "success": true,
      "status": "connected",
      "cookieValidity": "2026-10-07T21:00:00Z"
    }
    ```

#### 3.1.2. Lấy danh sách hội thoại Live Chat
* **Endpoint:** `GET /api/v1/conversations`
  * **Tham số truy vấn (Query Params):** `page=1`, `limit=20`, `platform=facebook`, `tag=VIP`, `status=open`
  * **Dữ liệu trả về (Response):**
    ```json
    {
      "conversations": [...],
      "total": 142
    }
    ```

#### 3.1.3. Gửi tin nhắn thủ công từ nhân viên
* **Endpoint:** `POST /api/v1/messages/send`
  * **Dữ liệu gửi lên (Payload):**
    ```json
    {
      "conversationId": "65e23abc9102ef1234abcd01",
      "type": "text",
      "content": "Chào quý khách, tôi có thể hỗ trợ gì?",
      "attachments": []
    }
    ```
  * **Dữ liệu trả về (Response):** Trả về đối tượng Message chuẩn vừa được tạo trong database.
  * **Logic kích hoạt nền (Trigger):** Ngay khi API này được gọi thành công, hệ thống gửi tin nhắn đến API của nền tảng bên ngoài (Meta, Zalo, Telegram...) đồng thời thiết lập trường `botPausedUntil` bằng mốc thời gian hiện tại cộng thêm 30 phút nhằm kích hoạt cơ chế Tạm dừng Bot.

---

### 3.2. Đặc tả sự kiện thời gian thực (Socket.IO Events API)

Để hỗ trợ chạy đa máy chủ ổn định, hệ thống sử dụng Redis Adapter làm cầu nối truyền tin trung gian (Pub/Sub) giữa các phiên Socket.IO độc lập.

#### 3.2.1. Sự kiện từ Máy chủ đến Trình duyệt (Inbound stream)
* `chat:message_received`: Phát đi khi hệ thống tiếp nhận một tin nhắn mới từ Webhook bên ngoài hoặc tin nhắn do nhân viên/bot gửi đi thành công.
  ```json
  {
    "conversationId": "65e23abc9102ef1234abcd01",
    "message": { "senderType": "customer", "content": "Xin chào!", "createdAt": "..." }
  }
  ```
* `chat:conversation_updated`: Phát đi khi trạng thái của một hội thoại thay đổi (thay đổi người phụ trách, số tin nhắn chưa đọc tăng lên, gắn thẻ tag phân loại mới, thứ tự ưu tiên của hội thoại thay đổi ngoài danh sách).
* `call:status_changed`: Phát đi khi trạng thái cuộc gọi thoại/video thay đổi thời gian thực.
  ```json
  {
    "conversationId": "65e23abc9102ef1234abcd01",
    "status": "ringing",
    "callerId": "customer_id"
  }
  ```

#### 3.2.2. Sự kiện từ Trình duyệt đến Máy chủ (Outbound interactions)
* `chat:agent_typing`: Gửi lên khi nhân viên đang gõ chữ. Sự kiện này được truyền phát đến các nhân viên khác đang cùng xem phòng chat để tránh trùng lặp tư vấn.
* `chat:join_room`: Đưa kết nối của nhân viên vào phòng làm việc riêng biệt của hội thoại (`conversation:${id}`) để nhận các sự kiện tin nhắn nội bộ của phòng đó.

---

## 4. Các luồng xử lý chính

### 4.1. Luồng tiếp nhận Webhook & Xử lý tin nhắn đến
1. **Webhook tiếp nhận dữ liệu:** Đầu vào Webhook nhận một HTTP POST payload từ nền tảng nhắn tin bên ngoài (ví dụ Facebook, Instagram, Telegram, Zalo) gửi tới Endpoint `/api/v1/webhooks/instagram`.
2. **Xác thực chữ ký bảo mật:** Kiểm tra và xác thực các HTTP Header chữ ký bảo mật (như X-Hub-Signature từ Meta) để ngăn chặn các yêu cầu giả mạo từ hacker.
3. **Phân tích Payload:** Trích xuất thông tin ID người gửi, nội dung tin nhắn dạng văn bản hoặc tệp đính kèm đi kèm.
4. **Chuẩn hóa dữ liệu:** Tìm kiếm khách hàng theo ID nền tảng. Nếu là khách hàng mới, tự động tạo một bản ghi Customer mới trong MongoDB; chuẩn hóa dữ liệu tin nhắn về cấu trúc lưu trữ nội bộ của hệ thống.
5. **Ghi nhận dữ liệu:** Tạo bản ghi tin nhắn mới trong bảng `messages` và cập nhật thông tin mốc thời gian tin nhắn cuối cùng, nội dung snippet, tăng số lượng unreadCount trong bảng `conversations`.
6. **Truyền phát thời gian thực:** Gửi sự kiện Socket.IO `chat:message_received` kèm nội dung tin nhắn chuẩn hóa tới các Client đang kết nối để cập nhật khung chat Live Chat lập tức.
7. **Đánh giá phản hồi tự động (AI Check):** Kiểm tra trạng thái `botPausedUntil` trong bản ghi Conversation. Nếu trường này là `null` hoặc nhỏ hơn thời gian hiện tại, hệ thống chuyển tin nhắn sang luồng xử lý RAG để tự động phản hồi cho khách hàng.

---

### 4.2. Luồng xử lý của Chatbot AI RAG

```
+--------------------+      +-------------------------+      +-----------------------+
| Tin nhắn khách     | ---> | Bot có bị tạm dừng?    | -Không-> | Tạo Vector nhúng &    |
| gửi đến Webhook    |      | Kiểm tra botPausedUntil |      | Tìm Cosine tương đồng |
+--------------------+      +-------------------------+      +-----------+-----------+
                                         | Có                            |
                                         v                               v
                                  +------------+              +----------------------+
                                  | Dừng Bot.  |              | Trích xuất tài liệu  |
                                  | Chỉ Nhân   |              | liên quan nhất       |
                                  | viên trả   |              +-----------+-----------+
                                  | lời.       |                         |
                                  +------------+                         v
                                                              +----------------------+
                                                              | Đưa ngữ cảnh & câu   |
                                                              | hỏi vào mô hình LLM  |
                                                              +-----------+-----------+
                                                                         |
                                                                         v
                                                              +----------------------+
                                                              | Gọi API của kênh để  |
                                                              | gửi câu trả lời tự   |
                                                              | động của AI          |
                                                              +----------------------+
```

* **Xử lý tìm kiếm ngữ nghĩa:** Hệ thống sử dụng mô hình nhúng (Embedding) để chuyển câu hỏi khách hàng thành vector, sau đó tính khoảng cách Cosine tương đồng với trường `embedding` trong bảng `knowledge_bases` để tìm ra các đoạn tri thức liên quan nhất.
* **Mẫu cấu trúc Prompt (Prompt Template):**
  ```text
  Bạn là Trợ lý ảo AI thông minh hỗ trợ khách hàng đa kênh.
  Hãy trả lời câu hỏi dựa trên tài liệu cậy tin sau đây:
  ---
  {RETRIEVED_CONTEXT}
  ---
  Câu hỏi khách hàng: {CUSTOMER_QUESTION}

  Yêu cầu: Nếu tài liệu không chứa thông tin trả lời, hãy phản hồi: "Hiện tại tôi chưa có thông tin chính xác về vấn đề này. Tôi xin phép kết nối bạn tới nhân viên tư vấn để hỗ trợ tốt nhất." và tuyệt đối không bịa đặt thông tin.
  ```

---

## 5. Triển khai, Môi trường & Chiến lược Kiểm thử

### 5.1. Cấu hình Docker (Phục vụ lập trình cục bộ - Local Sandbox)
Để khởi tạo nhanh môi trường phát triển và bắt đầu quá trình Vibe Coding, sử dụng tệp cấu hình `docker-compose.yml` chuẩn hóa dưới đây:

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7.0
    ports:
      - "6379:6379"

volumes:
  mongo_data:
```

### 5.2. Danh sách kiểm tra xác thực cục bộ (Local Verification Checklist)
* Sử dụng các công cụ kiểm thử như Postman hoặc Thunder Client để giả lập (mock) các payload Webhook gửi đến API Backend, đảm bảo hệ thống parse dữ liệu và lưu database đúng quy chuẩn.
* Kiểm thử khả năng chịu tải của các kết nối WebSocket thời gian thực bằng công cụ kiểm thử tải (Load Testing) như `k6` hoặc `artillery`.
* Kiểm thử độ chính xác của câu trả lời từ AI RAG bằng cách nạp thử các file tài liệu dạng PDF/DOCX có nội dung sản phẩm giả định, đặt câu hỏi kiểm tra xem Bot có trích xuất đúng thông tin hay không và kiểm tra phản cảm xúc khách hàng.
