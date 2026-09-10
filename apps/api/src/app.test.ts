import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";

describe("API route registration", () => {
  it("keeps the health endpoint available", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "nhuu-chat" });
  });

  it("keeps the conversations API prefix registered", async () => {
    const response = await request(createApp()).get("/api/v1/conversations");

    expect(response.status).toBe(401);
  });

  it("registers the shared conversation tags API behind authentication", async () => {
    const response = await request(createApp()).get("/api/v1/conversation-tags");

    expect(response.status).toBe(401);
  });
});
