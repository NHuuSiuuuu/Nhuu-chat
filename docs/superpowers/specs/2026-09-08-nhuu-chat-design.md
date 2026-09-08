# Nhuu-chat MVP Design

**Ngày:** 2026-09-08  
**Trạng thái:** Chờ người dùng duyệt thiết kế  
**Nguồn yêu cầu:** `prd-v2.md`, `srs-v2.md`

## 1. Mục tiêu

Xây dựng một project độc lập tên `Nhuu-chat` để hợp nhất hội thoại chăm sóc khách hàng vào một inbox realtime, bắt đầu với Telegram, trợ lý AI RAG và cơ chế phối hợp Agent–Bot. Project này không tích hợp vào repo shoe store `/home/codexproxy/Codex-ttshuu`.

## 2. Phạm vi MVP

### Bao gồm

- Đăng nhập và phân quyền `admin`, `agent`.
- MongoDB làm database chính.
- Redis cho cache, rate limit, retry queue và Socket.IO adapter.
- Telegram Bot API: lưu cấu hình bot, đăng ký webhook, nhận và gửi tin nhắn.
- Mô hình dữ liệu customer, conversation, message, tag và knowledge chunk.
- Inbox realtime bằng React + TypeScript + Socket.IO.
- Danh sách hội thoại, tìm kiếm/lọc cơ bản, mở hội thoại, đọc/chưa đọc, phân công agent và gắn tag.
- Gửi tin nhắn văn bản từ agent.
- RAG ingestion cho TXT/PDF/DOCX và nội dung Q&A; chunking, embedding, vector search và prompt có kiểm soát nguồn.
- Bot Pause mặc định 30 phút sau khi agent gửi tin nhắn.
- Xác thực webhook, idempotency message, retry tối đa 3 lần với exponential backoff.
- Kiểm thử unit, integration, webhook, realtime, RAG, security và E2E cho MVP.

### Chưa bao gồm trong MVP

- Facebook Messenger và Instagram OAuth/Webhook.
- Zalo cá nhân qua QR/session cookie.
- Gọi thoại/video WebRTC.
- Bulk delete và thao tác hàng loạt nâng cao.
- Template/quick reply, quote nâng cao và đầy đủ loại media.
- Multi-tenant billing, analytics nâng cao và triển khai production multi-region.

## 3. Kiến trúc đề xuất

Frontend là React + TypeScript SPA. Backend là Node.js + Express + TypeScript, tổ chức theo module connector, conversation, message, knowledge và auth. MongoDB lưu dữ liệu nghiệp vụ; Redis cung cấp rate limit, job retry và Socket.IO Redis adapter. Luồng connector chuyển payload Telegram vào một canonical message model dùng chung, để các connector Meta/Zalo sau này có thể thêm vào mà không thay đổi inbox.

```text
Telegram Webhook
       |
       v
Connector Adapter -> Signature/Idempotency -> Message Service
                                             |
                         +-------------------+------------------+
                         v                                      v
                   MongoDB                              Socket.IO/Redis
                         |                                      |
                         v                                      v
                  RAG Orchestrator                       React Inbox
                         |
                         v
                 Embedding + LLM provider
```

## 4. Ranh giới module

- `auth`: JWT/session, password hashing, role guard, refresh/revocation policy.
- `channels`: Telegram configuration, webhook registration, inbound/outbound adapter.
- `customers`: upsert theo `{platform, platformId}`.
- `conversations`: tạo/tìm hội thoại, assignment, tags, unread/status, bot pause.
- `messages`: canonical message model, validation, idempotency, outbound delivery state.
- `realtime`: authenticated Socket.IO connection, room `conversation:{id}`, event contracts.
- `knowledge`: upload/parse/chunk/embed/search, document lifecycle.
- `ai`: prompt construction, grounded answer policy, provider abstraction, fallback/handoff.
- `jobs`: outbound retry, ingestion jobs, dead-letter/error state.
- `audit`: actor, action, resource, result, timestamp; không ghi plaintext secrets.

## 5. Dữ liệu và quy tắc nhất quán

- `Customer`: unique compound index `{ platform, platformId }`.
- `Conversation`: customer, platform, channelId, assignedAgentId, unreadCount, status, `botPausedUntil`, last message summary.
- `Message`: conversation, sender type, sender id, type, content, attachments, external message id, delivery status, timestamps.
- `KnowledgeDocument` và `KnowledgeChunk`: tài liệu gốc tách khỏi chunk; mỗi chunk giữ source metadata và embedding.
- Token Telegram và các secret provider phải được mã hóa at rest bằng AES-256-GCM; key chỉ lấy từ secret manager/environment runtime, không commit.
- Webhook xử lý idempotent theo platform + external message id.
- Cập nhật message, conversation summary và unread count phải dùng transaction hoặc cơ chế retry nhất quán phù hợp MongoDB deployment.

