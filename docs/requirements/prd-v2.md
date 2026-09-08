# Tài liệu Yêu cầu Sản phẩm (PRD - Product Requirement Document)

## Tên dự án: Hệ thống Quản lý Chăm sóc Khách hàng Đa kênh (Omnichannel) & Trợ lý ảo AI thông minh

---

## 1. Tóm tắt dự án & Tầm nhìn

### 1.1. Bối cảnh & Vấn đề thực tế
Trong môi trường kinh doanh số hiện nay, các doanh nghiệp và cá nhân bán hàng tương tác với khách hàng qua rất nhiều kênh liên lạc trực tuyến khác nhau như Facebook Messenger, Instagram Direct, Zalo (bao gồm cả Zalo Official Account và Zalo cá nhân) và Telegram. Tuy nhiên, việc quản lý các cuộc hội thoại một cách riêng rẽ trên từng ứng dụng dẫn đến nhiều vấn đề lớn:
* Trải nghiệm khách hàng bị phân mảnh, không nhất quán.
* Thời gian phản hồi bị chậm trễ do nhân viên phải chuyển đổi liên tục giữa các tab hoặc ứng dụng khác nhau.
* Dễ bỏ sót tin nhắn của khách hàng, gây mất cơ hội kinh doanh.
* Chi phí vận hành cao khi quy mô khách hàng tăng lên nhưng quy trình xử lý vẫn hoàn toàn thủ công.

### 1.2. Tầm nhìn sản phẩm
Hệ thống được xây dựng nhằm mục tiêu hợp nhất toàn bộ các kênh giao tiếp phổ biến về một cửa sổ quản trị duy nhất (**Live Chat Dashboard** thời gian thực). Hệ thống đồng bộ hóa toàn bộ lịch sử trò chuyện, thông tin khách hàng và dữ liệu tương tác một cách tập trung. 

Điểm nhấn học thuật và kỹ thuật của hệ thống là việc tích hợp **Trợ lý ảo AI thông minh hoạt động theo cơ chế RAG (Retrieval-Augmented Generation)**. Trợ lý ảo này tự động truy vấn dữ liệu từ bộ cơ sở tri thức (Knowledge Base) do doanh nghiệp cung cấp để phản hồi khách hàng chính xác, 24/7 theo ngữ cảnh cụ thể, kết hợp với cơ chế bàn giao thông minh cho nhân viên tư vấn khi cần thiết.

### 1.3. Định hướng Vibe Coding
Tài liệu này được biên soạn bằng tiếng Việt chi tiết, chuẩn hóa cấu trúc để người dùng dễ dàng đọc hiểu toàn bộ quy trình nghiệp vụ, đồng thời cung cấp các đặc tả hành vi chính xác để các công cụ AI hỗ trợ lập trình (Vibe Coding như Cursor, Windsurf, v.v.) có thể đọc và chuyển đổi trực tiếp thành mã nguồn sạch, hoạt động chuẩn xác theo nghiệp vụ.

---

## 2. Chân dung người dùng (User Personas)

| Vai trò | Mô tả | Mục tiêu chính | Khó khăn / Điểm đau |
| :--- | :--- | :--- | :--- |
| **Nhân viên tư vấn** (Agent) | Người trực tiếp trò chuyện và chăm sóc khách hàng hàng ngày. | Phản hồi khách hàng nhanh chóng, phân loại khách hàng bằng nhãn (tag), xử lý nhiều hội thoại cùng lúc hiệu quả. | Phải chuyển đổi liên tục giữa nhiều tab; trả lời các câu hỏi lặp đi lặp lại; thiếu thông tin lịch sử của khách hàng khi nhận bàn giao chat. |
| **Quản trị viên / Quản lý** (Admin/Supervisor) | Người điều hành hệ thống, giám sát nhân viên và cấu hình kịch bản. | Giám sát hiệu suất tư vấn, quản lý danh mục tài liệu tri thức cho AI, thiết lập các kênh kết nối đa nền tảng. | Thiếu cái nhìn tổng quan về các kênh; không cấu hình được chatbot thông minh tự động trả lời theo tài liệu sản phẩm mới mà không cần lập trình phức tạp. |
| **Khách hàng cuối** (End Customer) | Khách hàng tương tác với doanh nghiệp qua mạng xã hội. | Nhận được câu trả lời chính xác, tức thì trên kênh nhắn tin mà họ ưu tiên sử dụng. | Thời gian phản hồi chậm; gặp phải các kịch bản chatbot cứng nhắc, không hiểu đúng nhu cầu thực tế của mình. |

---

## 3. Phạm vi sản phẩm & Các phân hệ cốt lõi

