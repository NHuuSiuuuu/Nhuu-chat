# Nhuu-chat

MVP quản lý inbox chăm sóc khách hàng Telegram và trợ lý RAG.

## Đã hoàn thành

- Workspace React/Vite + Node/Express/TypeScript.
- JWT auth và role admin/agent/customer.
- MongoDB/Mongoose domain models, mã hóa provider secret AES-256-GCM.
- Telegram webhook có secret và idempotency.
- REST conversation/message API và Socket.IO room authentication.
- Knowledge chunking, TXT/Markdown/PDF/DOCX parser, provider-independent RAG.
- Bot Pause 30 phút và retry outbound 0s/1s/4s.
- Inbox React tối thiểu.
- Security headers, request ID và rate limit auth.

## Chạy local

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm test
pnpm --filter web build
```

Test Mongo fallback trên máy hiện tại cần thư viện OpenSSL 1.1 tương thích hoặc `MONGODB_TEST_URI` trỏ tới Mongo replica set.

## Chưa hoàn tất trước production

- Chưa chạy Playwright E2E trên môi trường deploy thật.
- Redis adapter và Mongo integration cần xác minh trên Docker/CI sạch.
- Vector store hiện là adapter in-memory cho MVP; cần chọn Mongo Atlas Vector Search hoặc ChromaDB.
- Meta/Instagram OAuth, Zalo, WebRTC và load test thực tế nằm ngoài MVP hiện tại.

## Lệnh kiểm tra

```bash
pnpm test
pnpm --filter api exec tsc --noEmit -p ../../tsconfig.base.json
pnpm --filter web build
git diff --check
```
