import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { isAuthSessionActive, verifyAccessToken, type AuthPrincipal } from "../services/auth.service.js";
import { ACCESS_COOKIE_NAME, readCookieHeader } from "../auth/auth.cookies.js";
import { chatEvents } from "@nhuu-chat/contracts";
import { ConversationModel } from "../models/conversation.model.js";
import { canJoinConversation } from "./access.js";

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
      socket.data.auth = await verifyAccessToken(token);
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    const auth = socket.data.auth as AuthPrincipal;
    const ready = (async (): Promise<boolean> => {
      try {
        if (auth.sessionId) {
          await socket.join(`auth-session:${auth.sessionId}`);
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
          socket.join(`auth-user:${auth.id}`),
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
    void ConversationModel.findById(conversationId).select("ownerId assignedAgentId").lean().then((conversation) => {
      if (!conversation) return;
      emitInboxEventToRecipients(
        chatEvents.incomingMessage,
        [conversation.ownerId ? String(conversation.ownerId) : "", conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""],
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
