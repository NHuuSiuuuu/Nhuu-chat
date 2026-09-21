import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  createClient: vi.fn(),
  encryptSecret: vi.fn((value: string) => `ciphertext:${value.length}`),
  decryptSecret: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
  customerFindOneAndUpdate: vi.fn(),
  conversationFindOneAndUpdate: vi.fn(),
  messageCreate: vi.fn(),
  messageExists: vi.fn(),
  emitChatEvent: vi.fn(),
  emitInboxEventToRecipients: vi.fn(),
  processTelegramCustomerMessage: vi.fn()
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
vi.mock("../models/customer.model.js", () => ({
  CustomerModel: { findOneAndUpdate: dependencies.customerFindOneAndUpdate }
}));
vi.mock("../models/conversation.model.js", () => ({
  ConversationModel: { findOneAndUpdate: dependencies.conversationFindOneAndUpdate }
}));
vi.mock("../models/message.model.js", () => ({
  MessageModel: { create: dependencies.messageCreate, exists: dependencies.messageExists }
}));
vi.mock("../realtime/socket.js", () => ({
  emitChatEvent: dependencies.emitChatEvent,
  emitInboxEventToRecipients: dependencies.emitInboxEventToRecipients
}));
vi.mock("../chatbot/telegram-inbound.service.js", () => ({
  processTelegramCustomerMessage: dependencies.processTelegramCustomerMessage
}));
vi.mock("../common/crypto.js", () => ({
  encryptSecret: dependencies.encryptSecret,
  decryptSecret: dependencies.decryptSecret
}));