Hệ thống được module hóa thành bốn phân hệ cốt lõi:
1. **Bộ kết nối đa kênh (Omnichannel Connector Core):** Thiết lập và duy trì các đường truyền (tunnel) hoạt động hai chiều với Facebook Messenger, Instagram Direct, Zalo (Zalo OA và Zalo cá nhân qua cookie) và Telegram.
2. **Trung tâm Live Chat thời gian thực (Real-time Live Chat Center):** Hộp thư chung (unified inbox) hỗ trợ phân chia hội thoại cho nhân viên, nhắn tin đa phương tiện, lọc hội thoại và cập nhật trạng thái thời gian thực.
3. **Công cụ tri thức AI (RAG Engine):** Lớp xử lý thông minh đảm nhiệm việc tách nhỏ tài liệu doanh nghiệp, chuyển đổi thành vector (vectorize), lưu trữ và thực hiện tìm kiếm ngữ nghĩa để cung cấp ngữ cảnh chính xác cho mô hình ngôn ngữ lớn (LLM) tạo câu trả lời.
4. **Bộ điều phối lai Nhân viên - Bot (Agent-Bot Hybrid Orchestrator):** Quản lý trạng thái hoạt động song song giữa người và máy thông qua cơ chế **Tạm dừng Bot (Bot Pause)** khi nhân viên can thiệp thủ công, tránh xung đột gửi tin nhắn đồng thời.

---

## 4. Yêu cầu tính năng & Đặc tả chức năng

### 4.1. Bộ kết nối đa kênh (Omnichannel Integration Engine)

#### 4.1.1. Tích hợp Facebook Messenger & Instagram Direct (OAuth & Webhooks chính thức)
* **Mô tả:** Cho phép Admin kết nối các trang Facebook Page và tài khoản Instagram Professional thông qua luồng đăng nhập của Meta.
* **Đặc tả tính năng:**
  * Hỗ trợ luồng Meta OAuth 2.0 để lấy mã truy cập trang dài hạn (Long-Lived Page Access Token).
  * Xây dựng và duy trì các Endpoint Webhook hoạt động ổn định để nhận tin nhắn văn bản, hình ảnh, tệp đính kèm và các sự kiện gọi thoại từ Meta theo thời gian thực.
  * Chuẩn hóa cấu trúc dữ liệu nhận được từ Meta về cấu trúc dữ liệu chung của hệ thống.

#### 4.1.2. Tích hợp Zalo cá nhân (Cookie-based thông qua thư viện `zca-js`)
* **Mô tả:** Kết nối tài khoản Zalo cá nhân của doanh nghiệp (kênh không hỗ trợ API mở chuẩn hóa) bằng cách duy trì phiên làm việc dựa trên Cookie.
* **Đặc tả tính năng:**
  * Tạo và hiển thị mã QR đăng nhập Zalo lấy từ thư viện `zca-js` lên màn hình cấu hình.
  * Lắng nghe sự kiện quét mã QR thành công từ ứng dụng di động để bắt lấy Cookie phiên làm việc (Session Cookies).
  * Thiết lập một kết nối persistent websocket/polling để nhận và gửi tin nhắn thời gian thực qua máy chủ Zalo.
  * Mã hóa an toàn và lưu trữ Cookie vào MongoDB, hỗ trợ cơ chế kiểm tra thời hạn (TTL) và tự động thiết lập lại kết nối khi Cookie còn hạn.

#### 4.1.3. Tích hợp Telegram
* **Mô tả:** Kết nối các Bot Telegram chuẩn thông qua Token xác thực để nhận diện và phản hồi khách hàng liên hệ qua Telegram.
* **Đặc tả tính năng:**
  * Cung cấp ô nhập liệu cho phép Admin lưu Token của Bot Telegram.
  * Tự động đăng ký webhook của hệ thống với máy chủ Telegram (`setWebhook`) ngay khi lưu Token thành công.

---

### 4.2. Trung tâm Live Chat thời gian thực (Omnichannel Inbox)

#### 4.2.1. Quản lý danh sách hội thoại tập trung (Conversation List)
* **Mô tả:** Giao diện danh sách bên trái hiển thị toàn bộ các cuộc hội thoại từ tất cả các kênh được kết nối, cập nhật tức thì khi có hoạt động mới mà không cần tải lại trang.
* **Đặc tả tính năng:**
  * Hiển thị các thông tin cơ bản: Ảnh đại diện khách hàng, Tên hiển thị, Biểu tượng nền tảng (Facebook, Instagram, Zalo, Telegram), nội dung tin nhắn mới nhất dạng snippet, thời gian cập nhật, trạng thái chưa đọc hoặc nhân viên đang xử lý.
  * **Thao tác hàng loạt (Bulk Actions):** Chọn nhiều hội thoại cùng lúc để thực hiện đánh dấu đã đọc/chưa đọc, xóa hội thoại, hoặc phân công cho một nhân viên cụ thể.
  * **Tìm kiếm & Bộ lọc nhanh:** Tìm kiếm hội thoại theo tên khách hàng hoặc số điện thoại. Lọc danh sách theo kênh kết nối, nhân viên đang phụ trách, hoặc nhãn phân loại (tags).