## 6. API và realtime contract MVP

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/channels/telegram`
- `POST /api/v1/channels/telegram/webhook`
- `GET /api/v1/conversations?page=1&limit=20&platform=telegram&status=open`
- `GET /api/v1/conversations/:id/messages`
- `POST /api/v1/messages/send`
- `PATCH /api/v1/conversations/:id/assignment`
- `PATCH /api/v1/conversations/:id/status`
- `PATCH /api/v1/customers/:id/tags`
- `POST /api/v1/knowledge/documents`
- `GET /api/v1/knowledge/documents`
- `DELETE /api/v1/knowledge/documents/:id`

Socket.IO events:

- Server → client: `chat:message_received`, `chat:conversation_updated`, `chat:delivery_updated`.
- Client → server: `chat:join_room`, `chat:agent_typing`.

Mọi endpoint quản trị phải có JWT Bearer và role guard. Webhook Telegram không dùng JWT; nó phải dùng secret path/token validation và kiểm tra payload hợp lệ.

## 7. Luồng nghiệp vụ chính

### Tin nhắn đến

1. Telegram gửi webhook.
2. Backend xác thực request và kiểm tra idempotency.
3. Connector chuẩn hóa payload thành canonical message.
4. Upsert customer và conversation.
5. Lưu message, cập nhật unread/last message.
6. Phát event Socket.IO.
7. Nếu `botPausedUntil` còn hiệu lực thì kết thúc tại đây.
8. Nếu bot hoạt động, RAG lấy top-K context; LLM chỉ trả lời dựa trên context, nếu thiếu thì chuyển agent.
9. Gửi câu trả lời qua Telegram và lưu delivery state.

### Agent trả lời

1. Kiểm tra agent có quyền trên conversation.
2. Validate content/attachments.
3. Đặt `botPausedUntil = now + 30 minutes` trong cùng nghiệp vụ gửi.
4. Gửi Telegram qua job/outbox.
5. Lưu message và phát event.
6. Retry tối đa 3 lần; sau đó đánh dấu failed và hiển thị lỗi cho agent.

## 8. Bảo mật và độ tin cậy

- Hash mật khẩu bằng Argon2id hoặc bcrypt với cost phù hợp.
- JWT access token ngắn hạn; refresh token có rotation/revocation.
- Rate limit đăng nhập, webhook và message send bằng Redis.
- Validate body/query/params bằng schema; giới hạn kích thước upload và MIME allowlist.
- Chống SSRF khi ingestion URL: chỉ cho phép HTTP(S), chặn private/link-local IP và giới hạn redirect.
- Không log token, cookie, prompt secret hoặc nội dung nhạy cảm không cần thiết.
- CORS allowlist, security headers, request ID và audit log.
- Webhook signature/secret và idempotency phải được kiểm thử với payload giả mạo, replay và duplicate.

## 9. Chiến lược kiểm thử và tiêu chí nghiệm thu

- Unit: normalization, bot pause, prompt policy, encryption, retry backoff.
- Integration: MongoDB/Redis, auth/role guard, Telegram adapter, webhook persistence, RAG retrieval.
- Contract: REST response và Socket.IO event payload.
- E2E: admin cấu hình bot → khách gửi Telegram → message xuất hiện realtime → bot trả lời → agent trả lời → bot pause → khách gửi tiếp nhưng bot không trả lời.
- Security: unauthenticated/unauthorized access, forged webhook, replay, rate limit, upload traversal, SSRF, secret leakage.
- Performance: p95 realtime delivery dưới 300ms trong môi trường test bình thường; tải webhook và Socket.IO bằng k6/Artillery.
- Không gọi MVP đạt nếu chưa có test live Telegram sandbox và kiểm tra migration/index trên MongoDB thật.

## 10. Các quyết định cần giữ rõ

- MongoDB phải chạy replica set khi cần transaction; local Docker phải hỗ trợ cấu hình này hoặc MVP phải dùng cơ chế ghi idempotent không phụ thuộc transaction.
- Vector store chọn MongoDB Atlas Vector Search nếu môi trường triển khai là Atlas; nếu local-first thì dùng ChromaDB qua adapter. Interface search phải giữ độc lập provider.
- Provider LLM/embedding phải là adapter để thay OpenAI/Gemini bằng cấu hình, không đưa key ra frontend.
- Telegram được làm connector đầu tiên vì dễ tạo sandbox và kiểm thử end-to-end hơn Meta/Zalo.

