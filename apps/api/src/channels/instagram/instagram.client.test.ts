import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../common/errors.js";
import { InstagramClient } from "./instagram.client.js";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("InstagramClient.sendText", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the current Instagram Graph Send API contract", async () => {
    const fetchMeta = vi.fn().mockResolvedValue(response(200, { message_id: "mid-1", recipient_id: "igsid-9" }));
    const client = new InstagramClient(fetchMeta, "v26.0", 100, 0);

    await expect(client.sendText({ instagramUserId: "ig-1", accessToken: "token-secret", recipientId: "igsid-9", text: "Hi" })).resolves.toEqual({ externalMessageId: "mid-1" });

    expect(fetchMeta).toHaveBeenCalledWith("https://graph.instagram.com/v26.0/ig-1/messages", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer token-secret", "content-type": "application/json" }),
      body: JSON.stringify({ recipient: { id: "igsid-9" }, message: { text: "Hi" } })
    }));
  });

  it("retries once for a rate-limit response rejected by Meta", async () => {
    const fetchMeta = vi.fn().mockResolvedValueOnce(response(429, { error: { message: "try later" } })).mockResolvedValueOnce(response(200, { message_id: "mid-2" }));
    const client = new InstagramClient(fetchMeta, "v26.0", 100, 0);
    await expect(client.sendText({ instagramUserId: "ig-1", accessToken: "secret", recipientId: "igsid-9", text: "Hi" })).resolves.toEqual({ externalMessageId: "mid-2" });
    expect(fetchMeta).toHaveBeenCalledTimes(2);
  });

  it("stops after one retry when the rate limit persists", async () => {
    const fetchMeta = vi.fn().mockResolvedValue(response(429, { error: { message: "try later" } }));
    const client = new InstagramClient(fetchMeta, "v26.0", 100, 0);
    await expect(client.sendText({ instagramUserId: "ig-1", accessToken: "secret", recipientId: "igsid-9", text: "Hi" })).rejects.toMatchObject({ code: "INSTAGRAM_REQUEST_REJECTED" });
    expect(fetchMeta).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent permission and recipient errors", async () => {
    for (const [status, code] of [[403, "INSTAGRAM_PERMISSION_DENIED"], [400, "INSTAGRAM_RECIPIENT_INVALID"]] as const) {
      const fetchMeta = vi.fn().mockResolvedValue(response(status, { error: { code: status === 403 ? 10 : 100 } }));
      const client = new InstagramClient(fetchMeta, "v26.0", 100, 0);
      await expect(client.sendText({ instagramUserId: "ig-1", accessToken: "secret", recipientId: "igsid-9", text: "Hi" })).rejects.toMatchObject({ code: status === 403 ? code : "INSTAGRAM_RECIPIENT_UNAVAILABLE" } satisfies Partial<AppError>);
      expect(fetchMeta).toHaveBeenCalledTimes(1);
    }
  });
});
