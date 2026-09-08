import express, { type Express } from "express";

import type { HealthResponse } from "@nhuu-chat/contracts";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.get("/health", (_request, response) => {
    const health: HealthResponse = { status: "ok", service: "nhuu-chat" };

    response.status(200).json(health);
  });

  return app;
}
