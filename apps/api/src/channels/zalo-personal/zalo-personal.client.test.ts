import { describe, expect, it, vi } from "vitest";

import { createZaloPersonalClient } from "./zalo-personal.client.js";

const nativeConstruction = vi.hoisted(() => ({ options: [] as unknown[] }));

vi.mock("zca-js", () => ({
  Zalo: class {
    constructor(options: unknown) {
      nativeConstruction.options.push(options);
    }

    async loginQR() {
      return { getContext: () => ({}), fetchAccountInfo: async () => ({ profile: {} }), listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() }, sendMessage: async () => ({ message: { msgId: 1 } }) };
    }

    async login() {
      return this.loginQR();
    }
  }
}));

describe("Zalo personal client adapter", () => {
  it("converts QR callback data and delegates login lifecycle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00.000Z"));
    const listener = { on: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const cookieJar = { toJSON: vi.fn(() => ({ cookies: [{ key: "sid", value: "opaque" }] })) };
    const zcaApi = {
      getContext: vi.fn(() => ({ imei: "imei", cookie: cookieJar, userAgent: "ua" })),
      fetchAccountInfo: vi.fn(async () => ({ profile: { uid: "account-1", dName: "Nhuu", userName: "nhuu" } })),
      listener,
      sendMessage: vi.fn(async () => ({ message: { msgId: 42 }, attachment: [] }))
    };
    const zca = {
      loginQR: vi.fn(async (_options: unknown, callback: (event: unknown) => void) => {
        callback({ type: 0, data: { image: "data:image/png;base64,qr", token: "token" } });
        return zcaApi;
      }),
      login: vi.fn(async (_credentials: unknown) => zcaApi)
    };
    const onQr = vi.fn();
    const client = createZaloPersonalClient({ zcaFactory: () => zca });

    const api = await client.loginQR(onQr);

    expect(onQr).toHaveBeenCalledWith({ qrData: "data:image/png;base64,qr", expiresAt: new Date("2026-09-15T16:01:40.000Z") });
    expect(api.getContext().credentials).toEqual({ imei: "imei", cookie: { cookies: [{ key: "sid", value: "opaque" }] }, userAgent: "ua" });
    expect(api.getContext().credentials).not.toBe(cookieJar);
    await api.startListener();
    await api.sendMessage("thread-1", "hello");
    await api.sendMessage("group-1", "hello group", "group");
    await client.disconnect();
    expect(listener.start).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    expect(zcaApi.sendMessage).toHaveBeenCalledWith("hello", "thread-1", 0);
    expect(zcaApi.sendMessage).toHaveBeenCalledWith("hello group", "group-1", 1);
    await client.login(api.getContext().credentials);
    expect(zca.login).toHaveBeenCalledWith({ imei: "imei", cookie: { cookies: [{ key: "sid", value: "opaque" }] }, userAgent: "ua" });
    vi.useRealTimers();
  });

  it("normalizes the zca-js 2.2 account profile fields after QR login", async () => {
    const zcaApi = {
      getContext: vi.fn(() => ({ imei: "imei", cookie: [], userAgent: "ua" })),
      fetchAccountInfo: vi.fn(async () => ({ profile: { userId: "account-2", displayName: "Demo Zalo", username: "demo-zalo" } })),
      listener: { on: vi.fn(), start: vi.fn(), stop: vi.fn() },
      sendMessage: vi.fn(async () => ({ message: { msgId: 1 } }))
    };
    const client = createZaloPersonalClient({
      zcaFactory: () => ({ loginQR: async () => zcaApi, login: async () => zcaApi })
    });

    const api = await client.loginQR(vi.fn());

    await expect(api.getAccountInfo()).resolves.toEqual({
      id: "account-2",
      displayName: "Demo Zalo",
      username: "demo-zalo"
    });
  });

  it("enables native self-message delivery by default", async () => {
    await createZaloPersonalClient().loginQR(vi.fn());
    expect(nativeConstruction.options.at(-1)).toEqual({ selfListen: true });
  });

  it("aborts an unresolved native QR login when the adapter disconnects", async () => {
    let rejectNativeLogin!: (error: Error) => void;
    const abort = vi.fn(() => rejectNativeLogin(new Error("QR login aborted")));
    const zca = {
      loginQR: vi.fn((_options: unknown, callback: (event: unknown) => void) => {
        callback({ type: 0, data: { image: "data:image/png;base64,qr" }, actions: { abort } });
        return new Promise<never>((_resolve, reject) => { rejectNativeLogin = reject; });
      }),
      login: vi.fn()
    };
    const client = createZaloPersonalClient({ zcaFactory: () => zca });

    const login = client.loginQR(vi.fn());
    await Promise.resolve();
    await client.disconnect();

    expect(abort).toHaveBeenCalledOnce();
    await expect(login).rejects.toThrow("QR login aborted");
  });

  it("exposes native listener errors without leaving an unhandled event path", async () => {
    const nativeListeners = new Map<string, (value: unknown) => unknown>();
    const zcaApi = {
      getContext: () => ({}),
      fetchAccountInfo: async () => ({ profile: {} }),
      listener: {
        on: (event: string, listener: (value: unknown) => unknown) => nativeListeners.set(event, listener),
        start: vi.fn(),
        stop: vi.fn()
      },
      sendMessage: async () => ({ message: { msgId: 1 } })
    };
    const client = createZaloPersonalClient({ zcaFactory: () => ({ loginQR: async () => zcaApi, login: async () => zcaApi }) });
    const api = await client.loginQR(vi.fn());
    const onError = vi.fn();
    api.onError(onError);

    nativeListeners.get("error")?.(new Error("socket closed"));

    expect(onError).toHaveBeenCalledOnce();
  });
});
