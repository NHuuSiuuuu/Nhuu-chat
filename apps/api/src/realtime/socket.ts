import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { verifyAccessToken } from "../auth/auth.service.js";
import { chatEvents } from "@nhuu-chat/contracts";
import { ConversationModel } from "../models/conversation.model.js";
import { canJoinConversation } from "./access.js";

const redisClients = new WeakMap<Server, { pub: RedisClientType; sub: RedisClientType }>();
let activeServer: Server | undefined;

export function createRealtimeServer(httpServer: HttpServer, redisUrl = process.env.REDIS_URL): Server {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("missing token");
      socket.data.auth = await verifyAccessToken(token);
      next();
    } catch { next(new Error("unauthorized")); }
  });
  io.on("connection", (socket) => {
    const auth = socket.data.auth as { id: string; role: string };
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
  activeServer?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitInboxEvent(event: string, ownerId: string | null, payload: unknown): void {
  if (!activeServer) return;
  activeServer.to("inbox:admins").emit(event, payload);
  if (ownerId) activeServer.to(`inbox:${ownerId}`).emit(event, payload);
}

export function emitInboxEventToRecipients(event: string, recipientIds: string[], payload: unknown): void {
  if (!activeServer) return;
  activeServer.to("inbox:admins").emit(event, payload);
  for (const recipientId of new Set(recipientIds.filter(Boolean))) activeServer.to(`inbox:${recipientId}`).emit(event, payload);
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
