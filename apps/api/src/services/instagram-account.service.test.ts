import { describe, expect, it, vi } from "vitest";

import { InstagramAccountService } from "./instagram-account.service.js";

function fixture() {
  const rows: Array<Record<string, unknown>> = [];
  const model = {
    findOne: vi.fn((filter: Record<string, unknown>) => ({ select: () => ({ lean: async () => rows.find((row) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value))) ?? null }) })),
    find: vi.fn(() => ({ sort: () => ({ lean: async () => rows }) })),
    create: vi.fn(async (value: Record<string, unknown>) => {
      if (rows.some((row) => row.instagramUserId === value.instagramUserId)) throw Object.assign(new Error("duplicate"), { code: 11000, keyPattern: { instagramUserId: 1 } });
      const row = { _id: String(rows.length + 1), createdAt: new Date(), updatedAt: new Date(), ...value };
      rows.push(row);
      return row;
    }),
    findOneAndUpdate: vi.fn(async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const row = rows.find((item) => Object.entries(filter).every(([key, value]) => String(item[key]) === String(value)));
      if (!row) return null;
      Object.assign(row, update.$set);
      return row;
    }),
    findOneAndDelete: vi.fn(async (filter: Record<string, unknown>) => {
      const index = rows.findIndex((row) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value)));
      return index < 0 ? null : rows.splice(index, 1)[0];
    })
  };
  const meta = { subscribe: vi.fn(async () => undefined), unsubscribe: vi.fn(async () => undefined), refreshLongToken: vi.fn(async () => ({ accessToken: "new-secret", expiresAt: new Date("2030-01-01") })) };
  const history = vi.fn();
  const service = new InstagramAccountService({ model: model as never, meta: meta as never, recordHistory: history, encrypt: (token) => `encrypted:${token}`, decrypt: (token) => token.replace("encrypted:", "") });
  const input = { instagramUserId: "123", accessToken: "long-secret", username: "business", displayName: "Business", avatarUrl: null, expiresAt: new Date("2030-01-01") };
  return { service, rows, model, meta, history, input };
}

describe("Instagram account lifecycle", () => {
  it("stores only encrypted credentials, subscribes, and returns a safe DTO", async () => {
    const { service, rows, meta, history, input } = fixture();
    const result = await service.connect("owner-1", input);
    expect(rows[0].encryptedAccessToken).toBe("encrypted:long-secret");
    expect(meta.subscribe).toHaveBeenCalledWith("123", "long-secret");
    expect(result).not.toHaveProperty("encryptedAccessToken");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ actionType: "CONNECT_CHANNEL", newValue: expect.not.objectContaining({ accessToken: expect.anything() }) }));
  });

  it("rejects an account already claimed by another owner", async () => {
    const { service, rows, input, meta } = fixture();
    rows.push({ _id: "other", instagramUserId: "123", ownerUserId: "owner-2", status: "connected", createdAt: new Date(), updatedAt: new Date() });
    await expect(service.connect("owner-1", input)).rejects.toMatchObject({ code: "INSTAGRAM_ACCOUNT_ALREADY_CONNECTED" });
    expect(meta.subscribe).not.toHaveBeenCalled();
  });

  it("retains an invalid encrypted record when subscription fails", async () => {
    const { service, rows, meta, history, input } = fixture();
    meta.subscribe.mockRejectedValueOnce(new Error("provider-secret"));
    await expect(service.connect("owner-1", input)).rejects.toMatchObject({ code: "INSTAGRAM_SUBSCRIBE_FAILED", message: expect.not.stringContaining("provider-secret") });
    expect(rows[0]).toMatchObject({ status: "invalid", encryptedAccessToken: "encrypted:long-secret" });
    expect(history).not.toHaveBeenCalled();
  });

  it("marks a successful subscription with failed confirmation as retryable", async () => {
    const { service, rows, model, input } = fixture();
    model.findOneAndUpdate.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(service.connect("owner-1", input)).rejects.toMatchObject({ code: "INSTAGRAM_CONNECTION_FAILED" });
    expect(rows[0].lastErrorCode).toBe("INSTAGRAM_SUBSCRIBE_CONFIRM_FAILED");
    await expect(service.connect("owner-1", input)).resolves.toMatchObject({ status: "connected" });
  });

  it("refreshes a valid long-lived token with encrypted replacement", async () => {
    const { service, rows, meta, input } = fixture();
    await service.connect("owner-1", input);
    await service.refresh("owner-1", "1");
    expect(meta.refreshLongToken).toHaveBeenCalledWith("long-secret");
    expect(rows[0].encryptedAccessToken).toBe("encrypted:new-secret");
  });

  it("re-authorizes an existing owner connection with a fresh encrypted token without duplicate history", async () => {
    const { service, rows, history, input } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    await service.connect("owner-1", { ...input, accessToken: "fresh-secret" });
    expect(rows[0].encryptedAccessToken).toBe("encrypted:fresh-secret");
    expect(history).not.toHaveBeenCalled();
  });

  it("keeps the prior credential active if re-authorization subscription fails", async () => {
    const { service, rows, meta, input } = fixture();
    await service.connect("owner-1", input);
    meta.subscribe.mockRejectedValueOnce(new Error("provider failed"));
    await expect(service.connect("owner-1", { ...input, accessToken: "bad-secret" })).rejects.toMatchObject({ code: "INSTAGRAM_SUBSCRIBE_FAILED" });
    expect(rows[0]).toMatchObject({ status: "connected", encryptedAccessToken: "encrypted:long-secret" });
  });

  it("disconnects only an owned account and records history once", async () => {
    const { service, rows, meta, history, input } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    expect(await service.disconnect("owner-2", "1")).toEqual({ disconnected: false });
    expect(rows).toHaveLength(1);
    expect(await service.disconnect("owner-1", "1")).toEqual({ disconnected: true });
    expect(await service.disconnect("owner-1", "1")).toEqual({ disconnected: false });
    expect(meta.unsubscribe).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ actionType: "DISCONNECT_CHANNEL" }));
  });
});
