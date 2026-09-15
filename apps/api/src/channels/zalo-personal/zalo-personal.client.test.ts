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
    await client.disconnect();
    expect(listener.start).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    expect(zcaApi.sendMessage).toHaveBeenCalledWith("hello", "thread-1", 0);
    await client.login(api.getContext().credentials);
    expect(zca.login).toHaveBeenCalledWith({ imei: "imei", cookie: { cookies: [{ key: "sid", value: "opaque" }] }, userAgent: "ua" });
    vi.useRealTimers();
  });

  it("enables native self-message delivery by default", async () => {
    await createZaloPersonalClient().loginQR(vi.fn());
    expect(nativeConstruction.options.at(-1)).toEqual({ selfListen: true });
  });
});
