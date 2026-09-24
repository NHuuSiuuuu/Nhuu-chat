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
  const lifecycle: string[] = [];
  const meta = { subscribe: vi.fn(async () => undefined), unsubscribe: vi.fn(async () => { lifecycle.push("unsubscribe"); }), refreshLongToken: vi.fn(async () => ({ accessToken: "new-secret", expiresAt: new Date("2030-01-01") })) };
  const history = vi.fn();
  const access = {
    revoke: vi.fn(async () => { lifecycle.push("revoke"); return { workspaceId: "workspace-1", memberUserIds: ["staff-1", "staff-2"] }; }),
    clear: vi.fn(async () => { lifecycle.push("clear"); return { workspaceId: "workspace-1", memberUserIds: ["staff-1"] }; }),
    invalidate: vi.fn(() => { lifecycle.push("invalidate"); })
  };
  const service = new InstagramAccountService({ model: model as never, meta: meta as never, recordHistory: history, encrypt: (token) => `encrypted:${token}`, decrypt: (token) => token.replace("encrypted:", ""),
    revokeChannelAccess: access.revoke, clearChannelRevocation: access.clear, invalidateWorkspaceMembers: access.invalidate });
  const input = { instagramUserId: "123", accessToken: "long-secret", username: "business", displayName: "Business", avatarUrl: null, expiresAt: new Date("2030-01-01") };
  return { service, rows, model, meta, history, input, access, lifecycle };
}