const api = {
  getContext: vi.fn(() => ({ credentials: { imei: "imei-1", cookie: { sid: "credential-secret" }, userAgent: "ua" } })),
  getAccountInfo: vi.fn(async () => ({ id: "zalo-1", displayName: "Nhuu", username: "nhuu" })),
  onMessage: vi.fn(),
  onError: vi.fn(),
  onClosed: vi.fn(),
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
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00.000Z"));
    vi.clearAllMocks();
    resetApi();
    const { setZaloPersonalRedisLock, shutdownActiveZaloPersonalClients } = await import("./zalo-personal.service.js");
    await shutdownActiveZaloPersonalClients();
    setZaloPersonalRedisLock({ acquire: async () => ({ release: async () => undefined, renew: async () => true }) });
    vi.clearAllMocks();
    resetApi();
    dependencies.createClient.mockImplementation(createQrClient);
    dependencies.findOneAndUpdate.mockResolvedValue(undefined);
    dependencies.updateOne.mockResolvedValue(undefined);
    dependencies.deleteOne.mockResolvedValue(undefined);
    dependencies.findOne.mockReturnValue({
      lean: async () => null,
      select: () => ({ lean: async () => null })
    });
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

  it("reports the approved QR creation error code when native QR login rejects", async () => {
    const failedClient = createQrClient();
    failedClient.loginQR.mockRejectedValue(new Error("native QR generation failed"));
    dependencies.createClient.mockReturnValue(failedClient);
    const { getZaloPersonalSessionStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-qr-create-failure");
    await flushLifecycleQueue();

    expect(await getZaloPersonalSessionStatus("owner-qr-create-failure")).toEqual({
      id: expect.any(String),
      status: "error",
      errorCode: "ZALO_QR_CREATE_FAILED"
    });
  });

  it("fails closed when no distributed ownership provider is configured", async () => {
    const { setZaloPersonalRedisLock, startZaloPersonalQr } = await import("./zalo-personal.service.js");
    setZaloPersonalRedisLock(undefined);

    await expect(startZaloPersonalQr("owner-without-lock")).rejects.toMatchObject({
      code: "ZALO_PERSONAL_LOCK_UNAVAILABLE"
    });
    expect(dependencies.createClient).not.toHaveBeenCalled();
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

  it("does not turn a transient native listener error into a permanent session error", async () => {
    const { getActiveZaloPersonalClient, getZaloPersonalSessionStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-transient-listener-error");
    await flushLifecycleQueue();

    const onError = api.onError.mock.calls[0]?.[0] as ((error: unknown) => void) | undefined;
    expect(onError).toBeTypeOf("function");
    onError?.(new Error("temporary websocket failure"));
    await flushLifecycleQueue();

    expect(await getZaloPersonalSessionStatus("owner-transient-listener-error")).toMatchObject({ status: "connected" });
    expect(await getActiveZaloPersonalClient("owner-transient-listener-error")).toBe(api);
    expect(dependencies.updateOne).not.toHaveBeenCalledWith(
      { ownerId: "owner-transient-listener-error" },
      { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_LISTENER_ERROR" } }
    );
  });

  it("allows a fresh QR after a persisted listener error blocks the old session", async () => {
    dependencies.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-listener-error",
        status: "error",
        lastErrorCode: "ZALO_PERSONAL_LISTENER_ERROR",
        encryptedCredentials: "ciphertext:expired"
      }),
      select: () => ({ lean: async () => ({
        _id: "session-listener-error",
        status: "error",
        lastErrorCode: "ZALO_PERSONAL_LISTENER_ERROR",
        encryptedCredentials: "ciphertext:expired"
      }) })
    });

    const { startZaloPersonalQr } = await import("./zalo-personal.service.js");
    const qr = await startZaloPersonalQr("owner-retry-after-listener-error");

    expect(qr.status).toBe("waiting_qr");
    expect(dependencies.createClient).toHaveBeenCalledOnce();
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

  it("synchronizes the persisted Zalo account id with restored credentials", async () => {
    const restoredClient = createQrClient();
    restoredClient.login.mockResolvedValue(api);
    api.getAccountInfo.mockResolvedValue({ id: "runtime-account", displayName: "Runtime", username: "runtime" });
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockReturnValue({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected", lastErrorCode: null }) })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));

    const { getActiveZaloPersonalClient } = await import("./zalo-personal.service.js");
    await getActiveZaloPersonalClient("owner-runtime-account");

    expect(dependencies.updateOne).toHaveBeenCalledWith(
      { ownerId: "owner-runtime-account" },
      expect.objectContaining({ $set: expect.objectContaining({ zaloUserId: "runtime-account" }) })
    );
  });

  it("keeps the connected owner and encrypted session when listener shutdown fails", async () => {
    const { getActiveZaloPersonalClient, getZaloPersonalSessionStatus, logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");
    const connectedQr = await startZaloPersonalQr("owner-stop-failure");
    await Promise.resolve();
    await Promise.resolve();
    api.stopListener.mockRejectedValueOnce(new Error("native listener did not stop"));

    await expect(logoutZaloPersonal("owner-stop-failure")).rejects.toMatchObject({ code: "ZALO_PERSONAL_LOGOUT_FAILED" });

    expect(await getActiveZaloPersonalClient("owner-stop-failure")).toBeUndefined();
    expect(dependencies.deleteOne).not.toHaveBeenCalledWith({ ownerId: "owner-stop-failure" });
    expect(dependencies.updateOne).toHaveBeenCalledWith(
      { ownerId: "owner-stop-failure" },
      { $set: { status: "error", lastErrorCode: "ZALO_PERSONAL_LOGOUT_STOP_FAILED" } }
    );
    expect((await getZaloPersonalSessionStatus("owner-stop-failure")).status).toBe("error");
    expect(connectedQr.id).toBeTypeOf("string");
  });

  it("does not create a QR listener after a restored listener fails to stop", async () => {
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockImplementation(() => ({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected" }) }),
      lean: async () => ({ _id: "session-restore", status: "connected" })
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
    dependencies.findOne.mockReturnValue({ lean: async () => null, select: () => ({ lean: async () => null }) });
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

  it("waits for a canceled native QR login before allowing a replacement", async () => {
    let resolveOldLogin!: (value: typeof api) => void;
    const oldClient = createQrClient();
    oldClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,old", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      return new Promise<typeof api>((resolve) => { resolveOldLogin = resolve; });
    });
    const replacementClient = createQrClient();
    replacementClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,replacement", expiresAt: new Date("2026-09-15T16:03:00.000Z") });
      await new Promise<void>(() => undefined);
      return api;
    });
    dependencies.createClient
      .mockReturnValueOnce(oldClient)
      .mockReturnValueOnce(replacementClient);
    const { logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-unresolved-login");
    let logoutFinished = false;
    const logout = logoutZaloPersonal("owner-unresolved-login").then(() => { logoutFinished = true; });
    const replacement = startZaloPersonalQr("owner-unresolved-login");
    await Promise.resolve();
    expect(logoutFinished).toBe(false);
    expect(replacementClient.loginQR).not.toHaveBeenCalled();

    resolveOldLogin(api);
    await logout;
    const nextQr = await replacement;

    expect(nextQr).toMatchObject({ status: "waiting_qr", qrData: "data:image/png;base64,replacement" });
    expect(api.startListener).not.toHaveBeenCalled();
    expect(dependencies.findOneAndUpdate).not.toHaveBeenCalledWith(
      { ownerId: "owner-unresolved-login" },
      expect.anything(),
      expect.anything()
    );
    expect(api.stopListener).toHaveBeenCalledOnce();
  });

  it("does not block logout forever when native QR login never settles", async () => {
    const stuckClient = createQrClient();
    stuckClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64:stuck", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      return new Promise<typeof api>(() => undefined);
    });
    dependencies.createClient.mockReturnValue(stuckClient);
    const { logoutZaloPersonal, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await startZaloPersonalQr("owner-stuck-login");
    const logout = logoutZaloPersonal("owner-stuck-login");
    const result = Promise.race([
      logout.then(() => "logout" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 5_000))
    ]);

    await vi.advanceTimersByTimeAsync(2_001);
    await expect(result).resolves.toBe("logout");
  });

  it("discards a QR API that expires while account lookup is blocked", async () => {
    let finishAccountLookup!: () => void;
    const expiringClient = createQrClient();
    expiringClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,expiring", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
      return api;
    });
    const replacementClient = createQrClient();
    replacementClient.loginQR.mockImplementation(async (onQr) => {
      onQr({ qrData: "data:image/png;base64,replacement", expiresAt: new Date("2026-09-15T16:03:00.000Z") });
      await new Promise<void>(() => undefined);
      return api;
    });
    dependencies.createClient
      .mockReturnValueOnce(expiringClient)
      .mockReturnValueOnce(replacementClient);
    api.getAccountInfo.mockImplementation(() => new Promise((resolve) => {
      finishAccountLookup = () => resolve({ id: "zalo-1", displayName: "Nhuu", username: "nhuu" });
    }));
    const { getZaloPersonalQrStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-expire-during-account");
    await Promise.resolve();
    await Promise.resolve();
    vi.setSystemTime(new Date("2026-09-15T16:01:41.000Z"));
    expect(getZaloPersonalQrStatus(qr.id, "owner-expire-during-account").status).toBe("expired");
    finishAccountLookup();
    await flushLifecycleQueue();
    const replacement = await startZaloPersonalQr("owner-expire-during-account");

    expect(api.startListener).not.toHaveBeenCalled();
    expect(dependencies.findOneAndUpdate).not.toHaveBeenCalledWith(
      { ownerId: "owner-expire-during-account" },
      expect.anything(),
      expect.anything()
    );
    expect(replacement).toMatchObject({ status: "waiting_qr", qrData: "data:image/png;base64,replacement" });
    expect(api.stopListener).toHaveBeenCalledOnce();
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
    const replacementPromise = startZaloPersonalQr("owner-expired");
    await Promise.resolve();
    expect(replacementClient.loginQR).not.toHaveBeenCalled();
    finishFirstLogin();
    const replacement = await replacementPromise;

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

  it("compensates a QR write that becomes expired before Mongo confirms it", async () => {
    let resolveWrite!: () => void;
    dependencies.findOneAndUpdate.mockImplementation(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    dependencies.findOne.mockReturnValue({ lean: async () => null, select: () => ({ lean: async () => null }) });
    const { getActiveZaloPersonalClient, getZaloPersonalQrStatus, getZaloPersonalSessionStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-write-expiry");
    await flushLifecycleQueue();
    expect(dependencies.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerId: "owner-write-expiry" },
      expect.anything(),
      { upsert: true, new: true }
    );
    vi.setSystemTime(new Date("2026-09-15T16:01:41.000Z"));
    expect(getZaloPersonalQrStatus(qr.id, "owner-write-expiry").status).toBe("expired");

    resolveWrite();
    await flushLifecycleQueue();

    expect(await getActiveZaloPersonalClient("owner-write-expiry")).toBeUndefined();
    expect((await getZaloPersonalSessionStatus("owner-write-expiry")).status).toBe("expired");
    expect(api.stopListener).toHaveBeenCalledOnce();
    expect(dependencies.deleteOne).toHaveBeenCalledWith({ ownerId: "owner-write-expiry" });
  });

  it("retains the owner when stale-write compensation cannot stop its listener", async () => {
    let resolveWrite!: () => void;
    dependencies.findOneAndUpdate.mockImplementation(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    api.stopListener.mockRejectedValueOnce(new Error("native listener did not stop"));
    const { getZaloPersonalQrStatus, getZaloPersonalSessionStatus, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-compensation-stop-failure");
    await flushLifecycleQueue();
    vi.setSystemTime(new Date("2026-09-15T16:01:41.000Z"));
    expect(getZaloPersonalQrStatus(qr.id, "owner-compensation-stop-failure").status).toBe("expired");

    resolveWrite();
    await flushLifecycleQueue();

    expect(await getZaloPersonalSessionStatus("owner-compensation-stop-failure")).toEqual({
      id: "owner-compensation-stop-failure",
      status: "error",
      errorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED"
    });
    expect(dependencies.deleteOne).not.toHaveBeenCalledWith({ ownerId: "owner-compensation-stop-failure" });
    await expect(startZaloPersonalQr("owner-compensation-stop-failure")).resolves.toEqual({
      id: "owner-compensation-stop-failure",
      status: "error",
      errorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED"
    });
    expect(dependencies.createClient).toHaveBeenCalledOnce();
    expect(api.startListener).toHaveBeenCalledOnce();
  });

  it("blocks a fresh QR from a persisted owner error without exposing credentials", async () => {
    dependencies.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-persisted-error",
        status: "error",
        lastErrorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED",
        encryptedCredentials: "ciphertext:secret",
        zaloUserId: "zalo-1",
        displayName: "Nhuu",
        username: "nhuu"
      }),
      select: () => ({
        lean: async () => ({
          _id: "session-persisted-error",
          status: "error",
          lastErrorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED",
          encryptedCredentials: "ciphertext:secret",
          zaloUserId: "zalo-1",
          displayName: "Nhuu",
          username: "nhuu"
        })
      })
    });
    const { getActiveZaloPersonalClient, shutdownActiveZaloPersonalClients, startZaloPersonalQr } = await import("./zalo-personal.service.js");
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));

    await shutdownActiveZaloPersonalClients();
    const status = await startZaloPersonalQr("owner-persisted-error");

    expect(status).toEqual({
      id: "session-persisted-error",
      status: "error",
      errorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED",
      zaloUserId: "zalo-1",
      displayName: "Nhuu",
      username: "nhuu"
    });
    expect(JSON.stringify(status)).not.toContain("ciphertext:secret");
    expect(await getActiveZaloPersonalClient("owner-persisted-error")).toBeUndefined();
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it("returns persisted connected status instead of creating a competing QR", async () => {
    dependencies.findOne.mockReturnValue({
      lean: async () => ({
        _id: "session-persisted-connected",
        status: "connected",
        lastErrorCode: null,
        zaloUserId: "zalo-1",
        displayName: "Nhuu",
        username: "nhuu"
      })
    });
    const { shutdownActiveZaloPersonalClients, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    await shutdownActiveZaloPersonalClients();
    await expect(startZaloPersonalQr("owner-persisted-connected")).resolves.toEqual({
      id: "session-persisted-connected",
      status: "connected",
      zaloUserId: "zalo-1",
      displayName: "Nhuu",
      username: "nhuu"
    });
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it("bulk restores only persisted connected owners without an error guard", async () => {
    let resolveWrite!: () => void;
    const blockedClient = createQrClient();
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValueOnce(blockedClient).mockReturnValue(restoredClient);
    dependencies.findOneAndUpdate.mockImplementation(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    dependencies.findOne.mockReturnValue({ lean: async () => null });
    api.stopListener.mockRejectedValueOnce(new Error("native listener did not stop"));
    const { getZaloPersonalQrStatus, restoreActiveZaloPersonalClients, startZaloPersonalQr } = await import("./zalo-personal.service.js");

    const qr = await startZaloPersonalQr("owner-runtime-blocked");
    await flushLifecycleQueue();
    vi.setSystemTime(new Date("2026-09-15T16:01:41.000Z"));
    expect(getZaloPersonalQrStatus(qr.id, "owner-runtime-blocked").status).toBe("expired");
    resolveWrite();
    await flushLifecycleQueue();

    dependencies.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { ownerId: "owner-runtime-blocked", status: "connected", lastErrorCode: null, encryptedCredentials: "ciphertext:runtime" },
          { ownerId: "owner-persisted-error", status: "error", lastErrorCode: "ZALO_PERSONAL_QR_COMPENSATION_STOP_FAILED", encryptedCredentials: "ciphertext:error" },
          { ownerId: "owner-stale-error", status: "connected", lastErrorCode: "ZALO_PERSONAL_LOGOUT_STOP_FAILED", encryptedCredentials: "ciphertext:stale" },
          { ownerId: "owner-normal", status: "connected", lastErrorCode: null, encryptedCredentials: "ciphertext:normal" }
        ]
      })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));

    await restoreActiveZaloPersonalClients();

    expect(dependencies.find).toHaveBeenCalledWith({ status: "connected", lastErrorCode: null });
    expect(restoredClient.login).toHaveBeenCalledOnce();
    expect(restoredClient.login).toHaveBeenCalledWith({ imei: "imei-1" });
  });

  it("holds one Redis lease across QR login and releases it after logout", async () => {
    const release = vi.fn(async () => undefined);
    const renew = vi.fn(async () => true);
    const acquire = vi.fn(async () => ({ release, renew }));
    const { logoutZaloPersonal, setZaloPersonalRedisLock, startZaloPersonalQr } = await import("./zalo-personal.service.js");
    setZaloPersonalRedisLock({ acquire });

    await startZaloPersonalQr("owner-held-login-lease");
    await flushLifecycleQueue();
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
    await flushLifecycleQueue();
    expect(renew).toHaveBeenCalledOnce();

    await startZaloPersonalQr("owner-held-login-lease");
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    await logoutZaloPersonal("owner-held-login-lease");
    expect(release).toHaveBeenCalledOnce();
  });

  it("holds a restored Redis lease and releases it once after shutdown", async () => {
    const release = vi.fn(async () => undefined);
    const renew = vi.fn(async () => true);
    const acquire = vi.fn(async () => ({ release, renew }));
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockReturnValue({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected", lastErrorCode: null }) })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));
    const { getActiveZaloPersonalClient, setZaloPersonalRedisLock, shutdownActiveZaloPersonalClients } = await import("./zalo-personal.service.js");
    setZaloPersonalRedisLock({ acquire });

    expect(await getActiveZaloPersonalClient("owner-held-restore-lease")).toBe(api);
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    await shutdownActiveZaloPersonalClients();
    expect(restoredClient.login).toHaveBeenCalledOnce();
    expect(api.stopListener).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("keeps the restored listener after a transient Redis renewal failure", async () => {
    const release = vi.fn(async () => undefined);
    const renew = vi.fn(async () => true).mockRejectedValueOnce(new Error("redis connection reset"));
    const acquire = vi.fn(async () => ({ release, renew }));
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockReturnValue({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected", lastErrorCode: null }) })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));
    const { getActiveZaloPersonalClient, setZaloPersonalRedisLock } = await import("./zalo-personal.service.js");
    setZaloPersonalRedisLock({ acquire });

    expect(await getActiveZaloPersonalClient("owner-transient-renewal")).toBe(api);
    await vi.advanceTimersByTimeAsync(15_500);
    await flushLifecycleQueue();

    expect(renew).toHaveBeenCalledTimes(2);
    expect(api.stopListener).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ["returns false", async () => false],
    ["rejects", async () => { throw new Error("redis unavailable"); }]
  ])("fails closed when Redis renewal %s", async (_label, renew) => {
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async () => ({ release, renew }));
    const restoredClient = createQrClient();
    dependencies.createClient.mockReturnValue(restoredClient);
    dependencies.findOne.mockReturnValue({
      select: () => ({ lean: async () => ({ encryptedCredentials: "ciphertext:stored", status: "connected", lastErrorCode: null }) })
    });
    dependencies.decryptSecret.mockReturnValue(JSON.stringify({ imei: "imei-1" }));
    const {
      getActiveZaloPersonalClient,
      getZaloPersonalSessionStatus,
      setZaloPersonalRedisLock,
      startZaloPersonalQr
    } = await import("./zalo-personal.service.js");
    setZaloPersonalRedisLock({ acquire });

    expect(await getActiveZaloPersonalClient("owner-lost-lease")).toBe(api);
    await vi.advanceTimersByTimeAsync(30_500);
    await flushLifecycleQueue();

    expect(api.stopListener).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(await getZaloPersonalSessionStatus("owner-lost-lease")).toEqual({
      id: "owner-lost-lease",
      status: "error",
      errorCode: "ZALO_PERSONAL_REDIS_LEASE_LOST"
    });
    expect(await startZaloPersonalQr("owner-lost-lease")).toEqual({
      id: "owner-lost-lease",
      status: "error",
      errorCode: "ZALO_PERSONAL_REDIS_LEASE_LOST"
    });
    expect(dependencies.createClient).toHaveBeenCalledOnce();
  });
});

describe("Zalo personal inbound message persistence", () => {
  const ownerId = "owner-inbound";
  const session = { ownerId, zaloUserId: "zalo-account", displayName: "Nhuu" };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00.000Z"));
    vi.clearAllMocks();
    resetApi();
    const { setZaloPersonalRedisLock, shutdownActiveZaloPersonalClients } = await import("./zalo-personal.service.js");
    await shutdownActiveZaloPersonalClients();
    setZaloPersonalRedisLock({ acquire: async () => ({ release: async () => undefined, renew: async () => true }) });
    vi.clearAllMocks();
    resetApi();
    dependencies.createClient.mockImplementation(createQrClient);
    dependencies.findOne.mockImplementation((filter: Record<string, unknown>) => ({
      lean: async () => filter.status === "connected" ? session : null,
      select: () => ({ lean: async () => null })
    }));
    dependencies.findOneAndUpdate.mockResolvedValue(undefined);
    dependencies.updateOne.mockResolvedValue(undefined);
    dependencies.deleteOne.mockResolvedValue(undefined);
    dependencies.customerFindOneAndUpdate.mockResolvedValue({ _id: "customer-1" });
    dependencies.messageExists.mockResolvedValue(false);
    dependencies.messageCreate.mockResolvedValue({
      _id: "message-local-1",
      conversationId: "conversation-1",
      platform: "zalo_personal",
      senderType: "customer",
      senderId: "sender-1",
      type: "text",
      content: "Xin chào",
      deliveryStatus: "delivered",
      metadata: { senderName: "Khách hàng" },
      createdAt: new Date("2026-09-15T15:59:59.000Z"),
      toObject() { return this; }
    });
    dependencies.processTelegramCustomerMessage.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { shutdownActiveZaloPersonalClients } = await import("./zalo-personal.service.js");
    await shutdownActiveZaloPersonalClients();
    vi.useRealTimers();
  });

  function conversationDocument() {
    const conversation = {
      _id: "conversation-1",
      customerId: { _id: "customer-1", name: "Khách hàng", avatarUrl: "https://cdn.example/avatar.jpg" },
      platform: "zalo_personal",
      channelId: "thread-1",
      ownerId,
      assignedAgentId: null,
      unreadCount: 0,
      status: "open",
      lastMessageAt: new Date("2026-09-15T15:59:59.000Z"),
      lastMessageSnippet: "Xin chào",
      conversationName: null,
      conversationType: "private",
      tagIds: [],
      populate: vi.fn(async () => conversation),
      toObject() { return this; }
    };
    return conversation;
  }

  async function startInboundListener() {
    const { startZaloPersonalQr } = await import("./zalo-personal.service.js");
    await startZaloPersonalQr(ownerId);
    await flushLifecycleQueue();
    expect(api.onMessage).toHaveBeenCalledOnce();
    return api.onMessage.mock.calls[0]?.[0] as (event: unknown) => Promise<void>;
  }

  function directEvent(overrides: Record<string, unknown> = {}) {
    return {
      type: 0,
      threadId: "thread-1",
      data: {
        msgId: "zalo-message-1",
        uidFrom: "sender-1",
        dName: "Khách hàng",
        avatar: "https://cdn.example/avatar.jpg",
        content: "Xin chào",
        ts: 1_789_743_599_000,
        msgType: "webchat",
        ...overrides
      }
    };
  }

  it("inbound direct persists the customer message before emitting owner-scoped realtime updates", async () => {
    const conversation = conversationDocument();
    dependencies.conversationFindOneAndUpdate.mockImplementation(async (_filter: unknown, update: Record<string, unknown>) => {
      if ("$inc" in update) conversation.unreadCount += 1;
      return conversation;
    });
    const listener = await startInboundListener();

    await listener(directEvent());

    expect(dependencies.customerFindOneAndUpdate).toHaveBeenCalledWith(
      { platform: "zalo_personal", platformId: "sender-1" },
      expect.objectContaining({
        $set: { name: "Khách hàng", avatarUrl: "https://cdn.example/avatar.jpg" },
        $setOnInsert: { platform: "zalo_personal", platformId: "sender-1" }
      }),
      { upsert: true, new: true }
    );
    expect(dependencies.conversationFindOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { platform: "zalo_personal", channelId: "thread-1", ownerId },
      expect.objectContaining({
        $set: expect.objectContaining({ customerId: "customer-1", ownerId, conversationType: "private", conversationName: null })
      }),
      { upsert: true, new: true }
    );
    expect(dependencies.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-1",
      platform: "zalo_personal",
      externalMessageId: "zalo_personal:zalo-account:zalo-message-1",
      senderType: "customer",
      senderId: "sender-1",
      deliveryStatus: "delivered",
      metadata: { senderName: "Khách hàng", messageType: "webchat" }
    }));
    expect(dependencies.messageExists).toHaveBeenCalledWith({
      platform: "zalo_personal",
      externalMessageId: "zalo_personal:zalo-account:zalo-message-1"
    });
    expect(dependencies.conversationFindOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: "conversation-1", ownerId },
      { $set: { lastMessageAt: new Date("2026-09-18T14:59:59.000Z"), lastMessageSnippet: "Xin chào" }, $inc: { unreadCount: 1 } },
      { returnDocument: "after" }
    );
    expect(dependencies.emitChatEvent).toHaveBeenCalledWith("chat:message_received", "conversation-1", expect.objectContaining({
      platform: "zalo_personal", senderType: "customer", senderName: "Khách hàng", content: "Xin chào", deliveryStatus: "delivered"
    }));
    expect(dependencies.emitInboxEventToRecipients).toHaveBeenCalledWith(
      "chat:conversation_updated",
      [ownerId, ""],
      expect.objectContaining({ platform: "zalo_personal", channelId: "thread-1", unreadCount: 1, customerName: "Khách hàng" })
    );
    expect(dependencies.processTelegramCustomerMessage).toHaveBeenCalledWith({
      ownerId,
      conversationId: "conversation-1",
      customerMessageId: "message-local-1",
      externalMessageId: "zalo-message-1",
      platform: "zalo_personal",
      channelId: "thread-1",
      conversationType: "private",
      senderType: "customer",
      type: "text",
      content: "Xin chào"
    });
  });

  it("inbound group preserves the group thread identity and sender metadata", async () => {
    const conversation = conversationDocument();
    dependencies.conversationFindOneAndUpdate.mockResolvedValue(conversation);
    const listener = await startInboundListener();

    await listener({
      type: 1,
      threadId: "group-7",
      data: {
        msgId: "zalo-group-message-1",
        uidFrom: "member-7",
        dName: "Thành viên",
        content: "Ảnh mới",
        ts: 1_789_743_600_000,
        msgType: "photo"
      }
    });

    expect(dependencies.customerFindOneAndUpdate).toHaveBeenCalledWith(
      { platform: "zalo_personal", platformId: "member-7" },
      expect.objectContaining({ $set: { name: "Thành viên" } }),
      { upsert: true, new: true }
    );
    expect(dependencies.conversationFindOneAndUpdate).toHaveBeenCalledWith(
      { platform: "zalo_personal", channelId: "group-7", ownerId },
      expect.objectContaining({ $set: expect.objectContaining({ conversationType: "group", conversationName: "group-7" }) }),
      { upsert: true, new: true }
    );
    expect(dependencies.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      platform: "zalo_personal", externalMessageId: "zalo_personal:zalo-account:zalo-group-message-1", senderId: "member-7", type: "image",
      metadata: { senderName: "Thành viên", messageType: "photo" }
    }));
  });

  it("inbound media-only messages persist safe metadata and emit without crashing", async () => {
    const conversation = conversationDocument();
    dependencies.conversationFindOneAndUpdate.mockResolvedValue(conversation);
    dependencies.messageCreate.mockImplementation(async (input: Record<string, unknown>) => ({
      _id: "message-media-1",
      createdAt: new Date("2026-09-15T16:00:00.000Z"),
      toObject() { return { ...input, _id: this._id, createdAt: this.createdAt }; }
    }));
    const listener = await startInboundListener();

    await expect(listener(directEvent({
      msgId: "zalo-media-1",
      content: "",
      msgType: "photo",
      propertyExt: {
        url: "https://cdn.example/photo.jpg",
        fileName: "photo.jpg",
        accessToken: "do-not-persist"
      }
    }))).resolves.toBeUndefined();

    expect(dependencies.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      externalMessageId: "zalo_personal:zalo-account:zalo-media-1",
      type: "image",
      content: "",
      metadata: {
        senderName: "Khách hàng",
        messageType: "photo",
        media: { url: "https://cdn.example/photo.jpg", fileName: "photo.jpg" }
      }
    }));
    expect(dependencies.emitChatEvent).toHaveBeenCalledWith("chat:message_received", "conversation-1", expect.objectContaining({
      type: "image", content: ""
    }));
    expect(dependencies.processTelegramCustomerMessage).toHaveBeenCalledWith(expect.objectContaining({
      externalMessageId: "zalo-media-1", type: "image", content: ""
    }));
  });

  it("inbound duplicate external ids do not increment unread or re-emit events", async () => {
    dependencies.messageExists.mockResolvedValue(true);
    const listener = await startInboundListener();

    await listener(directEvent());

    expect(dependencies.messageExists).toHaveBeenCalledWith({
      platform: "zalo_personal",
      externalMessageId: "zalo_personal:zalo-account:zalo-message-1"
    });
    expect(dependencies.customerFindOneAndUpdate).not.toHaveBeenCalled();
    expect(dependencies.conversationFindOneAndUpdate).not.toHaveBeenCalled();
    expect(dependencies.messageCreate).not.toHaveBeenCalled();
    expect(dependencies.emitChatEvent).not.toHaveBeenCalled();
    expect(dependencies.emitInboxEventToRecipients).not.toHaveBeenCalled();
    expect(dependencies.processTelegramCustomerMessage).not.toHaveBeenCalled();
  });

  it("inbound allows a raw external id already used by another Zalo account", async () => {
    const conversation = conversationDocument();
    dependencies.conversationFindOneAndUpdate.mockResolvedValue(conversation);
    dependencies.messageExists.mockImplementation(async ({ externalMessageId }: { externalMessageId: string }) => {
      if (externalMessageId === "zalo_personal:other-account:zalo-message-1") return true;
      if (externalMessageId === "zalo_personal:zalo-account:zalo-message-1") return false;
      throw new Error(`unexpected idempotency key: ${externalMessageId}`);
    });
    const listener = await startInboundListener();

    await listener(directEvent());

    expect(dependencies.messageExists).toHaveBeenCalledWith({
      platform: "zalo_personal",
      externalMessageId: "zalo_personal:zalo-account:zalo-message-1"
    });
    expect(dependencies.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      externalMessageId: "zalo_personal:zalo-account:zalo-message-1"
    }));
  });

  it("inbound self messages are suppressed before persistence", async () => {
    const listener = await startInboundListener();

    await listener(directEvent({ uidFrom: "zalo-account", dName: "Nhuu" }));

    expect(dependencies.messageExists).not.toHaveBeenCalled();
    expect(dependencies.customerFindOneAndUpdate).not.toHaveBeenCalled();
    expect(dependencies.messageCreate).not.toHaveBeenCalled();
    expect(dependencies.emitChatEvent).not.toHaveBeenCalled();
  });

  it("inbound keeps persisted realtime updates when chatbot handoff fails", async () => {
    const conversation = conversationDocument();
    dependencies.conversationFindOneAndUpdate.mockResolvedValue(conversation);
    dependencies.processTelegramCustomerMessage.mockRejectedValue(new Error("bot transport unavailable"));
    const listener = await startInboundListener();

    await expect(listener(directEvent())).resolves.toBeUndefined();

    expect(dependencies.messageCreate).toHaveBeenCalledOnce();
    expect(dependencies.emitChatEvent).toHaveBeenCalledOnce();
    expect(dependencies.emitInboxEventToRecipients).toHaveBeenCalledOnce();
  });
});
