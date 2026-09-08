import { createServer } from "node:http";

import { env } from "@nhuu-chat/config";
import { Server as SocketIOServer } from "socket.io";

import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./db/mongoose.js";

export async function startServer(): Promise<void> {
  await connectDatabase(env.MONGODB_URI);
  const httpServer = createServer(createApp());

  const socketServer = new SocketIOServer(httpServer);

  const shutdown = async () => {
    socketServer.close();
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });
    await disconnectDatabase();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
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
          void shutdown();
        });
        resolve();
      };

      httpServer.once("error", onStartupError);
      httpServer.once("listening", onListening);
      httpServer.listen(env.PORT);
    });
  } catch (error) {
    await disconnectDatabase();
    throw error;
  }
}

void startServer().catch((error) => {
  console.error("Failed to start HTTP server", error);
  process.exitCode = 1;
});
