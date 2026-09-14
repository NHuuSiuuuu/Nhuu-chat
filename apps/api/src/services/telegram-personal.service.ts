import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { Api, TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";
import { isTelegramPersonalBotEcho } from "../chatbot/telegram-chatbot.js";
import { processTelegramCustomerMessage } from "../chatbot/telegram-inbound.service.js";

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

export function personalMessageSenderType(isOutgoing: boolean): "customer" | "agent" {
  return isOutgoing ? "agent" : "customer";
}

export function isPersonalOutgoingMessage(
  message: { out?: unknown; senderId?: unknown },
  telegramUserId?: string | null
): boolean {
  return message.out === true || (telegramUserId !== null && telegramUserId !== undefined && String(message.senderId ?? "") === telegramUserId);
}

async function refreshPersonalSessionAvatar(userId: string, client: TelegramClient): Promise<void> {
  try {
    const avatar = await client.downloadProfilePhoto("me", { isBig: false });
    const avatarUrl = Buffer.isBuffer(avatar) ? toAvatarDataUrl(avatar) : undefined;
    if (!avatarUrl) return;
    await TelegramPersonalSessionModel.findOneAndUpdate(
      { userId },
      { $set: { avatarUrl } },
      { new: true }
    );
  } catch {
    // Lỗi làm mới avatar không được cản trở đồng bộ tin nhắn.
  }
}

function telegramCredentials(): { apiId: number; apiHash: string } {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!Number.isInteger(apiId) || apiId < 1 || !apiHash) {
    throw new AppError(503, "TELEGRAM_PERSONAL_NOT_CONFIGURED", "Telegram personal API is not configured");
  }
  return { apiId, apiHash };
}

// Tạo phiên MTProto có hạn và giữ trạng thái QR/2FA riêng cho owner.
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

  return restorePersonalClient(userId, session.encryptedSession, session.avatarUrl);
}

// Khôi phục các phiên đã lưu lúc khởi động để tiếp tục đồng bộ tin đến sau restart.
export async function restoreActivePersonalClients(): Promise<void> {
  const sessions = await TelegramPersonalSessionModel.find({ status: "active" })
    .select("+encryptedSession")
    .lean();
  await Promise.all(sessions.map(async (session) => {
    try {
      await restorePersonalClient(String(session.userId), session.encryptedSession, session.avatarUrl);
    } catch (error) {
      console.error(`Failed to restore Telegram personal session for user ${String(session.userId)}`, error);
    }
  }));
}

// Chỉ khôi phục phiên mã hóa sau khi Telegram xác nhận phiên còn quyền truy cập.
async function restorePersonalClient(userId: string, encryptedSession: string, existingAvatarUrl?: string | null): Promise<TelegramClient | undefined> {
  const credentials = telegramCredentials();
  const client = new TelegramClient(new StringSession(decryptSecret(encryptedSession)), credentials.apiId, credentials.apiHash, {
    connectionRetries: 3
  });
  await client.connect();
  if (!(await client.checkAuthorization())) {
    await client.disconnect().catch(() => undefined);
    return undefined;
  }

  if (!existingAvatarUrl) await refreshPersonalSessionAvatar(userId, client);
  activePersonalClients.set(userId, client);
  attachPersonalMessageSync(userId, client);
  return client;
}