#### 4.2.2. Khung trò chuyện tương tác (Chat Window)
* **Mô tả:** Giao diện chính giữa nơi nhân viên tương tác trực tiếp với khách hàng của cuộc hội thoại được chọn.
* **Đặc tả tính năng:**
  * Hiển thị toàn bộ lịch sử tin nhắn dạng timeline, phân biệt rõ màu sắc/vị trí giữa tin nhắn của khách hàng và tin nhắn của nhân viên/hệ thống.
  * Hỗ trợ gửi và hiển thị đa phương tiện: văn bản, hình ảnh, video, tệp tài liệu, ghi âm giọng nói, nút trả lời nhanh (Quick Reply) và các mẫu tin nhắn (Template).
  * Hỗ trợ kéo thả (drag-and-drop) hoặc dán hình ảnh (paste từ clipboard) trực tiếp vào ô soạn thảo để gửi nhanh.
  * **Trích dẫn & Trả lời (Reply & Quote):** Nhân viên có thể nhấn chuột phải vào một tin nhắn cũ để trích dẫn trả lời, giữ vững ngữ cảnh giao tiếp.

#### 4.2.3. Gắn thẻ phân loại (Tagging)
* **Mô tả:** Gắn các thẻ nhãn dán trực tiếp lên khách hàng ngay trong phiên chat để dễ dàng phân nhóm (ví dụ: "Khách VIP", "Cần xử lý gấp", "Đã chốt đơn").
* **Đặc tả tính năng:**
  * Cho phép quản lý và áp dụng thẻ trực tiếp từ giao diện chat nhanh.
  * Hỗ trợ phím tắt nhanh (ví dụ: nhấn `Alt + 1` đến `Alt + 9` tương ứng với các thẻ từ 1 đến 9 được cấu hình sẵn) giúp tăng tốc độ thao tác của nhân viên.

#### 4.2.4. Gọi thoại & Gọi video thời gian thực (Facebook WebRTC Signaling)
* **Mô tả:** Nhân viên có thể thực hiện cuộc gọi thoại hoặc gọi video trực tiếp tới khách hàng đang nhắn tin qua Facebook Messenger từ giao diện Web.
* **Đặc tả tính năng:**
  * Điều phối tín hiệu kết nối cuộc gọi qua cơ chế signaling thông qua các API và sự kiện của Meta Messenger Platform.
  * Hiển thị thanh trạng thái cuộc gọi trực quan theo thời gian thực: Khởi tạo (`call:init`), Đang đổ chuông (`call:ringing`), Đã nhận cuộc gọi (`call:accepted`), Từ chối cuộc gọi (`call:rejected`), Kết thúc cuộc gọi (`call:ended`).
  * Lưu trữ thông tin cuộc gọi (thời điểm bắt đầu, kết thúc, thời lượng cuộc gọi) vào cơ sở dữ liệu MongoDB để thống kê.

---

### 4.3. Công cụ tri thức AI (Tích hợp RAG)

* **Mô tả:** Cho phép AI tự động học tài liệu sản phẩm và hỗ trợ nhân viên phản hồi khách hàng chính xác theo nội dung tri thức được cung cấp.
* **Đặc tả tính năng:**
  * **Cổng nạp tài liệu (Document Ingestion):** Cho phép Admin tải lên các tài liệu định dạng PDF, TXT, DOCX hoặc dán danh sách câu hỏi thường gặp (Q&A), đường dẫn website (URL).
  * **Hệ thống xử lý nền (Processing Pipeline):** Tự động phân tách tài liệu thành các đoạn văn bản (chunk) có độ dài tối ưu (ví dụ: 500 ký tự), gọi mô hình embedding (như `text-embedding-3-small`) để chuyển các chunk thành vector, và lưu trữ vector vào cơ sở dữ liệu (như MongoDB Atlas Vector Search hoặc ChromaDB).
  * **Luồng xử lý RAG thời gian thực:**
    1. Khi nhận tin nhắn mới từ khách hàng qua Webhook, hệ thống chuyển câu hỏi của khách hàng thành vector.
    2. Thực hiện tìm kiếm ngữ nghĩa (Semantic Search) để lấy ra top-K đoạn tài liệu có độ tương đồng cao nhất trong cơ sở tri thức.
    3. Tạo một Prompt có cấu trúc nghiêm ngặt chứa các đoạn tài liệu tìm được làm ngữ cảnh (Context) kèm câu hỏi của khách hàng.
    4. Gửi Prompt đến mô hình ngôn ngữ lớn (như GPT-4o hoặc Gemini 1.5 Flash) để sinh câu trả lời.
    5. Gửi nội dung câu trả lời tự động trở lại cho khách hàng thông qua API của kênh nhắn tin tương ứng.

