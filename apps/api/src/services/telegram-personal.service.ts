import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { Api, TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";

import { createPasswordPrompt, isRetryableTelegramPasswordError, shouldReusePendingQr, type PasswordPrompt } from "../channels/telegram-personal/telegram-personal.auth.js";
import { TelegramPersonalSessionModel } from "../channels/telegram-personal/telegram-personal.model.js";
import { decryptSecret, encryptSecret } from "../common/crypto.js";
import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { MessageModel } from "../models/message.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "./conversation.service.js";
import { toMessage } from "./message.service.js";

const QR_TTL_MS = 30_000;

type PendingQrLogin = {
  id: string;
  userId: string;
  client: TelegramClient;
  qrUrl: string | null;
  expiresAt: Date | null;
  status: "waiting" | "password_required" | "connected" | "failed";
  error: string | null;
  passwordPrompt: PasswordPrompt | null;
};

const pendingQrLogins = new Map<string, PendingQrLogin>();
const activePersonalClients = new Map<string, TelegramClient>();

export function buildTelegramQrUrl(token: Uint8Array): string {
  return `tg://login?token=${Buffer.from(token).toString("base64url")}`;
}

export function isQrExpired(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function qrExpiry(now = new Date()): Date {
  return new Date(now.getTime() + QR_TTL_MS);
}

export function serializePersonalSession(session: string): string {
  return encryptSecret(session);
}

export function toAvatarDataUrl(avatar: Buffer | Uint8Array | undefined, mimeType = "image/jpeg"): string | undefined {
  if (!avatar) return undefined;
  const bytes = Buffer.isBuffer(avatar) ? avatar : Buffer.from(avatar);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function telegramCredentials(): { apiId: number; apiHash: string } {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!Number.isInteger(apiId) || apiId < 1 || !apiHash) {
    throw new AppError(503, "TELEGRAM_PERSONAL_NOT_CONFIGURED", "Telegram personal API is not configured");
  }
  return { apiId, apiHash };
}

// Creates an expiring MTProto login session and keeps the QR/2FA state private to its owner.
export async function startPersonalQrLogin(userId: string) {
  const existing = [...pendingQrLogins.values()].find((item) => item.userId === userId && (item.status === "waiting" || item.status === "password_required"));
  if (existing && (existing.status === "waiting" || existing.status === "password_required") && shouldReusePendingQr(existing.status)) {
    return toQrStatus(existing);
  }
  if (existing) {
    pendingQrLogins.delete(existing.id);
    await existing.client.disconnect().catch(() => undefined);
  }

  const credentials = telegramCredentials();
  const client = new TelegramClient(new StringSession(""), credentials.apiId, credentials.apiHash, {
    connectionRetries: 3
  });
  await client.connect();

  const login: PendingQrLogin = {
    id: randomUUID(), userId, client, qrUrl: null, expiresAt: null, status: "waiting", error: null, passwordPrompt: null
  };
  pendingQrLogins.set(login.id, login);

  void client.signInUserWithQrCode(credentials, {
    qrCode: async ({ token, expires }) => {
      login.qrUrl = buildTelegramQrUrl(token);
      login.expiresAt = new Date(expires * 1000);
    },
    password: async (hint) => {
      const prompt = createPasswordPrompt();
      login.passwordPrompt = prompt;
      login.status = "password_required";
      login.error = null;
      return prompt.ask(hint);
    },
    onError: async (error) => {
      if (isRetryableTelegramPasswordError(error)) {
        login.status = "password_required";
        login.error = "TELEGRAM_2FA_PASSWORD_INVALID";
        return false;
      }
      login.status = "failed";
      login.error = error instanceof Error ? error.message : "Telegram QR login failed";
      await client.disconnect().catch(() => undefined);
      return true;
    }
  }).then(async (telegramUser) => {
    const user = telegramUser as Api.User;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Telegram user";
    const avatar = await client.downloadProfilePhoto("me", { isBig: false }).catch(() => undefined);
    const avatarUrl = Buffer.isBuffer(avatar) ? toAvatarDataUrl(avatar) : undefined;
    await TelegramPersonalSessionModel.findOneAndUpdate(
      { userId },
      {
        userId,
        encryptedSession: serializePersonalSession((client.session as StringSession).save()),
        telegramUserId: String(user.id),
        username: user.username ?? null,
        displayName,
        avatarUrl: avatarUrl ?? null,
        status: "active",
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );
    login.status = "connected";
    activePersonalClients.set(userId, client);
    attachPersonalMessageSync(userId, client);
  }).catch(async (error) => {
    login.status = "failed";
    login.error = error instanceof Error ? error.message : "Telegram QR login failed";
    await client.disconnect().catch(() => undefined);
  });

  return toQrStatus(login);
}

export function getPersonalQrLoginStatus(id: string, userId: string) {
  const login = pendingQrLogins.get(id);
  if (!login || login.userId !== userId) throw new AppError(404, "QR_LOGIN_NOT_FOUND", "QR login was not found");
  return toQrStatus(login);
}

export function submitPersonalQrPassword(id: string, userId: string, password: string) {
  const login = pendingQrLogins.get(id);
  if (!login || login.userId !== userId) throw new AppError(404, "QR_LOGIN_NOT_FOUND", "QR login was not found");
  if (login.status !== "password_required" || !login.passwordPrompt) {
    throw new AppError(409, "QR_LOGIN_PASSWORD_NOT_REQUESTED", "Telegram has not requested a password");
  }
  login.passwordPrompt.submit(password);
  login.passwordPrompt = null;
  return toQrStatus(login);
}

export async function getPersonalSessionStatus(userId: string) {
  const session = await TelegramPersonalSessionModel.findOne({ userId }).lean();
  return session
    ? { connected: session.status === "active", displayName: session.displayName, username: session.username, avatarUrl: session.avatarUrl ?? null }
    : { connected: false, displayName: null, username: null, avatarUrl: null };
}

export async function getActivePersonalClient(userId: string): Promise<TelegramClient | undefined> {
  const activeClient = activePersonalClients.get(userId);
  if (activeClient) return activeClient;

  const session = await TelegramPersonalSessionModel.findOne({ userId, status: "active" })
    .select("+encryptedSession")
    .lean();
  if (!session) return undefined;

  return restorePersonalClient(userId, session.encryptedSession);
}

// Reconnects every persisted Telegram session during API startup so inbound sync works after a restart.
export async function restoreActivePersonalClients(): Promise<void> {
  const sessions = await TelegramPersonalSessionModel.find({ status: "active" })
    .select("+encryptedSession")
    .lean();
  await Promise.all(sessions.map(async (session) => {
    try {
      await restorePersonalClient(String(session.userId), session.encryptedSession);
    } catch (error) {
      console.error(`Failed to restore Telegram personal session for user ${String(session.userId)}`, error);
    }
  }));
}

// Restores one encrypted session only after Telegram confirms that it is still authorized.
async function restorePersonalClient(userId: string, encryptedSession: string): Promise<TelegramClient | undefined> {
  const credentials = telegramCredentials();
  const client = new TelegramClient(new StringSession(decryptSecret(encryptedSession)), credentials.apiId, credentials.apiHash, {
    connectionRetries: 3
  });
  await client.connect();
  if (!(await client.checkAuthorization())) {
    await client.disconnect().catch(() => undefined);
    return undefined;
  }

  activePersonalClients.set(userId, client);
  attachPersonalMessageSync(userId, client);
  return client;
}

// Converts incoming MTProto events into canonical customer, conversation, message, and realtime records.
function attachPersonalMessageSync(userId: string, client: TelegramClient): void {
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || message.out) return;
    const channelId = String(message.chatId ?? "");
    const content = message.message?.trim();
    if (!channelId || !content) return;
    const sender = await message.getSender().catch(() => null) as Api.User | null;
    const senderId = sender?.id ? String(sender.id) : channelId;
    const senderAvatar = sender ? await client.downloadProfilePhoto(sender, { isBig: false }).catch(() => undefined) : undefined;
    const senderAvatarUrl = Buffer.isBuffer(senderAvatar) ? toAvatarDataUrl(senderAvatar) : undefined;
    const chat = await message.getChat().catch(() => null) as { title?: string } | null;
    const isGroup = (message as unknown as { isGroup?: boolean }).isGroup === true;
    const customer = await CustomerModel.findOneAndUpdate(
      { platform: "telegram_personal", platformId: senderId },
      { $set: { name: [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "Telegram user", ...(senderAvatarUrl ? { avatarUrl: senderAvatarUrl } : {}) }, $setOnInsert: { platform: "telegram_personal", platformId: senderId } },
      { upsert: true, new: true }
    );
    const conversation = await ConversationModel.findOneAndUpdate(
      { platform: "telegram_personal", channelId, ownerId: userId },
      { $set: { customerId: customer._id, ownerId: userId, conversationType: isGroup ? "group" : "private", conversationName: isGroup ? (chat?.title ?? null) : null, lastMessageAt: new Date(message.date * 1000), lastMessageSnippet: content }, $inc: { unreadCount: 1 }, $setOnInsert: { platform: "telegram_personal", channelId } },
      { upsert: true, new: true }
    );
    try {
      await conversation.populate("customerId", "name avatarUrl");
      await conversation.populate("tagIds", "name color");
      const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "Telegram user";
      const storedMessage = await MessageModel.create({ conversationId: conversation._id, platform: "telegram_personal", externalMessageId: String(message.id), senderType: "customer", senderId, type: "text", content, deliveryStatus: "delivered", metadata: { senderName } });
      const account = await TelegramPersonalSessionModel.findOne({ userId, status: "active" }).lean();
      const conversationPayload = toConversation(conversation.toObject(), account ? { name: account.displayName, avatarUrl: account.avatarUrl ?? undefined } : undefined);
      emitChatEvent("chat:message_received", String(conversation._id), toMessage(storedMessage.toObject()));
      emitInboxEventToRecipients("chat:conversation_updated", [userId, conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""], conversationPayload);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }, new NewMessage({ incoming: true }));
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function toQrStatus(login: PendingQrLogin) {
  return {
    id: login.id,
    status: login.status,
    qrUrl: login.status === "waiting" && login.expiresAt && !isQrExpired(login.expiresAt) ? login.qrUrl : null,
    expiresAt: login.expiresAt?.toISOString() ?? null,
    error: login.error,
    passwordHint: login.passwordPrompt?.hint ?? null
  };
}
