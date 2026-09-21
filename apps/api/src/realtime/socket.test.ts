import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socketMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  to: vi.fn(),
  use: vi.fn(),
  on: vi.fn()
}));

vi.mock("socket.io", () => ({
  Server: class {
    constructor() {
      socketMocks.to.mockReturnValue({ emit: socketMocks.emit });
      return socketMocks;
    }
  }
}));

const verifyAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../services/auth.service.js", () => ({ verifyAccessToken }));
vi.mock("../models/conversation.model.js", () => ({ ConversationModel: {} }));

import { createRealtimeServer, emitInboxEventToRecipients } from "./socket.js";

describe("inbox realtime recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMocks.to.mockReturnValue({ emit: socketMocks.emit });
    createRealtimeServer({} as never, undefined);
  });

  it("broadcasts Zalo personal updates only to the owner and assigned recipient rooms", () => {
    const payload = { id: "conversation-1", platform: "zalo_personal" };

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1", "agent-1"], payload);

    expect(socketMocks.to).toHaveBeenCalledWith(["inbox:owner-1", "inbox:agent-1"]);
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_updated", payload);
  });

  it("keeps the shared admin broadcast for existing platforms", () => {
    const payload = { id: "conversation-1", platform: "telegram" };

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1"], payload);

    expect(socketMocks.to).toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1"]);
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_updated", payload);
  });

  it("authenticates a handshake from the access cookie and retains the legacy auth fallback", async () => {
    verifyAccessToken.mockResolvedValue({ id: "user-1", role: "agent" });
    const middleware = socketMocks.use.mock.calls[0]?.[0] as (socket: unknown, next: (error?: Error) => void) => Promise<void>;
    const next = vi.fn();

    await middleware({ data: {}, handshake: { headers: { cookie: "nhuu_access_token=cookie-token" }, auth: {} } }, next);

    expect(verifyAccessToken).toHaveBeenCalledWith("cookie-token");
    expect(next).toHaveBeenCalledWith();
  });

  it("restricts realtime CORS to configured web origins", () => {
    const source = readFileSync(new URL("./socket.ts", import.meta.url), "utf8");
    expect(source).toContain("origin: realtimeAllowedOrigins()");
    expect(source).not.toContain("origin: true");
  });
});
