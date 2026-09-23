import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { verifyAccessToken } from "../services/auth.service.js";
import { ACCESS_COOKIE_NAME, readCookieHeader } from "../auth/auth.cookies.js";
import { chatEvents } from "@nhuu-chat/contracts";
import { ConversationModel } from "../models/conversation.model.js";
import { canJoinConversation } from "./access.js";
import { WorkspaceMemberModel } from "../models/workspace-member.model.js";
import { WorkspaceModel } from "../models/workspace.model.js";

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
        if (workspace) socket.data.auth = {
          ...auth,
          workspace: {
            ownerUserId: String(workspace.ownerUserId),
            allowedPages: membership.allowedPages ?? []
          }
        };
      }
      if (!socket.data.auth) socket.data.auth = auth;
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    const auth = socket.data.auth as { id: string; role: string; workspace?: { ownerUserId: string; allowedPages: string[] } };
    void socket.join(`inbox:${auth.id}`);
    if (auth.role === "admin") void socket.join("inbox:admins");
    socket.on(chatEvents.joinRoom, async (conversationId: unknown, callback?: (result: { ok: boolean }) => void) => {
      if (typeof conversationId !== "string" || !conversationId) return callback?.({ ok: false });
      const conversation = await ConversationModel.findById(conversationId).lean().catch(() => null);
      const allowed = Boolean(conversation && canJoinConversation(auth, conversation));
      if (!allowed) return callback?.({ ok: false });
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
  });
  activeServer = io;
  if (redisUrl) void attachRedisAdapter(io, redisUrl).catch((error) => console.error("Redis adapter unavailable", error));
  return io;
}

export function emitChatEvent(event: string, conversationId: string, payload: unknown): void {
  const server = activeServer;
  if (!server) return;
  server.to(`conversation:${conversationId}`).emit(event, payload);
  if (event === chatEvents.messageReceived && typeof payload === "object" && payload !== null && "senderType" in payload && payload.senderType === "customer") {
    void ConversationModel.findById(conversationId).select("ownerId assignedAgentId platform channelId").lean().then(async (conversation) => {
      if (!conversation) return;
      let recipients = [conversation.ownerId ? String(conversation.ownerId) : "", conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""];
      if (conversation.platform === "facebook" && conversation.ownerId && conversation.channelId) {
        const workspace = await WorkspaceModel.findOne({ ownerUserId: conversation.ownerId }).select("_id").lean();
        if (workspace) {
          const memberships = await WorkspaceMemberModel.find({ workspaceId: workspace._id }).select("userId allowedPages").lean();
          recipients = [...recipients, ...memberships
            .filter((membership) => !membership.allowedPages?.length || membership.allowedPages.includes(conversation.channelId!))
            .map((membership) => String(membership.userId))];
        }
      }
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

export function emitInboxEventToRecipients(event: string, recipientIds: string[], payload: unknown): void {
  if (!activeServer) return;
  const isZaloPersonal = Boolean(
    payload
    && typeof payload === "object"
    && "platform" in payload
    && payload.platform === "zalo_personal"
  );
  const isFacebook = Boolean(payload && typeof payload === "object" && "platform" in payload && payload.platform === "facebook");
  // Kênh cá nhân và Facebook phát theo người nhận đã được kiểm tra quyền Workspace.
  const rooms = [
    ...(isZaloPersonal || isFacebook ? [] : ["inbox:admins"]),
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
