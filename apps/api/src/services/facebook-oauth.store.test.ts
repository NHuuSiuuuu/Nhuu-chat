import { once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";

import { createClient, type RedisClientType } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RedisFacebookOAuthStore } from "./facebook-oauth.store.js";

type FakeRedis = {
  isOpen: boolean;
  isReady: boolean;
  values: Map<string, string>;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getDel: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function fakeRedis(): FakeRedis {
  const client: FakeRedis = {
    isOpen: false,
    isReady: false,
    values: new Map(),
    on: vi.fn(),
    connect: vi.fn(async () => {
      client.isOpen = true;
      client.isReady = true;
    }),
    set: vi.fn(async (key: string, value: string) => {
      client.values.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => client.values.get(key)),
    getDel: vi.fn(async (key: string) => {
      const value = client.values.get(key);
      client.values.delete(key);
      return value;
    }),
    eval: vi.fn(async (script: string, options: { keys: string[]; arguments: string[] }) => {
      const [valueKey, claimKey] = options.keys;
      const [claimToken] = options.arguments;
      if (script.includes("'NX'")) {
        const value = client.values.get(valueKey);
        if (!value || client.values.has(claimKey)) return undefined;
        client.values.set(claimKey, claimToken);
        return value;
      }
      if (script.includes("'GETDEL'")) {
        if (client.values.get(claimKey) !== claimToken) return undefined;
        const value = client.values.get(valueKey);
        client.values.delete(valueKey);
        client.values.delete(claimKey);
        return value;
      }
      if (client.values.get(valueKey) !== claimToken) return 0;
      client.values.delete(valueKey);
      return 1;
    }),
    sendCommand: vi.fn(async () => "OK"),
    destroy: vi.fn(() => {
      client.isOpen = false;
      client.isReady = false;
    })
  };
  return client;
}

type RedisProtocolServer = {
  url: string;
  connections: Socket[];
  close: () => Promise<void>;
};

function parseRespCommands(input: Buffer): { commands: string[][]; remaining: Buffer } {
  const commands: string[][] = [];
  let offset = 0;

  while (offset < input.length) {
    const commandStart = offset;
    const countEnd = input.indexOf("\r\n", offset);
    if (countEnd === -1) break;
    if (input[offset] !== 42) throw new Error("Expected a RESP array");

    const argumentCount = Number(input.subarray(offset + 1, countEnd).toString());
    offset = countEnd + 2;
    const command: string[] = [];
    let complete = true;

    for (let index = 0; index < argumentCount; index += 1) {
      const lengthEnd = input.indexOf("\r\n", offset);
      if (lengthEnd === -1) {
        complete = false;
        break;
      }
      if (input[offset] !== 36) throw new Error("Expected a RESP bulk string");

      const length = Number(input.subarray(offset + 1, lengthEnd).toString());
      const valueStart = lengthEnd + 2;
      const valueEnd = valueStart + length;
      if (input.length < valueEnd + 2) {
        complete = false;
        break;
      }

      command.push(input.subarray(valueStart, valueEnd).toString());
      offset = valueEnd + 2;
    }

    if (!complete) {
      offset = commandStart;
      break;
    }
    commands.push(command);
  }

  return { commands, remaining: input.subarray(offset) };
}

async function startRedisProtocolServer(
  handleCommand: (command: string[], socket: Socket, connectionNumber: number) => void
): Promise<RedisProtocolServer> {
  const connections: Socket[] = [];
  const server = createServer((socket) => {
    const connectionNumber = connections.push(socket);
    let pending: Buffer = Buffer.alloc(0);
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const parsed = parseRespCommands(pending);
      pending = parsed.remaining;
      for (const command of parsed.commands) handleCommand(command, socket, connectionNumber);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test Redis server did not bind a TCP port");

  return {
    url: `redis://127.0.0.1:${address.port}`,
    connections,
    close: async () => {
      for (const socket of connections) socket.destroy();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

function replyToRedisCommand(command: string[], socket: Socket): void {
  switch (command[0]?.toUpperCase()) {
    case "GET":
      socket.write("$-1\r\n");
      break;
    case "QUIT":
      socket.end("+OK\r\n");
      break;
    default:
      socket.write("+OK\r\n");
  }
}

async function socketClosedWithin(socket: Socket, timeoutMs = 250): Promise<boolean> {
  if (socket.destroyed) return true;
  return (await settleWithin(once(socket, "close"), timeoutMs)).status === "resolved";
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs = 100): Promise<
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown }
  | { status: "pending" }
> {
  return Promise.race([
    promise.then(
      (value) => ({ status: "resolved" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error })
    ),
    new Promise<{ status: "pending" }>((resolve) => {
      setTimeout(() => resolve({ status: "pending" }), timeoutMs);
    })
  ]);
}

describe("RedisFacebookOAuthStore", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "an-encryption-key-that-is-32-characters");
  });

  it("encrypts state at rest and decrypts it on a one-time consume", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = { kind: "oauth" as const, userId: "user-1" };

    await store.save("state-token", value, 600);

    expect(redis.connect).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      "nhuu-chat:facebook-oauth:state-token",
      expect.stringMatching(/^v1\./),
      { EX: 600 }
    );
    expect(redis.values.get("nhuu-chat:facebook-oauth:state-token")).not.toContain(JSON.stringify(value));
    await expect(store.consume("state-token")).resolves.toEqual(value);
    await expect(store.consume("state-token")).resolves.toBeUndefined();
    expect(redis.getDel).toHaveBeenCalledTimes(2);
  });

  it("reads state with GET without writing or refreshing its expiry", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = { kind: "oauth" as const, userId: "user-1" };
    await store.save("state-token", value, 600);
    redis.set.mockClear();

    await expect(store.read("state-token")).resolves.toEqual(value);

    expect(redis.get).toHaveBeenCalledWith("nhuu-chat:facebook-oauth:state-token");
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.values.has("nhuu-chat:facebook-oauth:state-token")).toBe(true);
  });

  it("atomically claims, releases and consumes a selection by claim token", async () => {
    const redis = fakeRedis();
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);
    const value = {
      kind: "selection" as const,
      userId: "user-1",
      pages: [{ id: "page-1", name: "Page One", accessToken: "page-token-1", canPublish: true, canMessage: true }]
    };
    await store.save("selection-token", value, 600);
    redis.get.mockClear();

    await expect(store.claim("selection-token", "claim-1", 600)).resolves.toEqual(value);
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toBeUndefined();
    await store.releaseClaim("selection-token", "wrong-claim");
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toBeUndefined();
    await store.releaseClaim("selection-token", "claim-1");
    await expect(store.claim("selection-token", "claim-2", 600)).resolves.toEqual(value);
    await expect(store.consumeClaim("selection-token", "claim-2")).resolves.toEqual(value);

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenNthCalledWith(1, expect.any(String), {
      keys: ["nhuu-chat:facebook-oauth:selection-token", "nhuu-chat:facebook-oauth:selection-token:claim"],
      arguments: ["claim-1", "600"]
    });
    await expect(store.read("selection-token")).resolves.toBeUndefined();
  });

  it("discards malformed encrypted state instead of returning it", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.values.set("nhuu-chat:facebook-oauth:broken", "not-encrypted-json");
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);

    await expect(store.consume("broken")).resolves.toBeUndefined();
  });

  it.each([
    ["connect", (store: RedisFacebookOAuthStore) => store.read("state-token")],
    ["set", (store: RedisFacebookOAuthStore) => store.save("state-token", { kind: "oauth", userId: "user-1" }, 600)],
    ["get", (store: RedisFacebookOAuthStore) => store.read("state-token")],
    ["getDel", (store: RedisFacebookOAuthStore) => store.consume("state-token")],
    ["eval", (store: RedisFacebookOAuthStore) => store.claim("selection-token", "claim-1", 600)]
  ])("bounds a stalled Redis %s and returns a sanitized finite error", async (method, invoke) => {
    const redis = fakeRedis();
    if (method !== "connect") {
      redis.isOpen = true;
      redis.isReady = true;
    }
    redis[method as "connect" | "set" | "get" | "getDel" | "eval"].mockImplementation(
      () => new Promise(() => undefined)
    );
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      operationTimeoutMs: 5
    });

    const result = await settleWithin<unknown>(invoke(store));

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.error).toMatchObject({
      name: "AppError",
      statusCode: 503,
      code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
      message: "Facebook OAuth is temporarily unavailable"
    });
  });

  it("sanitizes Redis failures instead of exposing connection details", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.get.mockRejectedValue(new Error("connect ECONNREFUSED redis://user:secret@redis.internal:6379"));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      operationTimeoutMs: 5
    });

    await expect(store.read("state-token")).rejects.toMatchObject({
      statusCode: 503,
      code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE",
      message: "Facebook OAuth is temporarily unavailable"
    });
  });

  it("shares one in-flight Redis connection across concurrent requests", async () => {
    const redis = fakeRedis();
    let finishConnect: (() => void) | undefined;
    redis.connect.mockImplementation(() => {
      redis.isOpen = true;
      return new Promise<void>((resolve) => {
        finishConnect = () => {
          redis.isReady = true;
          resolve();
        };
      });
    });
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType);

    const reads = Promise.all([store.read("state-1"), store.read("state-2")]);
    await vi.waitFor(() => expect(redis.connect).toHaveBeenCalledOnce());
    finishConnect?.();

    await expect(reads).resolves.toEqual([undefined, undefined]);
    expect(redis.connect).toHaveBeenCalledOnce();
  });

  it("does not open a Redis socket when close wins before a scheduled connect", async () => {
    const redisServer = await startRedisProtocolServer(replyToRedisCommand);
    const redis = createClient({
      url: redisServer.url,
      socket: { reconnectStrategy: false }
    });
    const store = new RedisFacebookOAuthStore(redis, {
      operationTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });
    const readResult = settleWithin(store.read("shutdown-race"), 250);

    try {
      await expect(store.close()).resolves.toBeUndefined();
      const result = await readResult;

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.error).toMatchObject({
          code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE"
        });
      }
      expect(redisServer.connections).toHaveLength(0);
      expect(redis.isOpen).toBe(false);
    } finally {
      if (redis.isOpen) redis.destroy();
      await redisServer.close();
    }
  });

  it("destroys a socket that opens after a cancelled connect outlives close", async () => {
    const redisServer = await startRedisProtocolServer(replyToRedisCommand);
    const redis = fakeRedis();
    let connectAfterClose: (() => void) | undefined;
    let clientSocket: Socket | undefined;
    redis.connect.mockImplementation(() => new Promise<void>((resolve, reject) => {
      connectAfterClose = () => {
        const { port } = new URL(redisServer.url);
        clientSocket = createConnection({ host: "127.0.0.1", port: Number(port) });
        clientSocket.once("connect", () => {
          redis.isOpen = true;
          redis.isReady = true;
          resolve();
        });
        clientSocket.once("error", reject);
      };
    }));
    redis.destroy.mockImplementation(() => {
      redis.isOpen = false;
      redis.isReady = false;
      clientSocket?.destroy();
    });
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      operationTimeoutMs: 5,
      shutdownTimeoutMs: 5
    });

    try {
      const readResult = settleWithin(store.read("late-connect"));
      await vi.waitFor(() => expect(redis.connect).toHaveBeenCalledOnce());
      const result = await readResult;
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.error).toMatchObject({
          code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE"
        });
      }
      await expect(store.close()).resolves.toBeUndefined();

      connectAfterClose?.();
      await vi.waitFor(() => expect(redisServer.connections).toHaveLength(1));

      await expect(socketClosedWithin(redisServer.connections[0]!)).resolves.toBe(true);
      expect(redis.isOpen).toBe(false);
    } finally {
      clientSocket?.destroy();
      await redisServer.close();
    }
  });

  it("destroys a timed-out real Redis handshake and reconnects on a later request", async () => {
    const redisServer = await startRedisProtocolServer((command, socket, connectionNumber) => {
      if (connectionNumber > 1) replyToRedisCommand(command, socket);
    });
    const redis = createClient({
      url: redisServer.url,
      socket: { reconnectStrategy: false }
    });
    const store = new RedisFacebookOAuthStore(redis, {
      operationTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });

    try {
      await expect(store.read("stalled-handshake")).rejects.toMatchObject({
        code: "FACEBOOK_OAUTH_STORE_UNAVAILABLE"
      });
      expect(redisServer.connections).toHaveLength(1);
      await expect(socketClosedWithin(redisServer.connections[0]!)).resolves.toBe(true);

      await expect(store.read("retry")).resolves.toBeUndefined();
      expect(redisServer.connections).toHaveLength(2);
    } finally {
      await store.close().catch(() => undefined);
      await redisServer.close();
    }
  });

  it("destroys an open but unready Redis client without waiting for QUIT", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(settleWithin(store.close())).resolves.toMatchObject({ status: "resolved" });
    expect(redis.sendCommand).not.toHaveBeenCalled();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("forces Redis destruction when graceful QUIT exceeds the shutdown deadline", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.sendCommand.mockImplementation(() => new Promise(() => undefined));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(settleWithin(store.close())).resolves.toMatchObject({ status: "resolved" });
    expect(redis.sendCommand).toHaveBeenCalledWith(["QUIT"]);
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("forces Redis destruction when graceful QUIT fails", async () => {
    const redis = fakeRedis();
    redis.isOpen = true;
    redis.isReady = true;
    redis.sendCommand.mockRejectedValue(new Error("socket closed"));
    const store = new RedisFacebookOAuthStore(redis as unknown as RedisClientType, {
      shutdownTimeoutMs: 5
    });

    await expect(store.close()).resolves.toBeUndefined();
    expect(redis.destroy).toHaveBeenCalledOnce();
  });

  it("force-closes a real Redis socket when QUIT does not answer", async () => {
    let quitReceived = false;
    const redisServer = await startRedisProtocolServer((command, socket) => {
      if (command[0]?.toUpperCase() === "QUIT") {
        quitReceived = true;
        return;
      }
      replyToRedisCommand(command, socket);
    });
    const redis = createClient({
      url: redisServer.url,
      socket: { reconnectStrategy: false }
    });
    const store = new RedisFacebookOAuthStore(redis, {
      operationTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });

    try {
      await expect(store.read("ready-client")).resolves.toBeUndefined();
      const socket = redisServer.connections[0]!;

      await expect(store.close()).resolves.toBeUndefined();

      expect(quitReceived).toBe(true);
      await expect(socketClosedWithin(socket)).resolves.toBe(true);
    } finally {
      await redisServer.close();
    }
  });
});
