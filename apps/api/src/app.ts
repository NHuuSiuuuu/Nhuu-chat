import express, { type Express } from "express";

import type { HealthResponse } from "@nhuu-chat/contracts";

import { authRouter } from "./routes/auth.routes.js";
import { errorHandler } from "./common/errors.js";
import { telegramRouter } from "./channels/telegram/telegram.routes.js";
import { telegramPersonalRouter } from "./channels/telegram-personal/telegram-personal.routes.js";
import { conversationRouter } from "./conversations/conversation.routes.js";
import { messageRouter } from "./messages/message.routes.js";
import { customerRouter } from "./routes/customers.routes.js";
import { knowledgeRouter } from "./routes/knowledge.routes.js";
import { corsAllowlist, rateLimit, requestId, securityHeaders } from "./common/security.middleware.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(requestId);
  app.use(corsAllowlist);
  app.use(express.json());
  app.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok", service: "nhuu-chat" };

    response.status(200).json(health);
  });
  app.use("/api/v1/auth", rateLimit({ windowMs: 60_000, max: 60 }), authRouter);
  app.use("/api/v1/channels/telegram", telegramRouter);
  app.use("/api/v1/channels/telegram-personal", telegramPersonalRouter);
  app.use("/api/v1/conversations", conversationRouter);
  app.use("/api/v1/messages", messageRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/knowledge", knowledgeRouter);
  app.use(errorHandler);

  return app;
}
