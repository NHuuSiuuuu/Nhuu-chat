import { io, type Socket } from "socket.io-client";

export function createChatSocket(baseUrl: string, token: string): Socket {
  return io(baseUrl, { auth: { token }, transports: ["websocket", "polling"] });
}