---

### 4.4. Bộ điều phối lai Nhân viên - Bot (Cơ chế Tạm dừng Bot)

* **Mô tả:** Giải quyết triệt để vấn đề xung đột phản hồi khi cả Bot và nhân viên thật cùng trả lời một câu hỏi của khách hàng.
* **Đặc tả tính năng:**
  * Ngay khi nhân viên nhập văn bản và nhấn nút gửi tin nhắn thủ công trong khung chat, hệ thống tự động kích hoạt sự kiện **Tạm dừng Bot (Bot Pause)** đối với cuộc hội thoại đó.
  * Thời gian tạm dừng bot mặc định là 30 phút (có thể cấu hình lại trong phần cài đặt).
  * Trạng thái tạm dừng được cập nhật dưới dạng mốc thời gian `botPausedUntil` trong bản ghi Conversation tại MongoDB.
  * Luồng Webhook tiếp nhận tin nhắn luôn kiểm tra mốc thời gian này. Nếu thời gian hiện tại nhỏ hơn `botPausedUntil`, hệ thống hoàn toàn bỏ qua việc gọi RAG AI Chatbot, nhường toàn bộ quyền phản hồi cho nhân viên tư vấn.

---

## 5. Yêu cầu phi chức năng (Non-Functional Requirements)

* **Độ trễ thời gian thực (Real-time Latency):** Thời gian đồng bộ tin nhắn đi và đến giữa máy chủ và giao diện người dùng qua WebSockets phải dưới **300ms** trong điều kiện mạng bình thường.
* **Bảo mật dữ liệu:** Tất cả các OAuth Page Token, Token của Telegram và đặc biệt là Cookie đăng nhập của Zalo cá nhân phải được mã hóa ở mức lưu trữ (at rest) sử dụng thuật toán mã hóa mạnh **AES-256**.
* **Độ tin cậy & Cơ chế thử lại (Reliability & Retry):** Khi gửi tin nhắn qua API Meta/Zalo thất bại do nghẽn mạng hoặc vượt quá giới hạn lượt gọi (Rate Limit), hệ thống phải tự động đưa tin nhắn vào hàng đợi thử lại với cơ chế exponential backoff (thử lại tối đa 3 lần) trước khi đánh dấu lỗi gửi.
* **Khả năng mở rộng (Scalability):** Thiết kế kiến trúc Backend theo dạng stateless, cho phép chạy song song nhiều máy chủ đằng sau một bộ cân bằng tải bằng cách sử dụng module Redis Adapter để đồng bộ kết nối Socket.IO.

---

## 6. Tiêu chí nghiệm thu sản phẩm (PAC - Product Acceptance Criteria)

### Kiểm thử kết nối đa kênh (OAuth & Session)
* **Điều kiện:** Người dùng Admin có trang Facebook hợp lệ và quyền quản trị.
* **Hành động:** Thực hiện kết nối trang qua giao diện cấu hình bằng luồng Meta OAuth.
* **Kết quả mong muốn:** Hệ thống lấy thành công Long-Lived Token, mã hóa lưu vào DB, đăng ký Webhook thành công với Meta và hiển thị biểu tượng kết nối màu xanh lá.

### Kiểm thử đồng bộ tin nhắn thời gian thực
* **Điều kiện:** Đã kết nối kênh Zalo/Facebook thành công và nhân viên đang mở màn hình Live Chat.
* **Hành động:** Khách hàng sử dụng điện thoại gửi một tin nhắn hình ảnh vào trang/tài khoản Zalo.
* **Kết quả mong muốn:** Khung chat của nhân viên phải hiển thị tin nhắn hình ảnh đó ngay lập tức dưới 500ms mà không cần thực hiện tải lại trang (F5).

### Kiểm thử cơ chế Tạm dừng Bot (Bot Pause)
* **Điều kiện:** Chatbot AI đang hoạt động tự động phản hồi cho khách hàng bình thường.
* **Hành động:** Nhân viên tư vấn soạn một tin nhắn tư vấn thủ công và gửi đi từ khung chat Live Chat.
* **Kết quả mong muốn:** Hệ thống cập nhật trường `botPausedUntil` thêm 30 phút trong Database. Khi khách hàng gửi tin nhắn tiếp theo ngay sau đó, Bot AI không tự động trả lời nữa mà chỉ hiển thị thông báo tin nhắn mới cho nhân viên.
