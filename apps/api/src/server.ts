import { createServer } from "node:http";

import { Server as SocketIOServer } from "socket.io";

import { env } from "../../../packages/config/src/env.js";
import { createApp } from "./app.js";

export async function startServer(): Promise<void> {
  const httpServer = createServer(createApp());

  new SocketIOServer(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(env.PORT, resolve);
  });
}

void startServer();
