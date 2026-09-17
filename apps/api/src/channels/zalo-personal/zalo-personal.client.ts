import * as zca from "zca-js";

type ZcaCredentials = {
  imei: string;
  cookie: unknown;
  userAgent: string;
  language?: string;
};
type ZcaQrEvent = {
  type: number;
  data: { image: string } | null;
  actions?: { abort?: () => unknown } | null;
};
type ZcaSendMessageResult = { msgId?: number | string };
type ZcaThreadType = 0 | 1;
type ZaloAttachment = { buffer: Buffer; filename: string; mimeType: string; size: number };
export type ZaloConversationType = "private" | "group";
type ZcaConstructor = new (options?: { selfListen?: boolean }) => { loginQR(options: Record<string, never>, callback: (event: ZcaQrEvent) => unknown): Promise<ZcaApi>; login(credentials: ZcaCredentials): Promise<ZcaApi> };
const ZaloConstructor = (zca as unknown as { Zalo: ZcaConstructor }).Zalo;

export interface ZaloPersonalApi {
  getContext(): { credentials: unknown };
  getAccountInfo(): Promise<{ id?: unknown; displayName?: unknown; username?: unknown }>;
  onMessage(listener: (event: unknown) => Promise<void>): void;
  onError(listener: (error: unknown) => void): void;
  onClosed(listener: (code?: unknown, reason?: unknown) => void): void;
  startListener(): Promise<void>;
  stopListener(): Promise<void>;
  sendMessage(threadId: string, content: string, conversationType?: ZaloConversationType, attachment?: ZaloAttachment): Promise<{ id: string }>;
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
    on(event: "error", listener: (error: unknown) => unknown): void;
    on(event: "closed", listener: (code?: unknown, reason?: unknown) => unknown): void;
    start(options?: { retryOnClose?: boolean }): void;
    stop(): void;
  };
  sendMessage(message: string | { msg: string; attachments?: { data: Buffer; filename: string; metadata: { totalSize: number } } | { data: Buffer; filename: string; metadata: { totalSize: number } }[] }, threadId: string, type: ZcaThreadType): Promise<{ message?: ZcaSendMessageResult | null; attachment?: ZcaSendMessageResult[] }>;
}

interface ZcaClientOptions {
  zcaFactory?: () => { loginQR(options: Record<string, never>, callback: (event: ZcaQrEvent) => unknown): Promise<ZcaApi>; login(credentials: ZcaCredentials): Promise<ZcaApi> };
}

export function createZaloPersonalClient(options: ZcaClientOptions = {}): ZaloPersonalClient {
  return new ZaloPersonalClientAdapter(options.zcaFactory ?? (() => new ZaloConstructor({ selfListen: true })));
}

class ZaloPersonalClientAdapter implements ZaloPersonalClient {
  private activeApi: ZaloPersonalApi | undefined;
  private abortQrLogin: (() => unknown) | undefined;

  constructor(private readonly createZca: NonNullable<ZcaClientOptions["zcaFactory"]>) {}

  async loginQR(onQr: (payload: { qrData: string; expiresAt: Date }) => void): Promise<ZaloPersonalApi> {
    try {
      const zcaApi = await this.createZca().loginQR({}, (event) => {
        // Giữ action abort nội bộ để disconnect hủy được native QR đang chờ quét.
        if (typeof event.actions?.abort === "function") this.abortQrLogin = event.actions.abort;
        if (event.type !== 0 || !event.data) return;
        onQr({ qrData: event.data.image, expiresAt: new Date(Date.now() + 100_000) });
      });
      this.activeApi = this.wrapApi(zcaApi);
      return this.activeApi;
    } finally {
      this.abortQrLogin = undefined;
    }
  }

  async login(credentials: unknown): Promise<ZaloPersonalApi> {
    const zcaApi = await this.createZca().login(credentials as ZcaCredentials);
    this.activeApi = this.wrapApi(zcaApi);
    return this.activeApi;
  }

  async disconnect(): Promise<void> {
    const abort = this.abortQrLogin;
    this.abortQrLogin = undefined;
    abort?.();
    if (!this.activeApi) return;
    await this.activeApi.stopListener();
    this.activeApi = undefined;
  }

  private wrapApi(zcaApi: ZcaApi): ZaloPersonalApi {
    return {
      getContext: () => ({ credentials: extractCredentials(zcaApi.getContext()) }),
      getAccountInfo: async () => {
        const profile = (await zcaApi.fetchAccountInfo()).profile ?? {};
        // zca-js 2.2 đổi tên field profile; giữ fallback cho payload của các bản cũ.
        return {
          id: profile.userId ?? profile.uid,
          displayName: profile.displayName ?? profile.dName,
          username: profile.username ?? profile.userName
        };
      },
      // Bắt rejection của callback async để lỗi một event không làm chết tiến trình API.
      onMessage: (listener) => zcaApi.listener.on("message", (event) => {
        void Promise.resolve(listener(event)).catch(() => undefined);
      }),
      onError: (listener) => zcaApi.listener.on("error", listener),
      onClosed: (listener) => zcaApi.listener.on("closed", listener),
      // Bọc listener để session manager không phụ thuộc API EventEmitter của zca-js.
      startListener: async () => {
        zcaApi.listener.start({ retryOnClose: true });
      },
      stopListener: async () => {
        zcaApi.listener.stop();
      },
      sendMessage: async (threadId, content, conversationType = "private", attachment) => {
        // zca-js dùng type 1 cho group và type 0 cho direct; không được suy ra chỉ từ thread id.
        const threadType: ZcaThreadType = conversationType === "group" ? 1 : 0;
        const result = await zcaApi.sendMessage(
          attachment
            ? { msg: content, attachments: [{ data: attachment.buffer, filename: attachment.filename, metadata: { totalSize: attachment.size } }] }
            : content,
          threadId,
          threadType
        );
        // Ảnh có chú thích có thể chỉ trả ID trong mảng attachment dù đã gửi thành công.
        const id = result.message?.msgId ?? result.attachment?.[0]?.msgId;
        if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") {
          throw new Error("Zalo API returned an invalid message response");
        }
        return { id: String(id) };
      }
    };
  }
}

function extractCredentials(context: Record<string, unknown>): unknown {
  const cookie = context.cookie;
  const serializedCookie = isRecord(cookie) && typeof cookie.toJSON === "function"
    ? cookie.toJSON()
    : cookie;
  return {
    imei: context.imei,
    cookie: serializedCookie,
    userAgent: context.userAgent,
    ...(context.language ? { language: context.language } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
