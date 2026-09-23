import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socketMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  to: vi.fn(),
  in: vi.fn(),
  disconnectSockets: vi.fn(),
  use: vi.fn(),
  on: vi.fn()
}));

vi.mock("socket.io", () => ({
  Server: class {
    constructor() {
      socketMocks.to.mockReturnValue({ emit: socketMocks.emit });
      socketMocks.in.mockReturnValue({ disconnectSockets: socketMocks.disconnectSockets });
      return socketMocks;
    }
  }
}));

const authMocks = vi.hoisted(() => ({ verifyAccessToken: vi.fn(), isAuthSessionActive: vi.fn() }));
vi.mock("../services/auth.service.js", () => authMocks);
vi.mock("../models/conversation.model.js", () => ({ ConversationModel: {} }));

import { createRealtimeServer, disconnectAuthSession, disconnectAuthUser, emitInboxEventToRecipients } from "./socket.js";

describe("inbox realtime recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMocks.to.mockReturnValue({ emit: socketMocks.emit });
    socketMocks.in.mockReturnValue({ disconnectSockets: socketMocks.disconnectSockets });
    authMocks.isAuthSessionActive.mockResolvedValue(true);
    createRealtimeServer({} as never, "");
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
    authMocks.verifyAccessToken.mockResolvedValue({ id: "user-1", role: "agent" });
    const middleware = socketMocks.use.mock.calls[0]?.[0] as (socket: unknown, next: (error?: Error) => void) => Promise<void>;
    const next = vi.fn();

    await middleware({ data: {}, handshake: { headers: { cookie: "nhuu_access_token=cookie-token" }, auth: { token: "fallback-token" } } }, next);

    expect(authMocks.verifyAccessToken).toHaveBeenCalledWith("cookie-token");
    expect(next).toHaveBeenCalledWith();
  });

  it("accepts a session-bound token from handshake auth when no cookie is present", async () => {
    const principal = { id: "user-1", email: "agent@example.com", role: "agent", sessionId: "sid-a" };
    authMocks.verifyAccessToken.mockResolvedValue(principal);
    const middleware = socketMocks.use.mock.calls[0]?.[0] as (socket: unknown, next: (error?: Error) => void) => Promise<void>;
    const socket = { data: {}, handshake: { headers: {}, auth: { token: "session-token" } } };
    const next = vi.fn();

    await middleware(socket, next);

    expect(authMocks.verifyAccessToken).toHaveBeenCalledWith("session-token");
    expect(socket.data).toEqual({ auth: principal });
    expect(next).toHaveBeenCalledWith();
  });

  it("joins inbox, user, and session rooms for a session-bound connection", async () => {
    const principal = { id: "user-1", email: "agent@example.com", role: "agent", sessionId: "sid-a" };
    const join = vi.fn().mockResolvedValue(undefined);
    const socket = { data: { auth: principal }, join, on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn() };
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<void>;

    await connected(socket);

    expect(join).toHaveBeenCalledWith("inbox:user-1");
    expect(join).toHaveBeenCalledWith("auth-user:user-1");
    expect(join).toHaveBeenCalledWith("auth-session:sid-a");
    expect(authMocks.isAuthSessionActive).toHaveBeenCalledWith("user-1", "sid-a");
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("joins the user room for a legacy connection without a session room", async () => {
    const principal = { id: "user-1", email: "agent@example.com", role: "agent" };
    const join = vi.fn().mockResolvedValue(undefined);
    const socket = { data: { auth: principal }, join, on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn() };
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<void>;

    await connected(socket);

    expect(join.mock.calls.map(([room]) => room)).toEqual(["inbox:user-1", "auth-user:user-1"]);
    expect(authMocks.isAuthSessionActive).not.toHaveBeenCalled();
  });

  it("disconnects only sockets in the requested auth room", () => {
    disconnectAuthSession("sid-a");
    disconnectAuthUser("user-1");

    expect(socketMocks.in.mock.calls).toEqual([["auth-session:sid-a"], ["auth-user:user-1"]]);
    expect(socketMocks.disconnectSockets).toHaveBeenCalledTimes(2);
    expect(socketMocks.disconnectSockets).toHaveBeenNthCalledWith(1, true);
    expect(socketMocks.disconnectSockets).toHaveBeenNthCalledWith(2, true);
  });

  it("disconnects a session revoked between handshake and room join", async () => {
    const principal = { id: "user-1", email: "agent@example.com", role: "agent", sessionId: "sid-a" };
    authMocks.verifyAccessToken.mockResolvedValue(principal);
    authMocks.isAuthSessionActive.mockResolvedValue(false);
    const socket = {
      data: {}, handshake: { headers: {}, auth: { token: "session-token" } },
      join: vi.fn().mockResolvedValue(undefined), on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn()
    };
    const middleware = socketMocks.use.mock.calls[0]?.[0] as (socket: unknown, next: (error?: Error) => void) => Promise<void>;
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<void>;
    await middleware(socket, vi.fn());

    await connected(socket);

    expect(socket.join).toHaveBeenCalledWith("auth-session:sid-a");
    expect(authMocks.isAuthSessionActive).toHaveBeenCalledWith("user-1", "sid-a");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects when the post-join session check cannot complete", async () => {
    authMocks.isAuthSessionActive.mockRejectedValue(new Error("database unavailable"));
    const socket = {
      data: { auth: { id: "user-1", email: "agent@example.com", role: "agent", sessionId: "sid-a" } },
      join: vi.fn().mockResolvedValue(undefined), on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn()
    };
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<void>;

    await connected(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("restricts realtime CORS to configured web origins", () => {
    const source = readFileSync(new URL("./socket.ts", import.meta.url), "utf8");
    expect(source).toContain("origin: realtimeAllowedOrigins()");
    expect(source).not.toContain("origin: true");
  });
});
