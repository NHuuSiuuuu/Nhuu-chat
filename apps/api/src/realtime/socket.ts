import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { isAuthSessionActive, verifyAccessToken, type AuthPrincipal } from "../services/auth.service.js";
import { ACCESS_COOKIE_NAME, readCookieHeader } from "../auth/auth.cookies.js";
import { chatEvents } from "@nhuu-chat/contracts";
import { ConversationModel } from "../models/conversation.model.js";
import { canJoinConversation } from "./access.js";
import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";
import { effectiveAllowedChannels, isWorkspaceChannelPlatform } from "../auth/workspace-channel-access.js";

const redisClients = new WeakMap<Server, { pub: RedisClientType; sub: RedisClientType }>();
let activeServer: Server | undefined;

function realtimeAllowedOrigins(): string[] {
  return (process.env.WEB_ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createRealtimeServer(httpServer: HttpServer, redisUrl = process.env.REDIS_URL): Server {
  const io = new Server(httpServer, { cors: { origin: realtimeAllowedOrigins(), credentials: true } });
  io.use(async (socket, next) => {
    try {
      const cookieToken = readCookieHeader(socket.handshake.headers.cookie, ACCESS_COOKIE_NAME);
      const token = cookieToken ?? socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("missing token");
      const auth = await verifyAccessToken(token);
      const requestedWorkspaceId = socket.handshake.auth?.workspaceId;
      let membership = typeof requestedWorkspaceId === "string"
        ? await WorkspaceMemberModel.findOne({ workspaceId: requestedWorkspaceId, userId: auth.id }).lean()
        : await WorkspaceMemberModel.findOne({ userId: auth.id, role: "owner" }).sort({ createdAt: 1 }).lean();
      if (!membership && typeof requestedWorkspaceId !== "string") {
        const rows = await WorkspaceMemberModel.find({ userId: auth.id }).limit(2).lean();
        if (rows.length === 1) membership = rows[0] ?? null;
      }
      if (typeof requestedWorkspaceId === "string" && !membership) throw new Error("workspace membership required");
      if (membership) {
        const workspace = await WorkspaceModel.findById(membership.workspaceId).select("ownerUserId").lean();
        if (!workspace) throw new Error("workspace not found");
        const allowedChannels = membership.role === "staff" ? effectiveAllowedChannels(membership) : [];
        socket.data.auth = {
          ...auth,
          workspace: {
            ownerUserId: String(workspace.ownerUserId), allowedChannels,
            allowedPages: allowedChannels.filter((channel) => channel.platform === "facebook").map((channel) => channel.channelId)
          }
        };
      } else {
        socket.data.auth = auth;
      }
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthPrincipal & { workspace?: { ownerUserId: string; allowedPages: string[]; allowedChannels: ReturnType<typeof effectiveAllowedChannels> } };
    const ready = (async (): Promise<boolean> => {
      try {
        if (auth.sessionId) {
          await socket.join(`auth-session:${auth.sessionId}`);
        }
        await socket.join(`auth-user:${auth.id}`);
        if (auth.sessionId) {
          // Phiên có thể bị thu hồi sau handshake nhưng trước khi socket tham gia room.
          const active = await isAuthSessionActive(auth.id, auth.sessionId);
          if (!active || socket.disconnected) {
            socket.disconnect(true);
            return false;
          }
        }
        if (socket.disconnected) return false;
        await Promise.all([
          socket.join(`inbox:${auth.id}`),
          ...(auth.role === "admin" ? [socket.join("inbox:admins")] : [])
        ]);
        return !socket.disconnected;
      } catch {
        socket.disconnect(true);
        return false;
      }
    })();
    socket.on(chatEvents.joinRoom, async (conversationId: unknown, callback?: (result: { ok: boolean }) => void) => {
      if (!(await ready) || socket.disconnected) return callback?.({ ok: false });
      if (typeof conversationId !== "string" || !conversationId) return callback?.({ ok: false });
      const conversation = await ConversationModel.findById(conversationId).lean().catch(() => null);
      const allowed = Boolean(conversation && canJoinConversation(auth, conversation));
      if (!allowed || socket.disconnected) return callback?.({ ok: false });
      await socket.join(`conversation:${conversationId}`);
      callback?.({ ok: true });
    });
    socket.on(chatEvents.agentTyping, (payload: { conversationId?: unknown; isTyping?: unknown }) => {
      if (typeof payload?.conversationId !== "string") return;
      if (!socket.rooms.has(`conversation:${payload.conversationId}`)) return;
      socket.to(`conversation:${payload.conversationId}`).emit(chatEvents.agentTyping, {
        conversationId: payload.conversationId, isTyping: payload.isTyping === true
      });
    });
    return ready;
  });
  activeServer = io;
  if (redisUrl) void attachRedisAdapter(io, redisUrl).catch((error) => console.error("Redis adapter unavailable", error));
  return io;
}

export function disconnectAuthSession(sessionId: string): void {
  activeServer?.in(`auth-session:${sessionId}`).disconnectSockets(true);
}

export function disconnectAuthUser(userId: string): void {
  activeServer?.in(`auth-user:${userId}`).disconnectSockets(true);
}

export function emitChatEvent(event: string, conversationId: string, payload: unknown): void {
  const server = activeServer;
  if (!server) return;
  server.to(`conversation:${conversationId}`).emit(event, payload);
  if (event === chatEvents.messageReceived && typeof payload === "object" && payload !== null && "senderType" in payload && payload.senderType === "customer") {
    void ConversationModel.findById(conversationId).select("ownerId assignedAgentId platform channelId").lean().then(async (conversation) => {
      if (!conversation) return;
      let recipients = [conversation.ownerId ? String(conversation.ownerId) : "", conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""];
      emitInboxEventToRecipients(
        chatEvents.incomingMessage,
        recipients,
        payload
      );
    }).catch(() => undefined);
  }
}

export function emitInboxEvent(event: string, ownerId: string | null, payload: unknown): void {
  if (!activeServer) return;
  activeServer.to("inbox:admins").emit(event, payload);
  if (ownerId) activeServer.to(`inbox:${ownerId}`).emit(event, payload);
}

// Phát tin vào Inbox theo quyền channel Workspace; kênh cá nhân không đi qua phòng admin chung.
export function emitInboxEventToRecipients(event: string, recipientIds: string[], payload: unknown): void {
  if (!activeServer) return;
  const payloadRecord = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const conversationId = typeof payloadRecord?.conversationId === "string" ? payloadRecord.conversationId
    : typeof payloadRecord?.id === "string" ? payloadRecord.id : null;
  if (conversationId && isWorkspaceChannelPlatform(payloadRecord?.platform)) {
    const server = activeServer;
    const lookup = event === chatEvents.conversationDeleted
      ? Promise.resolve(payloadRecord as { ownerId: string; platform: string; channelId: string })
      : ConversationModel.findById(conversationId).select("ownerId platform channelId").lean();
    void lookup.then(async (conversation) => {
      if (!conversation?.ownerId || !conversation.channelId || !isWorkspaceChannelPlatform(conversation.platform)) return;
      const workspace = await WorkspaceModel.findOne({ ownerUserId: conversation.ownerId }).select("_id").lean();
      if (!workspace) {
        const personalPlatform = conversation.platform === "zalo_personal" || conversation.platform === "telegram_personal";
        const rooms = [...(personalPlatform ? [] : ["inbox:admins"]), ...new Set(recipientIds.filter(Boolean).map((recipientId) => `inbox:${recipientId}`))];
        server.to(rooms).emit(event, payload);
        return;
      }
      const memberships = await WorkspaceMemberModel.find({ workspaceId: workspace._id }).select("userId role allowedPages allowedChannels").lean();
      const authorizedRecipients = memberships.filter((membership) => {
        if (membership.role === "owner" || membership.role === "admin") return true;
        const allowed = effectiveAllowedChannels(membership);
        return allowed.length === 0 || allowed.some((channel) => channel.platform === conversation.platform
          && (conversation.platform === "zalo_personal" || conversation.platform === "telegram_personal"
            ? channel.channelId === String(conversation.ownerId)
            : channel.channelId === conversation.channelId));
      }).map((membership) => String(membership.userId));
      if (authorizedRecipients.length) server.to([...new Set(authorizedRecipients)].map((id) => `inbox:${id}`)).emit(event, payload);
    }).catch(() => undefined);
    return;
  }
  const isZaloPersonal = payloadRecord?.platform === "zalo_personal";
  // Zalo cá nhân chỉ phát đến owner/người được phân công; các nền tảng cũ vẫn dùng phòng admin chung.
  const rooms = [
    ...(isZaloPersonal ? [] : ["inbox:admins"]),
    ...new Set(recipientIds.filter(Boolean).map((recipientId) => `inbox:${recipientId}`))
  ];
  activeServer.to(rooms).emit(event, payload);
}

export async function closeRealtimeServer(io: Server): Promise<void> {
  const clients = redisClients.get(io);
  if (clients?.pub.isOpen) await clients.pub.quit();
  if (clients?.sub.isOpen) await clients.sub.quit();
  redisClients.delete(io);
  if (activeServer === io) activeServer = undefined;
}

async function attachRedisAdapter(io: Server, url: string): Promise<void> {
  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();
  pubClient.on("error", () => undefined);
  subClient.on("error", () => undefined);
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  redisClients.set(io, { pub: pubClient, sub: subClient });
}
