import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "@nhuu-chat/config";

import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./db/mongoose.js";
import { createRealtimeServer } from "./realtime/socket.js";

import type { Server as HttpServer } from "node:http";

export interface ServerDependencies {
  connectDatabase?: (uri: string) => Promise<void>;
  disconnectDatabase?: () => Promise<void>;
  listen?: (server: HttpServer, port: number) => Promise<void>;
}

export interface ServerHandle {
  shutdown: () => Promise<void>;
}

function listenHttpServer(server: HttpServer, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onStartupError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onStartupError);
      resolve();
    };

    server.once("error", onStartupError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

export async function startServer(dependencies: ServerDependencies = {}): Promise<ServerHandle> {
  const connect = dependencies.connectDatabase ?? connectDatabase;
  const disconnect = dependencies.disconnectDatabase ?? disconnectDatabase;
  await connect(env.MONGODB_URI);
  const httpServer = createServer(createApp());

  const socketServer = createRealtimeServer(httpServer);

  const shutdown = async () => {
    socketServer.close();
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });
    await disconnect();
  };

  try {
    await (dependencies.listen ?? listenHttpServer)(httpServer, env.PORT);
  } catch (error) {
    await shutdown();
    throw error;
  }

  if (!dependencies.listen) {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    httpServer.on("error", (error) => {
      console.error("HTTP server runtime error", error);
      process.exitCode = 1;
      void shutdown();
    });
  }

  return { shutdown };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void startServer().catch((error) => {
    console.error("Failed to start HTTP server", error);
    process.exitCode = 1;
  });
}
