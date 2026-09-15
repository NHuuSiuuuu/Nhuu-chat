import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createClient: vi.fn(),
  encryptSecret: vi.fn((value: string) => `ciphertext:${value.length}`),
  decryptSecret: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn()
}));

vi.mock("../channels/zalo-personal/zalo-personal.client.js", () => ({
  createZaloPersonalClient: dependencies.createClient
}));
vi.mock("../channels/zalo-personal/zalo-personal.model.js", () => ({
  ZaloPersonalSessionModel: {
    findOne: dependencies.findOne,
    find: dependencies.find,
    findOneAndUpdate: dependencies.findOneAndUpdate,
    updateOne: dependencies.updateOne,
    deleteOne: dependencies.deleteOne
  }
}));
vi.mock("../common/crypto.js", () => ({
  encryptSecret: dependencies.encryptSecret,
  decryptSecret: dependencies.decryptSecret
}));

const api = {
  getContext: vi.fn(() => ({ credentials: { imei: "imei-1", cookie: { sid: "credential-secret" }, userAgent: "ua" } })),
  getAccountInfo: vi.fn(async () => ({ id: "zalo-1", displayName: "Nhuu", username: "nhuu" })),
  onMessage: vi.fn(),
  startListener: vi.fn(async () => undefined),
  stopListener: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => ({ id: "message-1" }))
};

function resetApi() {
  api.getContext.mockImplementation(() => ({ credentials: { imei: "imei-1", cookie: { sid: "credential-secret" }, userAgent: "ua" } }));
  api.getAccountInfo.mockImplementation(async () => ({ id: "zalo-1", displayName: "Nhuu", username: "nhuu" }));
  api.startListener.mockImplementation(async () => undefined);
  api.stopListener.mockImplementation(async () => undefined);
}

