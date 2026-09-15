import * as zca from "zca-js";

type ZcaCredentials = {
  imei: string;
  cookie: unknown;
  userAgent: string;
  language?: string;
};
type ZcaQrEvent = { type: number; data: { image: string } | null };
type ZcaThreadType = 0 | 1;
const ZaloConstructor = (zca as unknown as { Zalo: new () => { loginQR(options: Record<string, never>, callback: (event: ZcaQrEvent) => unknown): Promise<ZcaApi>; login(credentials: ZcaCredentials): Promise<ZcaApi> } }).Zalo;

export interface ZaloPersonalApi {
  getContext(): { credentials: unknown };
  getAccountInfo(): Promise<{ id?: unknown; displayName?: unknown; username?: unknown }>;
  onMessage(listener: (event: unknown) => Promise<void>): void;
  startListener(): Promise<void>;
  stopListener(): Promise<void>;
  sendMessage(threadId: string, content: string): Promise<{ id: string }>;
}

export interface ZaloPersonalClient {
  loginQR(onQr: (payload: { qrData: string; expiresAt: Date }) => void): Promise<ZaloPersonalApi>;
  login(credentials: unknown): Promise<ZaloPersonalApi>;
  disconnect(): Promise<void>;
}

interface ZcaApi {
  getContext(): Record<string, unknown>;
  fetchAccountInfo(): Promise<{ profile?: Record<string, unknown> }>;
  listener: {
    on(event: "message", listener: (event: unknown) => unknown): void;
    start(): void;
    stop(): void;
  };
  sendMessage(message: string, threadId: string, type: ZcaThreadType): Promise<{ message?: { msgId?: number } | null }>;
}

interface ZcaClientOptions {
  zcaFactory?: () => { loginQR(options: Record<string, never>, callback: (event: ZcaQrEvent) => unknown): Promise<ZcaApi>; login(credentials: ZcaCredentials): Promise<ZcaApi> };
}

export function createZaloPersonalClient(options: ZcaClientOptions = {}): ZaloPersonalClient {
  return new ZaloPersonalClientAdapter(options.zcaFactory ?? (() => new ZaloConstructor()));
}

class ZaloPersonalClientAdapter implements ZaloPersonalClient {
  private activeApi: ZaloPersonalApi | undefined;

  constructor(private readonly createZca: NonNullable<ZcaClientOptions["zcaFactory"]>) {}

  async loginQR(onQr: (payload: { qrData: string; expiresAt: Date }) => void): Promise<ZaloPersonalApi> {
    const zcaApi = await this.createZca().loginQR({}, (event) => {
      if (event.type !== 0 || !event.data) return;
      onQr({ qrData: event.data.image, expiresAt: new Date(Date.now() + 120_000) });
    });
    this.activeApi = this.wrapApi(zcaApi);
    return this.activeApi;
  }

  async login(credentials: unknown): Promise<ZaloPersonalApi> {
    const zcaApi = await this.createZca().login(credentials as ZcaCredentials);
    this.activeApi = this.wrapApi(zcaApi);
    return this.activeApi;
  }

  async disconnect(): Promise<void> {
    if (!this.activeApi) return;
    await this.activeApi.stopListener();
    this.activeApi = undefined;
  }

  private wrapApi(zcaApi: ZcaApi): ZaloPersonalApi {
    return {
      getContext: () => ({ credentials: extractCredentials(zcaApi.getContext()) }),
      getAccountInfo: async () => {
        const profile = (await zcaApi.fetchAccountInfo()).profile ?? {};
        return { id: profile.uid, displayName: profile.dName, username: profile.userName };
      },
      onMessage: (listener) => zcaApi.listener.on("message", (event) => listener(event)),
      // Bọc listener để session manager không phụ thuộc API EventEmitter của zca-js.
      startListener: async () => {
        zcaApi.listener.start();
      },
      stopListener: async () => {
        zcaApi.listener.stop();
      },
      sendMessage: async (threadId, content) => {
        const result = await zcaApi.sendMessage(content, threadId, 0);
        const id = result.message?.msgId;
        if (typeof id !== "number") throw new Error("Zalo API returned an invalid message response");
        return { id: String(id) };
      }
    };
  }
}

function extractCredentials(context: Record<string, unknown>): unknown {
  return {
    imei: context.imei,
    cookie: context.cookie,
    userAgent: context.userAgent,
    ...(context.language ? { language: context.language } : {})
  };
}
