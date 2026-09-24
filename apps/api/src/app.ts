import express, { type Express } from "express";

import type { HealthResponse } from "@nhuu-chat/contracts";

import { authRouter } from "./routes/auth.routes.js";
import { errorHandler } from "./common/errors.js";
import { telegramRouter } from "./routes/channels/telegram.routes.js";
import { telegramPersonalRouter } from "./routes/channels/telegram-personal.routes.js";
import { zaloPersonalRouter } from "./routes/channels/zalo-personal.routes.js";
import { conversationRouter } from "./routes/conversations.routes.js";
import { messageRouter } from "./routes/messages.routes.js";
import { customerRouter } from "./routes/customers.routes.js";
import { knowledgeRouter } from "./routes/knowledge.routes.js";
import { conversationTagRouter } from "./routes/conversation-tags.routes.js";
import { aiSettingsRouter } from "./routes/ai-settings.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { generalSettingsRouter } from "./routes/general-settings.routes.js";
import { quickReplyRouter } from "./routes/quick-reply.routes.js";
import { assistantRouter } from "./routes/assistants.routes.js";
import { facebookPageRouter } from "./routes/facebook-page.routes.js";
import { instagramRouter } from "./routes/instagram.routes.js";
import { facebookPostRouter } from "./routes/facebook-post.routes.js";
import { facebookMessengerWebhookRouter } from "./routes/facebook-messenger-webhook.routes.js";
import { settingHistoryRouter } from "./routes/setting-history.routes.js";
import { workspacesRouter } from "./routes/workspaces.routes.js";
import { corsAllowlist, originProtection, rateLimit, requestId, securityHeaders } from "./common/security.middleware.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(requestId);
  app.use(corsAllowlist);
  app.use(originProtection);
  app.use("/api/v1/webhooks/facebook/messenger", express.raw({ type: "application/json" }), facebookMessengerWebhookRouter);
  app.use(express.json());
  app.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok", service: "nhuu-chat" };

    response.status(200).json(health);
  });
  app.use("/api/v1/auth/forgot-password", rateLimit({ windowMs: 15 * 60_000, max: 5, keyPrefix: "password-reset" }));
  app.use("/api/v1/auth", rateLimit({ windowMs: 60_000, max: 60 }), authRouter);
  app.use("/api/v1/channels/telegram", telegramRouter);
  app.use("/api/v1/channels/telegram-personal", telegramPersonalRouter);
  // Trạng thái QR thay đổi theo thời gian thực nên không được dùng response cache cũ.
  app.use("/api/v1/channels/zalo-personal", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api/v1/channels/zalo-personal", zaloPersonalRouter);
  app.use("/api/v1/conversations", conversationRouter);
  app.use("/api/v1/messages", messageRouter);
  app.use("/api/v1/customers", customerRouter);
  app.use("/api/v1/knowledge", knowledgeRouter);
  app.use("/api/v1/conversation-tags", conversationTagRouter);
  app.use("/api/v1/ai-settings", aiSettingsRouter);
  app.use("/api/v1/me/general-settings", generalSettingsRouter);
  app.use("/api/v1/me", profileRouter);
  app.use("/api/v1/quick-replies", quickReplyRouter);
  app.use("/api/v1/assistants", assistantRouter);
  app.use("/api/v1/facebook-page", facebookPageRouter);
  app.use("/api/v1/instagram", instagramRouter);
  app.use("/api/v1/facebook-page/posts", facebookPostRouter);
  app.use("/api/v1/setting-histories", settingHistoryRouter);
  app.use("/api/v1/workspaces", workspacesRouter);
  app.use(errorHandler);

  return app;
}