// Lưu tin MTProto đúng owner trước khi gọi bot; bỏ qua replay và tin do bot gửi.
function attachPersonalMessageSync(userId: string, client: TelegramClient): void {
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message) return;
    const channelId = String(message.chatId ?? "");
    const content = message.message?.trim() ?? "";
    const type = message.photo ? "image" : "text";
    if (!channelId || (!content && type === "text")) return;
    const account = await TelegramPersonalSessionModel.findOne({ userId, status: "active" }).lean();
    if (!account) return;
    if (await MessageModel.exists({ platform: "telegram_personal", externalMessageId: String(message.id) })) return;
    const isOutgoing = isPersonalOutgoingMessage(message, account?.telegramUserId);
    if (isOutgoing && await isTelegramPersonalBotEcho(userId, channelId, String(message.id))) return;
    const existingConversation = isOutgoing
      ? await ConversationModel.findOne({ platform: "telegram_personal", channelId, ownerId: userId }).lean()
      : null;
    // Tin gửi từ Telegram chỉ thuộc hội thoại đã có; luồng gửi web đã tạo hội thoại trước đó.
    if (isOutgoing && !existingConversation) return;
    const sender = await message.getSender().catch(() => null) as Api.User | null;
    if (sender?.bot) return;
    const senderId = sender?.id ? String(sender.id) : channelId;
    const senderAvatar = !isOutgoing && sender ? await client.downloadProfilePhoto(sender, { isBig: false }).catch(() => undefined) : undefined;
    const senderAvatarUrl = Buffer.isBuffer(senderAvatar) ? toAvatarDataUrl(senderAvatar) : undefined;
    const chat = await message.getChat().catch(() => null) as { title?: string } | null;
    const isGroup = (message as unknown as { isGroup?: boolean }).isGroup === true;
    const customer = isOutgoing ? null : await CustomerModel.findOneAndUpdate(
      { platform: "telegram_personal", platformId: senderId },
      { $set: { name: [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "Telegram user", ...(senderAvatarUrl ? { avatarUrl: senderAvatarUrl } : {}) }, $setOnInsert: { platform: "telegram_personal", platformId: senderId } },
      { upsert: true, new: true }
    );
    const conversationUpdate: Record<string, unknown> = {
      $set: {
        customerId: isOutgoing ? existingConversation?.customerId : customer?._id,
        ownerId: userId,
        conversationType: isGroup ? "group" : "private",
        conversationName: isGroup ? (chat?.title ?? null) : null,
        lastMessageAt: new Date(message.date * 1000),
        lastMessageSnippet: content
      }
    };
    let conversation = await ConversationModel.findOneAndUpdate(
      { platform: "telegram_personal", channelId, ownerId: userId },
      conversationUpdate,
      { upsert: true, new: true }
    );
    try {
      const senderName = isOutgoing ? account?.displayName ?? "Bạn" : [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "Telegram user";
      const storedMessage = await MessageModel.create({ conversationId: conversation._id, platform: "telegram_personal", externalMessageId: String(message.id), senderType: personalMessageSenderType(isOutgoing), senderId, type, content, deliveryStatus: "delivered", metadata: { senderName } });
      // Chỉ tin vừa ghi thành công mới tăng unread, kể cả khi replay đến đồng thời.
      if (!isOutgoing) {
        conversation = await ConversationModel.findOneAndUpdate(
          { _id: conversation._id, ownerId: userId },
          { $inc: { unreadCount: 1 } },
          { returnDocument: "after" }
        );
        if (!conversation) return;
      }
      await conversation.populate("customerId", "name avatarUrl");
      await conversation.populate("tagIds", "name color");
      const conversationPayload = toConversation(conversation.toObject(), account ? { name: account.displayName, avatarUrl: account.avatarUrl ?? undefined } : undefined);
      emitChatEvent("chat:message_received", String(conversation._id), toMessage(storedMessage.toObject()));
      emitInboxEventToRecipients("chat:conversation_updated", [userId, conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""], conversationPayload);
      if (!isOutgoing) {
        // Ghi nhận lỗi và bàn giao an toàn mà không tạo lần gửi mới khi replay.
        await processTelegramCustomerMessage({
          ownerId: userId,
          conversationId: String(conversation._id),
          customerMessageId: String(storedMessage._id),
          externalMessageId: String(message.id),
          platform: "telegram_personal",
          channelId,
          senderType: "customer",
          type,
          content
        });
      }
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }, new NewMessage({}));
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
