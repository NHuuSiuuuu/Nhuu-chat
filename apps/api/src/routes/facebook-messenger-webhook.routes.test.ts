import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({ processMessengerWebhook: vi.fn() }));
vi.mock("../channels/facebook-messenger/facebook-messenger.webhook.js", () => processor);

import { createApp } from "../app.js";

const path = "/api/v1/webhooks/facebook/messenger";

describe("Facebook Messenger webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.META_APP_SECRET = "test-app-secret";
    process.env.META_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  });

  it("returns the challenge only with the configured verification token", async () => {
    const valid = await request(createApp()).get(path).query({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "challenge-123" });
    expect(valid.status).toBe(200);
    expect(valid.text).toBe("challenge-123");
    const invalid = await request(createApp()).get(path).query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "challenge-123" });
    expect(invalid.status).toBe(403);
    expect(invalid.text).not.toContain("test-verify-token");
  });

  it("checks the exact raw bytes before parsing JSON or invoking persistence", async () => {
    const body = '{ "object":"page", "entry":[] }';
    const signature = `sha256=${createHmac("sha256", "test-app-secret").update(Buffer.from(body)).digest("hex")}`;
    const valid = await request(createApp()).post(path).set("Content-Type", "application/json").set("X-Hub-Signature-256", signature).send(body);
    expect(valid.status).toBe(200);
    expect(processor.processMessengerWebhook).toHaveBeenCalledWith({ object: "page", entry: [] });
    const altered = await request(createApp()).post(path).set("Content-Type", "application/json").set("X-Hub-Signature-256", signature).send('{"object":"page","entry":[]}');
    expect(altered.status).toBe(403);
    expect(processor.processMessengerWebhook).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON only after a valid signature", async () => {
    const body = "{invalid";
    const signature = `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
    const response = await request(createApp()).post(path).set("Content-Type", "application/json").set("X-Hub-Signature-256", signature).send(body);
    expect(response.status).toBe(400);
    expect(processor.processMessengerWebhook).not.toHaveBeenCalled();
  });

  it("fails closed when the app secret is missing", async () => {
    delete process.env.META_APP_SECRET;
    const response = await request(createApp()).post(path).set("Content-Type", "application/json").send("{}");
    expect(response.status).toBe(503);
    expect(processor.processMessengerWebhook).not.toHaveBeenCalled();
  });
});
