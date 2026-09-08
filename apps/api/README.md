# API test setup

Task 2 integration tests ưu tiên MongoDB replica set thật qua `MONGODB_TEST_URI`.

```bash
docker compose -f infra/docker-compose.yml up -d mongo
MONGODB_TEST_URI='mongodb://127.0.0.1:27017/nhuu-chat-test?replicaSet=rs0' \
  pnpm --filter api exec vitest run src/auth/auth.integration.test.ts src/models/indexes.test.ts src/models/provider-secret.integration.test.ts
```

Nếu không đặt `MONGODB_TEST_URI`, test helper thử `MongoMemoryReplSet` MongoDB 4.4.29. Fallback này cần runtime MongoDB tương thích và OpenSSL 1.1; helper sẽ fail fast với hướng dẫn thay vì chờ timeout dài. Production không dùng fallback và luôn đọc `MONGODB_URI` từ environment.
