import { createServer } from "node:http";

import { env } from "@nhuu-chat/config";
import { Server as SocketIOServer } from "socket.io";

import { createApp } from "./app.js";

export async function startServer(): Promise<void> {
  const httpServer = createServer(createApp());

  new SocketIOServer(httpServer);

  await new Promise<void>((resolve, reject) => {
    const onStartupError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off("error", onStartupError);
      httpServer.on("error", (error) => {
        console.error("HTTP server runtime error", error);
        process.exitCode = 1;
        httpServer.close();
      });
      resolve();
    };

    httpServer.once("error", onStartupError);
    httpServer.once("listening", onListening);
    httpServer.listen(env.PORT);
  });
}

void startServer().catch((error) => {
  console.error("Failed to start HTTP server", error);
  process.exitCode = 1;
});
