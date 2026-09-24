import { createHmac } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({ processInstagramWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../channels/instagram/instagram-event.service.js", () => processor);
import { createApp } from "../app.js";

afterEach(() => { delete process.env.INSTAGRAM_APP_SECRET; delete process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN; vi.resetAllMocks(); });
function sign(raw: string, secret = process.env.INSTAGRAM_APP_SECRET!) { return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`; }

describe("Instagram webhook routes", () => {
  it("answers GET challenge only for the configured verify token", async () => {
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "verify-secret";
    const ok = await request(createApp()).get("/api/v1/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=challenge-1");
    const bad = await request(createApp()).get("/api/v1/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-1");
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("challenge-1");
    expect(bad.status).toBe(403);
  });

  it("checks signature on exact raw bytes before passing parsed JSON", async () => {
    process.env.INSTAGRAM_APP_SECRET = "instagram-app-secret";
    const raw = '{ "object" : "instagram", "entry" : [] }';
    const response = await request(createApp()).post("/api/v1/webhooks/instagram").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(raw)).send(raw);
    expect(response.status).toBe(200);
    expect(processor.processInstagramWebhook).toHaveBeenCalledWith({ object: "instagram", entry: [] });
  });

  it("rejects a signature mismatch", async () => {
    process.env.INSTAGRAM_APP_SECRET = "instagram-app-secret";
    const response = await request(createApp()).post("/api/v1/webhooks/instagram").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign("{}", "wrong-secret")).send("{}");
    expect(response.status).toBe(403);
    expect(processor.processInstagramWebhook).not.toHaveBeenCalled();
  });
});
