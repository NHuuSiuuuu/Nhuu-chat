process.env.NODE_ENV ??= "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/nhuu-chat-test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-with-at-least-32-characters";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-with-at-least-32-characters";
process.env.TELEGRAM_BOT_TOKEN ??= "123456:test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-telegram-webhook-secret";