async function flushLifecycleQueue(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function createQrClient() {
  return {
    loginQR: vi.fn(async (onQr: (payload: { qrData: string; expiresAt: Date }) => void) => {
      onQr({ qrData: "data:image/png;base64,qr-image", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      return api;
    }),
    login: vi.fn(async () => api),
    disconnect: vi.fn(async () => undefined)
  };
}

describe("Zalo personal QR session lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00.000Z"));
    vi.clearAllMocks();
    resetApi();
    dependencies.createClient.mockImplementation(createQrClient);
    dependencies.findOneAndUpdate.mockResolvedValue(undefined);
    dependencies.updateOne.mockResolvedValue(undefined);
    dependencies.deleteOne.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { shutdownActiveZaloPersonalClients } = await import("./zalo-personal.service.js");
    await shutdownActiveZaloPersonalClients();
    vi.useRealTimers();
  });

  it("creates one pending QR runtime session and reuses it while unexpired", async () => {
    const { startZaloPersonalQr } = await import("./zalo-personal.service.js");
    let completeLogin!: () => void;
    const pendingClient = createQrClient();
    pendingClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,qr-image", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      await new Promise<void>((resolve) => { completeLogin = resolve; });
      return api;
    });
    dependencies.createClient.mockReturnValue(pendingClient);

    const first = await startZaloPersonalQr("owner-qr");
    const second = await startZaloPersonalQr("owner-qr");

    expect(first).toMatchObject({ status: "waiting_qr", qrData: "data:image/png;base64,qr-image", expiresAt: "2026-09-15T16:01:40.000Z" });
    expect(second.id).toBe(first.id);
    expect(dependencies.createClient).toHaveBeenCalledOnce();
    completeLogin();
  });

  it("marks the QR session connected and persists only encrypted credentials after login", async () => {
    const { getZaloPersonalQrStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-connect");
    await flushLifecycleQueue();
    expect(getZaloPersonalQrStatus(qr.id, "owner-connect").status).toBe("connected");

    expect(dependencies.encryptSecret).toHaveBeenCalledWith(JSON.stringify({ imei: "imei-1", cookie: { sid: "credential-secret" }, userAgent: "ua" }));
    expect(dependencies.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerId: "owner-connect" },
      expect.objectContaining({
        $set: expect.objectContaining({
          encryptedCredentials: "ciphertext:71",
          zaloUserId: "zalo-1",
          displayName: "Nhuu",
          username: "nhuu",
          status: "connected"
        })
      }),
      { upsert: true, new: true }
    );
    expect(JSON.stringify(dependencies.findOneAndUpdate.mock.calls)).not.toContain("credential-secret");
  });

  it("rejects a QR status read by a different owner", async () => {
    const { getZaloPersonalQrStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-a");

    expect(() => getZaloPersonalQrStatus(qr.id, "owner-b")).toThrow(expect.objectContaining({ code: "QR_LOGIN_NOT_FOUND" }));
  });

  it("starts one active listener when concurrent restores request the same owner", async () => {
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected" })
      })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));

    const { getActiveZaloPersonalClient } = await import("./zalo-personal.service.js");
    const [first, second] = await Promise.all([
      getActiveZaloPersonalClient("owner-restore"),
      getActiveZaloPersonalClient("owner-restore")
    ]);

    expect(first).toBe(api);
    expect(second).toBe(api);
    expect(restoredClient.login).toHaveBeenCalledOnce();
    expect(api.startListener).toHaveBeenCalledOnce();
  });

  it("keeps the connected owner and encrypted session when listener shutdown fails", async () => {
    const { getActiveZaloPersonalClient, logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");
    const connectedQr = await startZaloPersonalQr("owner-stop-failure");
    await Promise.resolve();
    await Promise.resolve();
    api.stopListener.mockRejectedValueOnce(new Error("native listener did not stop"));

    await expect(logoutZaloPersonal("owner-stop-failure")).rejects.toMatchObject({ code: "ZALO_PERSONAL_LOGOUT_FAILED" });

    expect(await getActiveZaloPersonalClient("owner-stop-failure")).toBe(api);
    expect(dependencies.deleteOne).not.toHaveBeenCalledWith({ ownerId: "owner-stop-failure" });
    expect(dependencies.updateOne).toHaveBeenCalledWith(
      { ownerId: "owner-stop-failure" },
      { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_LOGOUT_STOP_FAILED" } }
    );
    expect(connectedQr.id).toBeTypeOf("string");
  });

  it("does not create a QR listener after a restored listener fails to stop", async () => {
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockImplementation(() => ({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected" }) }),
      lean: async () => ({ _id: "session-restore", status: "error", lastErrorCode: "ZALO_PERSONAL_LOGOUT_STOP_FAILED" })
    }));
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));
    const { getActiveZaloPersonalClient, logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await getActiveZaloPersonalClient("owner-restored-stop-failure");
    api.stopListener.mockRejectedValueOnce(new Error("native listener did not stop"));
    await expect(logoutZaloPersonal("owner-restored-stop-failure")).rejects.toMatchObject({ code: "ZALO_PERSONAL_LOGOUT_FAILED" });
    const status = await startZaloPersonalQr("owner-restored-stop-failure");

    expect(status.status).toBe("error");
    expect(restoredClient.loginQR).not.toHaveBeenCalled();
  });

  it("does not stop the same connected listener twice during logout", async () => {
    const connectedClient = createQrClient();
    connectedClient.disconnect.mockImplementation(async () => api.stopListener());
    dependencies.createClient.mockReturnValue(connectedClient);
    const { logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-single-stop");
    await Promise.resolve();
    await Promise.resolve();
    await logoutZaloPersonal("owner-single-stop");

    expect(api.stopListener).toHaveBeenCalledOnce();
    expect(dependencies.deleteOne).toHaveBeenCalledWith({ ownerId: "owner-single-stop" });
  });

  it("serializes a QR completion already in progress with a later logout", async () => {
    let finishAccountLookup!: () => void;
    const lateClient = createQrClient();
    lateClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,late", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      return api;
    });
    dependencies.createClient.mockReturnValue(lateClient);
    dependencies.findOne.mockReturnValue({ select: () => ({ lean: async () => null }) });
    api.getAccountInfo.mockImplementation(() => new Promise((resolve) => {
      finishAccountLookup = () => resolve({ id: "zalo-1", displayName: "Nhuu", username: "nhuu" });
    }));
    const { getActiveZaloPersonalClient, logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-logout-race");
    await Promise.resolve();
    await Promise.resolve();
    let logoutFinished = false;
    const logout = logoutZaloPersonal("owner-logout-race").then(() => { logoutFinished = true; });
    await Promise.resolve();
    expect(logoutFinished).toBe(false);
    finishAccountLookup();
    await logout;
    await Promise.resolve();

    expect(await getActiveZaloPersonalClient("owner-logout-race")).toBeUndefined();
    expect(api.stopListener).toHaveBeenCalledOnce();
    expect(dependencies.deleteOne).toHaveBeenCalledWith({ ownerId: "owner-logout-race" });
  });

  it("replaces a QR after status polling has observed its expiry", async () => {
    let finishFirstLogin!: () => void;
    const firstClient = createQrClient();
    firstClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,first", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      await new Promise<void>((resolve) => { finishFirstLogin = resolve; });
      return api;
    });
    const replacementClient = createQrClient();
    replacementClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,replacement", expiresAt: new Date("2026-09-15T16:03:00.000Z") });
      return api;
    });
    dependencies.createClient
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(replacementClient);
    const { getZaloPersonalQrStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const first = await startZaloPersonalQr("owner-expired");
    vi.setSystemTime(new Date("2026-09-15T16:01:41.000Z"));
    expect(getZaloPersonalQrStatus(first.id, "owner-expired").status).toBe("expired");
    const replacement = await startZaloPersonalQr("owner-expired");

    expect(replacement.id).not.toBe(first.id);
    expect(replacement).toMatchObject({ status: "waiting_qr", qrData: "data:image/png;base64,replacement" });
    expect(firstClient.disconnect).toHaveBeenCalledOnce();
    finishFirstLogin();
  });

  it("does not publish a restored API after its Mongo status update fails", async () => {
    let sessionExists = true;
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockImplementation(() => ({
      select: () => ({ lean: async () => sessionExists ? { encryptedCredentials: "ciphertext:stored", status: "connected" } : null })
    }));
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));
    dependencies.updateOne.mockRejectedValue(new Error("mongo unavailable"));
    const { getActiveZaloPersonalClient } = await import("./zalo-personal.service.js");

    await expect(getActiveZaloPersonalClient("owner-restore-write-failure")).rejects.toThrow("mongo unavailable");
    sessionExists = false;

    expect(await getActiveZaloPersonalClient("owner-restore-write-failure")).toBeUndefined();
    expect(restoredClient.disconnect).toHaveBeenCalledTimes(2);
  });
});
