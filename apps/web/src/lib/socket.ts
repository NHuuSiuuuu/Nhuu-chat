import { io, type Socket } from "socket.io-client";

export function createChatSocket(baseUrl: string, _token?: string): Socket {
  return io(baseUrl, { withCredentials: true, transports: ["websocket", "polling"] });
}
