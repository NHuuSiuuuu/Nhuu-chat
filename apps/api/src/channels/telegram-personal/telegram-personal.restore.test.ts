import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const findOneAndUpdate = vi.fn(async () => undefined);
const deleteOne = vi.fn(async () => undefined);
const find = vi.fn();
const decryptSecret = vi.fn(() => "restored-session");
const fakeClient = {
  connect: vi.fn(async () => undefined),
  checkAuthorization: vi.fn(async () => true),
  downloadProfilePhoto: vi.fn(async () => Buffer.from("avatar-bytes")),
  addEventHandler: vi.fn(),
  disconnect: vi.fn(async () => undefined)
};

vi.mock("telegram", () => ({
  Api: {},
  TelegramClient: class {
    connect = fakeClient.connect;
    checkAuthorization = fakeClient.checkAuthorization;
    addEventHandler = fakeClient.addEventHandler;
    downloadProfilePhoto = fakeClient.downloadProfilePhoto;
    disconnect = fakeClient.disconnect;
  }
}));
vi.mock("telegram/events/index.js", () => ({ NewMessage: class {} }));
vi.mock("telegram/sessions/index.js", () => ({ StringSession: class { constructor(public readonly value: string) {} } }));
vi.mock("../../common/crypto.js", () => ({ decryptSecret, encryptSecret: vi.fn() }));
vi.mock("./telegram-personal.model.js", () => ({ TelegramPersonalSessionModel: { findOne, find, findOneAndUpdate, deleteOne, updateOne: findOneAndUpdate } }));

describe("Telegram personal session restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_API_ID = "12345";
    process.env.TELEGRAM_API_HASH = "test-api-hash";
    findOne.mockReturnValue({
      select: () => ({
      lean: async () => ({ encryptedSession: "encrypted-session", status: "active", avatarUrl: null })
      })
    });
  });

  it("restores an active session from the encrypted database record after process restart", async () => {
    const { getActivePersonalClient } = await import("../../services/telegram-personal.service.js");

    const client = await getActivePersonalClient("user-1");

    expect(decryptSecret).toHaveBeenCalledWith("encrypted-session");
    expect(fakeClient.connect).toHaveBeenCalledOnce();
    expect(fakeClient.checkAuthorization).toHaveBeenCalledOnce();
    expect(fakeClient.downloadProfilePhoto).toHaveBeenCalledWith("me", { isBig: false });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: "user-1" },
      { $set: { avatarUrl: "data:image/jpeg;base64,YXZhdGFyLWJ5dGVz" } },
      { new: true }
    );
    expect(client).toBeDefined();
  });

  it("restores every active personal session during API startup", async () => {
    find.mockReturnValue({
      select: () => ({
        lean: async () => [{ userId: "user-2", encryptedSession: "encrypted-session", status: "active" }]
      })
    });
    const { restoreActivePersonalClients } = await import("../../services/telegram-personal.service.js");

    await restoreActivePersonalClients();

    expect(find).toHaveBeenCalledWith({ status: "active" });
    expect(decryptSecret).toHaveBeenCalledWith("encrypted-session");
    expect(fakeClient.connect).toHaveBeenCalledOnce();
  });

  it("disconnects the runtime client and deletes the owner's Telegram session", async () => {
    const { getActivePersonalClient, logoutPersonalSession } = await import("../../services/telegram-personal.service.js");

    await expect(getActivePersonalClient("user-logout")).resolves.toBeDefined();
    await logoutPersonalSession("user-logout");

    expect(fakeClient.disconnect).toHaveBeenCalledOnce();
    expect(deleteOne).toHaveBeenCalledWith({ userId: "user-logout" });
  });
});
