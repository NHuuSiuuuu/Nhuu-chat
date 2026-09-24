import { CustomFile } from "telegram/client/uploads.js";
import type { EntityLike } from "telegram/define.js";
import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { facebookMessengerClient } from "../channels/facebook-messenger/facebook-messenger.client.js";
import { AppError } from "../common/errors.js";
import { decryptSecret } from "../common/crypto.js";
import { describeExternalError } from "../common/external-error.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { FacebookPageConnectionModel } from "../models/facebook-page-connection.model.js";
import { pauseBot } from "../orchestration/bot-pause.service.js";
import { canJoinConversation } from "../realtime/access.js";
import type { WorkspaceChannelRef } from "@nhuu-chat/contracts";
import type { AuthUser } from "./auth.service.js";
import { toConversation } from "./conversation.service.js";
import { readProviderSecretByName } from "./provider-secret.service.js";

type ZaloConversationType = "private" | "group";
type ZaloOutboundClient = {
  getAccountInfo: () => Promise<{ id?: unknown }>;
  findUserIdByName?: (name: string) => Promise<string | undefined>;
  sendMessage: (
    threadId: string,
    content: string,
    conversationType: ZaloConversationType,
    attachment?: { buffer: Buffer; filename: string; mimeType: string; size: number }
  ) => Promise<{ id: string }>;
};

export type UploadedOutboundFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type MessageAuth = AuthUser & {
  workspace?: { ownerUserId: string; allowedPages?: string[] | null; allowedChannels?: WorkspaceChannelRef[] };
};

type PersistedAttachment = {
  url: string;
  fileType: string;
  fileName: string;
};

type OutboundMediaService = Pick<
  import("../media/cloudinary.service.js").CloudinaryMediaService,
  "uploadFile"
>;

let outboundMediaServicePromise: Promise<OutboundMediaService> | undefined;

async function outboundMediaService(): Promise<OutboundMediaService> {
  outboundMediaServicePromise ??= import("../media/cloudinary.service.js")
    .then(({ CloudinaryMediaService }) => new CloudinaryMediaService());
  return outboundMediaServicePromise;
}

async function resolveTelegramPersonalRecipient(client: {
  getEntity: (channelId: string) => Promise<EntityLike>;
  getDialogs: (options: { limit: number }) => Promise<Array<{ id?: unknown; entity?: EntityLike }>>;
}, channelId: string): Promise<EntityLike> {
  try {
    return await client.getEntity(channelId);
  } catch (error) {
    // Dialogs chứa access hash cần thiết khi Telegram không resolve được user id từ cache.
    const dialogs = await client.getDialogs({ limit: 100 });
    const matchingDialog = dialogs.find((dialog) => String(dialog.id ?? "") === channelId);
    if (!matchingDialog?.entity) throw error;
    return matchingDialog.entity;
  }
}

export async function listMessages(conversationId: string, query: { page?: string; limit?: string }) {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(100, parsePositiveInt(query.limit, 50));
  const filter = { conversationId };
  const [rows, total] = await Promise.all([
    MessageModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MessageModel.countDocuments(filter)
  ]);
  return { messages: rows.reverse().map(toMessage), total };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new AppError(400, "INVALID_PAGINATION", "page and limit must be positive integers");
  return Number(value);
}

export function toMessage(row: any) {
  return {
    id: String(row._id), conversationId: String(row.conversationId), platform: row.platform,
    senderType: row.senderType, senderId: row.senderId, ...(row.metadata?.senderName ? { senderName: row.metadata.senderName } : {}), type: row.type, content: row.content,
    ...(row.attachments?.length ? { attachments: row.attachments.map((attachment: PersistedAttachment) => ({ url: attachment.url, fileName: attachment.fileName, mimeType: attachment.fileType })) } : {}),
    ...(row.metadata?.clientMessageId ? { clientMessageId: row.metadata.clientMessageId } : {}),
    deliveryStatus: row.deliveryStatus, createdAt: new Date(row.createdAt).toISOString()
  };
}

export async function createOutboundMessage(input: { conversationId: string; platform: string; senderId: string; content: string; externalMessageId?: string; clientMessageId?: string; deliveryStatus: "pending" | "sent" | "failed"; type?: "text" | "image" | "file"; attachments?: PersistedAttachment[] }) {
  if (!input.content.trim() && !input.attachments?.length) throw new AppError(400, "INVALID_REQUEST", "content or attachment is required");
  const { clientMessageId, ...messageInput } = input;
  return MessageModel.create({ ...messageInput, ...(clientMessageId ? { metadata: { clientMessageId } } : {}), senderType: "agent", type: input.type ?? "text" });
}

