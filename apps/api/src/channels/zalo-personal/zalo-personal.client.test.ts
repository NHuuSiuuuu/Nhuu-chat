import { describe, expect, it, vi } from "vitest";

import { createZaloPersonalClient } from "./zalo-personal.client.js";

describe("Zalo personal client adapter", () => {
  it("converts QR callback data and delegates login lifecycle", async () => {
    const listener = { on: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const zcaApi = {
      getContext: vi.fn(() => ({ imei: "imei", cookie: ["cookie"], userAgent: "ua" })),
      fetchAccountInfo: vi.fn(async () => ({ profile: { uid: "account-1", dName: "Nhuu", userName: "nhuu" } })),
      listener,
      sendMessage: vi.fn(async () => ({ message: { msgId: 42 }, attachment: [] }))
    };
    const zca = {
      loginQR: vi.fn(async (_options: unknown, callback: (event: unknown) => void) => {
        callback({ type: 0, data: { image: "data:image/png;base64,qr", token: "token" } });
        return zcaApi;
      }),
      login: vi.fn(async () => zcaApi)
    };
    const onQr = vi.fn();
    const client = createZaloPersonalClient({ zcaFactory: () => zca });

    const api = await client.loginQR(onQr);

    expect(onQr).toHaveBeenCalledWith({ qrData: "data:image/png;base64,qr", expiresAt: expect.any(Date) });
    expect(api.getContext().credentials).toEqual({ imei: "imei", cookie: ["cookie"], userAgent: "ua" });
    await api.startListener();
    await api.sendMessage("thread-1", "hello");
    await client.disconnect();
    expect(listener.start).toHaveBeenCalledOnce();
    expect(listener.stop).toHaveBeenCalledOnce();
    expect(zcaApi.sendMessage).toHaveBeenCalledWith("hello", "thread-1", 0);
  });
});
