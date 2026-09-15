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
    await Promise.resolve();
    await Promise.resolve();
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
});