// Listener Zalo có thể lưu event tự phản hồi trước outbound flow; duplicate khi đó vẫn chứng minh tin đã được lưu.
async function persistZaloOutboundMessage(input: { conversationId: string; platform: string; senderId: string; content: string; externalMessageId?: string; clientMessageId?: string; deliveryStatus: "pending" | "sent" | "failed"; type?: "text" | "image" | "file"; attachments?: PersistedAttachment[] }) {
  try {
    return await createOutboundMessage(input);
  } catch (error) {
    if (!isDuplicateKey(error) || !input.externalMessageId) throw error;
    const existing = await MessageModel.findOne({
      platform: input.platform,
      externalMessageId: input.externalMessageId
    }).lean();
    if (!existing) throw error;
    return { toObject: () => existing };
  }
}

// Kiểm tra quyền, gửi qua đúng connector và luôn lưu trạng thái truy vết của lần gửi Zalo cá nhân.
export async function sendOutboundMessage(
  input: { conversationId: string; content: string; clientMessageId?: string; attachment?: UploadedOutboundFile },
  auth?: MessageAuth
) {
  const { conversationId, content } = input;
  const conversation = await ConversationModel.findById(conversationId)
    .populate("customerId", "name avatarUrl platformId")
    .lean();
  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  }
  if (!auth) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation");
  }

  const personalPlatform = conversation.platform === "telegram_personal" || conversation.platform === "zalo_personal";
  const sessionOwnerId = auth.workspace?.ownerUserId ?? auth.id;
  // Chỉ dùng session cá nhân của chủ Workspace sau khi quyền Workspace đã được kiểm tra.
  if (personalPlatform && String(conversation.ownerId) !== sessionOwnerId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      conversation.platform === "telegram_personal" ? "You do not own this Telegram connection" : "You do not own this Zalo connection"
    );
  }
  if (!canJoinConversation(auth, conversation)) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation");
  }
  if (input.attachment && conversation.platform !== "telegram_personal" && conversation.platform !== "zalo_personal") {
    throw new AppError(400, "UNSUPPORTED_ATTACHMENT_CHANNEL", "Chỉ hỗ trợ gửi file cho Zalo cá nhân và Telegram cá nhân");
  }
  // Tạm dừng bot sau kiểm tra quyền và trước connector để nhân viên tiếp quản cả khi gửi bị lỗi.
  await pauseBot(conversationId, new Date());
  const uploadedAttachment = input.attachment
    ? await (await outboundMediaService()).uploadFile({
      buffer: input.attachment.buffer,
      filename: input.attachment.originalname,
      mimeType: input.attachment.mimetype,
      userId: auth.id,
      folder: "nhuu-chat/messages"
    })
    : undefined;
  const persistedAttachments = uploadedAttachment ? [{
    url: uploadedAttachment.secureUrl,
    fileType: input.attachment?.mimetype ?? "application/octet-stream",
    fileName: input.attachment?.originalname ?? "attachment"
  }] : undefined;
  const messageType = input.attachment
    ? (input.attachment.mimetype.startsWith("image/") ? "image" : "file") as "image" | "file"
    : "text" as const;
  let deliveryStatus: "pending" | "sent" | "failed" = "sent";
  let externalMessageId: string | undefined;
  if (conversation.platform === "facebook") {
    if (input.attachment) throw new AppError(400, "UNSUPPORTED_ATTACHMENT_CHANNEL", "Messenger replies currently support text only");
    const customerPlatformId = getFacebookCustomerPlatformId(conversation.customerId);
    const customerPrefix = `facebook:${conversation.channelId}:`;
    if (!customerPlatformId?.startsWith(customerPrefix) || customerPlatformId.length <= customerPrefix.length) {
      throw new AppError(409, "FACEBOOK_CUSTOMER_ID_INVALID", "Facebook customer identity is unavailable");
    }
    if (!conversation.ownerId) throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
    const latestInbound = await MessageModel.findOne({
      conversationId,
      platform: "facebook",
      senderType: "customer"
    }).sort({ createdAt: -1 }).select("createdAt").lean();
    const latestInboundAt = latestInbound?.createdAt instanceof Date
      ? latestInbound.createdAt.getTime()
      : new Date(latestInbound?.createdAt ?? Number.NaN).getTime();
    if (!Number.isFinite(latestInboundAt) || Date.now() - latestInboundAt >= 24 * 60 * 60 * 1000) {
      throw new AppError(422, "FACEBOOK_MESSENGER_POLICY_WINDOW_CLOSED", "The Messenger reply window is closed");
    }
    const pageConnection = await FacebookPageConnectionModel.findOne({
      pageId: conversation.channelId,
      userId: conversation.ownerId,
      status: "connected"
    }).select("+encryptedPageAccessToken").lean();
    if (!pageConnection?.encryptedPageAccessToken) {
      throw new AppError(409, "FACEBOOK_PAGE_NOT_CONNECTED", "Facebook Page is not connected");
    }
    const pageAccessToken = decryptSecret(pageConnection.encryptedPageAccessToken);
    const delivery = await facebookMessengerClient.sendText({
      pageId: conversation.channelId,
      pageAccessToken,
      psid: customerPlatformId.slice(customerPrefix.length),
      text: content
    });
    externalMessageId = `facebook:${conversation.channelId}:${delivery.externalMessageId}`;
  } else if (conversation.platform === "telegram_personal") {
    const userId = sessionOwnerId;
    // Connector cá nhân dùng toMessage cho tin đến; chỉ nạp khi gửi để tránh import vòng.
    const { getActivePersonalClient } = await import("./telegram-personal.service.js");
    const client = await getActivePersonalClient(userId);
    if (!client) {
      throw new AppError(409, "TELEGRAM_PERSONAL_DISCONNECTED", "Telegram personal session is not active");
    }
    const recipient = await resolveTelegramPersonalRecipient(client, conversation.channelId);
    const sent = input.attachment
      ? await client.sendFile(recipient, {
        file: new CustomFile(input.attachment.originalname, input.attachment.size, "", input.attachment.buffer),
        caption: content
      })
      : await client.sendMessage(recipient, { message: content });
    externalMessageId = String(sent.id);
  } else if (conversation.platform === "zalo_personal") {
    // Chỉ gọi API Zalo qua session manager để credentials runtime không đi vào outbound flow.
    const { getActiveZaloPersonalClient } = await import("./zalo-personal.service.js");
    try {
      const client = await getActiveZaloPersonalClient(sessionOwnerId);
      if (!client) {
        throw new AppError(409, "ZALO_PERSONAL_DISCONNECTED", "Zalo personal session is not active");
      }
      const account = await client.getAccountInfo();
      const zaloAccountId = String(account.id ?? "").trim();
      if (!zaloAccountId) throw new Error("Zalo personal account id is unavailable");
      const conversationAccountId = await resolveZaloConversationAccountId(conversationId, conversation.zaloAccountId);
      let recipientChannelId = conversation.channelId;
      if (conversationAccountId && conversationAccountId !== zaloAccountId) {
        const customerName = getConversationCustomerName(conversation.customerId);
        const remappedChannelId = conversation.conversationType === "private" && customerName && client.findUserIdByName
          ? await client.findUserIdByName(customerName)
          : undefined;
        if (!remappedChannelId) {
          throw new AppError(
            409,
            "ZALO_PERSONAL_CONVERSATION_ACCOUNT_MISMATCH",
            "This conversation belongs to a different Zalo account. Reconnect that account or wait for a new message from the current account."
          );
        }
        recipientChannelId = remappedChannelId;
        await ConversationModel.findByIdAndUpdate(conversationId, {
          $set: { channelId: remappedChannelId, zaloAccountId }
        });
      }
      const conversationType: ZaloConversationType = conversation.conversationType === "group" ? "group" : "private";
      // Truyền loại hội thoại đến adapter để group không bị gửi nhầm qua endpoint direct.
      const sent = input.attachment
        ? await (client as unknown as ZaloOutboundClient).sendMessage(
          recipientChannelId,
          content,
          conversationType,
          {
            buffer: input.attachment.buffer,
            filename: input.attachment.originalname,
            mimeType: input.attachment.mimetype,
            size: input.attachment.size
          }
        )
        : await (client as unknown as ZaloOutboundClient).sendMessage(
          recipientChannelId,
          content,
          conversationType
        );
      externalMessageId = `zalo_personal:${zaloAccountId}:${sent.id}`;
    } catch (error) {
      console.error("Zalo outbound delivery failed", {
        conversationId,
        ownerId: auth.id,
        conversationType: conversation.conversationType === "group" ? "group" : "private",
        error: describeExternalError(error)
      });
      await createOutboundMessage({
        conversationId,
        platform: conversation.platform,
        senderId: "agent",
        content,
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        ...(persistedAttachments ? { attachments: persistedAttachments, type: messageType } : {}),
        externalMessageId: undefined,
        // AppError xảy ra trước khi gửi; lỗi connector thường không xác định được phía Zalo đã nhận hay chưa.
        deliveryStatus: error instanceof AppError ? "failed" : "pending"
      });
      if (error instanceof AppError) throw error;
      throw new AppError(502, "ZALO_PERSONAL_DELIVERY_FAILED", "Zalo personal message delivery failed");
    }
  } else if (conversation.platform === "telegram") {
    const botToken = await readProviderSecretByName("telegram", "bot-token");
    const delivery = await new TelegramClient(botToken).sendText(conversation.channelId, content);
    externalMessageId = delivery.externalMessageId;
  } else {
    deliveryStatus = "pending";
  }

  const message = conversation.platform === "zalo_personal"
    ? await persistZaloOutboundMessage({
      conversationId,
      platform: conversation.platform,
      senderId: "agent",
      content,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      ...(persistedAttachments ? { attachments: persistedAttachments, type: messageType } : {}),
      externalMessageId,
      deliveryStatus
    })
    : conversation.platform === "facebook"
      ? await persistFacebookOutboundMessage({
        conversationId,
        platform: conversation.platform,
        senderId: "agent",
        content,
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        externalMessageId,
        deliveryStatus
      })
    : await createOutboundMessage({
      conversationId,
      platform: conversation.platform,
      senderId: "agent",
      content,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      ...(persistedAttachments ? { attachments: persistedAttachments, type: messageType } : {}),
      externalMessageId,
      deliveryStatus
    });
  const lastMessageAt = new Date();
  const lastMessageSnippet = content || input.attachment?.originalname || "Tệp đính kèm";
  await ConversationModel.findByIdAndUpdate(conversationId, {
    $set: { lastMessageAt, lastMessageSnippet }
  });

  return {
    message: toMessage(message.toObject()),
    conversation: toConversation({
      ...conversation,
      lastMessageAt,
      lastMessageSnippet
    }),
    recipients: [
      conversation.ownerId ? String(conversation.ownerId) : "",
      conversation.assignedAgentId ? String(conversation.assignedAgentId) : ""
    ]
  };
}

