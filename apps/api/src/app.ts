import express, { type Express } from "express";

import type { HealthResponse } from "@nhuu-chat/contracts";

import { authRouter } from "./auth/auth.routes.js";
import { errorHandler } from "./common/errors.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok", service: "nhuu-chat" };

    response.status(200).json(health);
  });
  app.use("/api/v1/auth", authRouter);
  app.use(errorHandler);

  return app;
}