describe("Instagram account lifecycle", () => {
  it("stores only encrypted credentials, subscribes, and returns a safe DTO", async () => {
    const { service, rows, meta, history, input } = fixture();
    const result = await service.connect("owner-1", input);
    expect(rows[0].encryptedAccessToken).toBe("encrypted:long-secret");
    expect(meta.subscribe).toHaveBeenCalledWith("123", "long-secret");
    expect(result).not.toHaveProperty("encryptedAccessToken");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith({
      userId: "owner-1", actionType: "CONNECT_CHANNEL", actionTitle: "Kết nối Instagram",
      oldValue: {}, newValue: { platform: "instagram", channelId: "123", username: "business" }
    });
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
    await service.connect("owner-1", { ...input, accessToken: "fresh-secret" });
    expect(rows[0].encryptedAccessToken).toBe("encrypted:fresh-secret");
    expect(history).toHaveBeenCalledTimes(1);
  });

  it("keeps the prior credential active if re-authorization subscription fails", async () => {
    const { service, rows, meta, input } = fixture();
    await service.connect("owner-1", input);
    meta.subscribe.mockRejectedValueOnce(new Error("provider failed"));
    await expect(service.connect("owner-1", { ...input, accessToken: "bad-secret" })).rejects.toMatchObject({ code: "INSTAGRAM_SUBSCRIBE_FAILED" });
    expect(rows[0]).toMatchObject({ status: "connected", encryptedAccessToken: "encrypted:long-secret" });
  });

  it("disconnects only an owned account and records history once", async () => {
    const { service, rows, meta, history, input, access, lifecycle } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    expect(await service.disconnect("owner-2", "1")).toEqual({ disconnected: false });
    expect(rows).toHaveLength(1);
    expect(await service.disconnect("owner-1", "1")).toEqual({ disconnected: true });
    expect(lifecycle).toEqual(["clear", "invalidate", "revoke", "invalidate", "unsubscribe"]);
    expect(await service.disconnect("owner-1", "1")).toEqual({ disconnected: false });
    expect(meta.unsubscribe).toHaveBeenCalledTimes(1);
    expect(access.revoke).toHaveBeenCalledWith("owner-1", { platform: "instagram", channelId: "123" });
    expect(access.invalidate).toHaveBeenCalledWith("workspace-1", ["staff-1", "staff-2"]);
    expect(history).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledWith({
      userId: "owner-1", actionType: "DISCONNECT_CHANNEL", actionTitle: "Ngắt kết nối Instagram",
      oldValue: { platform: "instagram", channelId: "123", username: "business" }, newValue: {}
    });
  });

  it("clears the exact staff revocation and invalidates its Workspace sockets after reconnect", async () => {
    const { service, input, access } = fixture();
    await service.connect("owner-1", input);
    await service.disconnect("owner-1", "1");
    access.clear.mockClear();
    access.invalidate.mockClear();

    await service.connect("owner-1", input);

    expect(access.clear).toHaveBeenCalledWith("owner-1", { platform: "instagram", channelId: "123" });
    expect(access.invalidate).toHaveBeenCalledWith("workspace-1", ["staff-1"]);
  });

  it.each(["throws", "returns null"] as const)("retries local deletion after unsubscribe succeeds and deletion %s", async (failure) => {
    const { service, rows, model, meta, history, input } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    if (failure === "throws") model.findOneAndDelete.mockRejectedValueOnce(new Error("database unavailable"));
    else model.findOneAndDelete.mockResolvedValueOnce(null);

    await expect(service.disconnect("owner-1", "1")).rejects.toMatchObject({ code: "INSTAGRAM_DISCONNECT_FAILED" });
    expect(rows[0].lastErrorCode).toBe("INSTAGRAM_REMOVE_UNSUBSCRIBED");
    expect(history).not.toHaveBeenCalled();
    await expect(service.disconnect("owner-1", "1")).resolves.toEqual({ disconnected: true });
    expect(meta.unsubscribe).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
    await expect(service.disconnect("owner-1", "1")).resolves.toEqual({ disconnected: false });
    expect(history).toHaveBeenCalledTimes(1);
  });

  it("recovers a stale pending unsubscribe after the database cannot record provider success", async () => {
    const { service, rows, model, meta, history, input } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    const update = model.findOneAndUpdate.getMockImplementation();
    if (!update) throw new Error("fixture update missing");
    model.findOneAndUpdate.mockImplementationOnce(update).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.disconnect("owner-1", "1")).rejects.toMatchObject({ code: "INSTAGRAM_DISCONNECT_FAILED" });
    expect(rows[0].lastErrorCode).toBe("INSTAGRAM_REMOVE_PENDING");
    expect(history).not.toHaveBeenCalled();
    rows[0].updatedAt = new Date(Date.now() - 60_000);
    await expect(service.disconnect("owner-1", "1")).resolves.toEqual({ disconnected: true });
    expect(meta.unsubscribe).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it("rejects connect while an unsubscribed account is waiting for local deletion", async () => {
    const { service, rows, model, meta, history, input } = fixture();
    await service.connect("owner-1", input);
    history.mockClear();
    const deleteRow = model.findOneAndDelete.getMockImplementation();
    if (!deleteRow) throw new Error("fixture delete missing");
    let reachedDelete: () => void = () => undefined;
    let releaseDelete: () => void = () => undefined;
    const atDelete = new Promise<void>((resolve) => { reachedDelete = resolve; });
    const heldDelete = new Promise<void>((resolve) => { releaseDelete = resolve; });
    model.findOneAndDelete.mockImplementationOnce(async (filter) => {
      reachedDelete();
      await heldDelete;
      return deleteRow(filter);
    });

    const disconnecting = service.disconnect("owner-1", "1");
    await atDelete;
    expect(rows[0].lastErrorCode).toBe("INSTAGRAM_REMOVE_UNSUBSCRIBED");
    let connectError: unknown;
    try { await service.connect("owner-1", { ...input, accessToken: "new-secret" }); }
    catch (error) { connectError = error; }
    releaseDelete();
    const disconnected = await disconnecting.catch((error: unknown) => error);

    expect(connectError).toMatchObject({ code: "INSTAGRAM_CONNECTION_BUSY" });
    expect(disconnected).toEqual({ disconnected: true });
    expect(meta.subscribe).toHaveBeenCalledTimes(1);
    expect(meta.unsubscribe).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });
});