function getFacebookCustomerPlatformId(customer: unknown): string | undefined {
  if (!customer || typeof customer !== "object" || !("platformId" in customer)) return undefined;
  return typeof customer.platformId === "string" ? customer.platformId : undefined;
}

// Meta can deliver message_echoes before the Send API response; the shared external ID makes the webhook row authoritative.
async function persistFacebookOutboundMessage(input: Parameters<typeof createOutboundMessage>[0]) {
  try {
    return await createOutboundMessage(input);
  } catch (error) {
    if (!isDuplicateKey(error) || !input.externalMessageId) throw error;
    const existing = await MessageModel.findOne({ platform: "facebook", externalMessageId: input.externalMessageId }).lean();
    if (!existing) throw error;
    const metadata = input.clientMessageId
      ? { ...(existing.metadata ?? {}), clientMessageId: input.clientMessageId }
      : existing.metadata;
    return { toObject: () => ({ ...existing, ...(metadata ? { metadata } : {}) }) };
  }
}

function getConversationCustomerName(customer: unknown): string | undefined {
  if (!customer || typeof customer !== "object" || !("name" in customer)) return undefined;
  const name = customer.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

async function resolveZaloConversationAccountId(conversationId: string, storedAccountId: unknown): Promise<string | undefined> {
  const accountId = typeof storedAccountId === "string" ? storedAccountId.trim() : "";
  if (accountId) return accountId;

  // Older conversations predate zaloAccountId; recover provenance from their namespaced inbound/outbound ids.
  const latest = await MessageModel.findOne({
    conversationId,
    platform: "zalo_personal",
    externalMessageId: /^zalo_personal:[^:]+:/
  }).sort({ createdAt: -1 }).select("externalMessageId").lean();
  const externalId = typeof latest?.externalMessageId === "string" ? latest.externalMessageId : "";
  const match = /^zalo_personal:([^:]+):/.exec(externalId);
  return match?.[1];
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
