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
const conversationMocks = vi.hoisted(() => ({ findById: vi.fn() }));
vi.mock("../models/conversation.model.js", () => ({ ConversationModel: conversationMocks }));
const workspaceMemberMocks = vi.hoisted(() => ({ findOne: vi.fn(), find: vi.fn() }));
vi.mock("../models/workspace-member.model.js", () => ({ WorkspaceMemberModel: workspaceMemberMocks }));
const workspaceMocks = vi.hoisted(() => ({ findById: vi.fn(), findOne: vi.fn() }));
vi.mock("../models/workspace.model.js", () => ({ WorkspaceModel: workspaceMocks }));

import { createRealtimeServer, disconnectAuthSession, disconnectAuthUser, emitChatEvent, emitInboxEventToRecipients } from "./socket.js";

describe("inbox realtime recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMocks.to.mockReturnValue({ emit: socketMocks.emit });
    socketMocks.in.mockReturnValue({ disconnectSockets: socketMocks.disconnectSockets });
    authMocks.isAuthSessionActive.mockResolvedValue(true);
    workspaceMemberMocks.findOne.mockReturnValue({
      lean: () => Promise.resolve(null), select: () => ({ lean: () => Promise.resolve(null) }),
      sort: () => ({ lean: () => Promise.resolve(null) })
    });
    workspaceMemberMocks.find.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([]) }), select: () => ({ lean: () => Promise.resolve([]) }) });
    workspaceMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    createRealtimeServer({} as never, "");
  });

  it("broadcasts Zalo personal updates only to the owner and assigned recipient rooms", () => {
    const payload = { id: "conversation-1", platform: "zalo_personal" };
    conversationMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({
      ownerId: "owner-1", platform: "zalo_personal", channelId: "target-chat"
    }) }) });
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1", "agent-1"], payload);

    return vi.waitFor(() => {
      expect(socketMocks.to).toHaveBeenCalledWith(["inbox:owner-1", "inbox:agent-1"]);
      expect(socketMocks.to).not.toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1", "inbox:agent-1"]);
      expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_updated", payload);
    });
  });

  it("keeps the shared admin broadcast for shared channels without a Workspace", async () => {
    const payload = { id: "conversation-1", platform: "telegram" };
    conversationMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({
      ownerId: "owner-1", platform: "telegram", channelId: "chat-1"
    }) }) });

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1"], payload);

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1"]));
    expect(socketMocks.to).toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1"]);
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_updated", payload);
  });

  it("routes incoming message notifications using conversationId rather than the message id", async () => {
    const conversation = { ownerId: "owner-1", platform: "facebook", channelId: "page-1" };
    conversationMocks.findById.mockImplementation((id: string) => ({
      select: () => ({ lean: () => Promise.resolve(id === "conversation-1" ? conversation : null) })
    }));
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const message = { id: "message-1", conversationId: "conversation-1", platform: "facebook", senderType: "customer" };

    emitChatEvent("chat:message_received", "conversation-1", message);

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1"]));
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:incoming_message", message);
    expect(conversationMocks.findById).toHaveBeenCalledWith("conversation-1");
    expect(conversationMocks.findById).not.toHaveBeenCalledWith("message-1");
  });

  it("adds only Workspace members permitted for the shared platform and channel", async () => {
    conversationMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({
      ownerId: "owner-1", platform: "telegram", channelId: "chat-1"
    }) }) });
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: "workspace-1" }) }) });
    workspaceMemberMocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { userId: "staff-allowed", role: "staff", allowedChannels: [{ platform: "telegram", channelId: "chat-1" }], allowedPages: [] },
      { userId: "staff-denied", role: "staff", allowedChannels: [{ platform: "facebook", channelId: "chat-1" }], allowedPages: [] },
      { userId: "admin-1", role: "admin", allowedChannels: [], allowedPages: [] }
    ]) }) });

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1"], {
      id: "conversation-1", platform: "telegram", channelId: "chat-1"
    });

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:staff-allowed", "inbox:admin-1"]));
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_updated", {
      id: "conversation-1", platform: "telegram", channelId: "chat-1"
    });
  });

  it("routes deletion events from trusted conversation metadata after the record is removed", async () => {
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: "workspace-1" }) }) });
    workspaceMemberMocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { userId: "owner-1", role: "owner", allowedChannels: [], allowedPages: [] },
      { userId: "staff-allowed", role: "staff", allowedChannels: [{ platform: "facebook", channelId: "page-1" }], allowedPages: ["page-1"] },
      { userId: "staff-denied", role: "staff", allowedChannels: [{ platform: "facebook", channelId: "page-2" }], allowedPages: ["page-2"] }
    ]) }) });
    const payload = { id: "conversation-deleted", platform: "facebook", ownerId: "owner-1", channelId: "page-1", assignedAgentId: "staff-denied" };

    emitInboxEventToRecipients("chat:conversation_deleted", ["owner-1", "staff-denied"], payload);

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:owner-1", "inbox:staff-allowed"]));
    expect(conversationMocks.findById).not.toHaveBeenCalled();
    expect(socketMocks.emit).toHaveBeenCalledWith("chat:conversation_deleted", payload);
  });

  it("broadcasts personal-account updates only to staff assigned that Workspace owner session", async () => {
    conversationMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({
      ownerId: "owner-1", platform: "telegram_personal", channelId: "target-chat"
    }) }) });
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: "workspace-1" }) }) });
    workspaceMemberMocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { userId: "owner-1", role: "owner", allowedPages: [] },
      { userId: "staff-allowed", role: "staff", allowedChannels: [{ platform: "telegram_personal", channelId: "owner-1" }], allowedPages: [] },
      { userId: "staff-denied", role: "staff", allowedChannels: [{ platform: "zalo_personal", channelId: "owner-1" }], allowedPages: [] }
    ]) }) });

    const payload = { id: "conversation-1", platform: "telegram_personal", channelId: "target-chat" };
    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1", "staff-allowed", "staff-denied"], payload);

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:owner-1", "inbox:staff-allowed"]));
    expect(socketMocks.to).not.toHaveBeenCalledWith(["inbox:owner-1", "inbox:staff-allowed", "inbox:staff-denied"]);
    expect(socketMocks.to).not.toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1", "inbox:staff-allowed"]);
  });

  it("does not leak a shared-channel update to an assigned member without channel access", async () => {
    conversationMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({
      ownerId: "owner-1", platform: "telegram", channelId: "chat-1"
    }) }) });
    workspaceMocks.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: "workspace-1" }) }) });
    workspaceMemberMocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([
      { userId: "owner-1", role: "owner", allowedPages: [] },
      { userId: "staff-denied", role: "staff", allowedChannels: [{ platform: "facebook", channelId: "page-1" }], allowedPages: [] }
    ]) }) });

    emitInboxEventToRecipients("chat:conversation_updated", ["owner-1", "staff-denied"], {
      id: "conversation-1", platform: "telegram", channelId: "chat-1"
    });

    await vi.waitFor(() => expect(socketMocks.to).toHaveBeenCalledWith(["inbox:owner-1"]));
    expect(socketMocks.to).not.toHaveBeenCalledWith(["inbox:owner-1", "inbox:staff-denied"]);
    expect(socketMocks.to).not.toHaveBeenCalledWith(["inbox:admins", "inbox:owner-1", "inbox:staff-denied"]);
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

  it("resolves platform-aware Workspace permissions in the socket handshake", async () => {
    const principal = { id: "staff-1", email: "staff@example.com", role: "customer" };
    authMocks.verifyAccessToken.mockResolvedValue(principal);
    workspaceMemberMocks.findOne.mockReturnValue({ lean: () => Promise.resolve({
      workspaceId: "workspace-1", userId: "staff-1", role: "staff", allowedPages: [],
      allowedChannels: [{ platform: "telegram", channelId: "chat-1" }]
    }) });
    workspaceMocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ ownerUserId: "owner-1" }) }) });
    const socket = { data: {}, handshake: { headers: {}, auth: { token: "session-token", workspaceId: "workspace-1" } } };
    const middleware = socketMocks.use.mock.calls[0]?.[0] as (socket: unknown, next: (error?: Error) => void) => Promise<void>;
    const next = vi.fn();

    await middleware(socket, next);

    expect(socket.data).toEqual({ auth: {
      ...principal,
      workspace: { ownerUserId: "owner-1", allowedChannels: [{ platform: "telegram", channelId: "chat-1" }], allowedPages: [] }
    } });
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

    expect(join.mock.calls.map(([room]) => room)).toEqual(["auth-user:user-1", "inbox:user-1"]);
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

  it("honors a conversation join received while session readiness is pending", async () => {
    let finishCheck!: (active: boolean) => void;
    authMocks.isAuthSessionActive.mockImplementation(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    conversationMocks.findById.mockReturnValue({ lean: () => Promise.resolve({ platform: "telegram", ownerId: "user-1", assignedAgentId: null }) });
    const socket = {
      data: { auth: { id: "user-1", email: "admin@example.com", role: "admin", sessionId: "sid-a" } },
      join: vi.fn().mockResolvedValue(undefined), on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn(), disconnected: false
    };
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<boolean>;
    const readiness = connected(socket);
    await vi.waitFor(() => expect(authMocks.isAuthSessionActive).toHaveBeenCalledWith("user-1", "sid-a"));
    try {
      const joinRoom = socket.on.mock.calls.find(([event]) => event === "chat:join_room")?.[1] as
        | ((conversationId: string, callback: (result: { ok: boolean }) => void) => Promise<void>)
        | undefined;
      expect(joinRoom).toBeTypeOf("function");
      const callback = vi.fn();
      const joining = joinRoom!("conversation-1", callback);
      expect(conversationMocks.findById).not.toHaveBeenCalled();

      finishCheck(true);
      await readiness;
      await joining;

      expect(conversationMocks.findById).toHaveBeenCalledWith("conversation-1");
      expect(socket.join).toHaveBeenCalledWith("conversation:conversation-1");
      expect(callback).toHaveBeenCalledWith({ ok: true });
    } finally {
      finishCheck(true);
      await readiness;
    }
  });

  it("withholds inbox rooms when session revocation happens during a pending check", async () => {
    let finishCheck!: (active: boolean) => void;
    authMocks.isAuthSessionActive.mockImplementation(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    const socket = {
      data: { auth: { id: "user-1", email: "admin@example.com", role: "admin", sessionId: "sid-a" } },
      join: vi.fn().mockResolvedValue(undefined), on: vi.fn(), rooms: new Set<string>(), disconnect: vi.fn(), disconnected: false
    };
    socketMocks.disconnectSockets.mockImplementation(() => {
      socket.disconnected = true;
      socket.disconnect(true);
    });
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<boolean>;
    const readiness = connected(socket);
    await vi.waitFor(() => expect(authMocks.isAuthSessionActive).toHaveBeenCalledWith("user-1", "sid-a"));
    try {
      expect(socket.join.mock.calls.map(([room]) => room)).toEqual(["auth-session:sid-a", "auth-user:user-1"]);
      disconnectAuthSession("sid-a");
      finishCheck(true);
      await readiness;

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join.mock.calls.map(([room]) => room)).toEqual(["auth-session:sid-a", "auth-user:user-1"]);
    } finally {
      finishCheck(true);
      await readiness;
    }
  });

  it("disconnects a socket reset while an active session check is pending", async () => {
    let finishCheck!: (active: boolean) => void;
    authMocks.isAuthSessionActive.mockImplementation(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    const rooms = new Set<string>();
    const socket = {
      data: { auth: { id: "user-1", email: "admin@example.com", role: "admin", sessionId: "sid-a" } },
      join: vi.fn(async (room: string) => { rooms.add(room); }),
      on: vi.fn(), rooms, disconnect: vi.fn(), disconnected: false
    };
    socket.disconnect.mockImplementation(() => {
      socket.disconnected = true;
      rooms.clear();
    });
    socketMocks.in.mockImplementation((room: string) => ({
      disconnectSockets: () => { if (rooms.has(room)) socket.disconnect(true); }
    }));
    const connected = socketMocks.on.mock.calls.find(([event]) => event === "connection")?.[1] as (socket: unknown) => Promise<boolean>;
    const readiness = connected(socket);
    await vi.waitFor(() => expect(authMocks.isAuthSessionActive).toHaveBeenCalledWith("user-1", "sid-a"));
    try {
      expect(rooms.has("auth-session:sid-a")).toBe(true);
      expect(rooms.has("auth-user:user-1")).toBe(true);
      expect(rooms.has("inbox:user-1")).toBe(false);
      disconnectAuthUser("user-1");
      finishCheck(true);
      await readiness;

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalledWith("inbox:user-1");
      expect(rooms.has("inbox:user-1")).toBe(false);
    } finally {
      finishCheck(true);
      await readiness;
    }
  });

  it("restricts realtime CORS to configured web origins", () => {
    const source = readFileSync(new URL("./socket.ts", import.meta.url), "utf8");
    expect(source).toContain("origin: realtimeAllowedOrigins()");
    expect(source).not.toContain("origin: true");
  });
});
