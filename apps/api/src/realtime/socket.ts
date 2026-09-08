import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "../auth/auth.service.js";
import { chatEvents } from "@nhuu-chat/contracts";

export function createRealtimeServer(httpServer: HttpServer): Server {
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
    socket.on(chatEvents.joinRoom, (conversationId: unknown) => {
      if (typeof conversationId === "string" && conversationId.length > 0) socket.join(`conversation:${conversationId}`);
    });
    socket.on(chatEvents.agentTyping, (payload: { conversationId?: unknown; isTyping?: unknown }) => {
      if (typeof payload?.conversationId !== "string") return;
      socket.to(`conversation:${payload.conversationId}`).emit(chatEvents.agentTyping, {
        conversationId: payload.conversationId, isTyping: payload.isTyping === true
      });
    });
  });
  return io;
}
