import type { TelegramUpdate } from "../channels/telegram/telegram.schemas.js";
import { normalizeTelegramUpdate } from "../channels/telegram/telegram.normalizer.js";
import { TelegramClient } from "../channels/telegram/telegram.client.js";
import { ConversationModel } from "../models/conversation.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { MessageModel } from "../models/message.model.js";
import { isBotPaused } from "../orchestration/bot-pause.service.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "./conversation.service.js";
import { toMessage } from "./message.service.js";
import { createProviderSecret } from "./provider-secret.service.js";

export interface TelegramChannelConfigInput {
  botToken: string;
  webhookBaseUrl: string;
}

export async function ingestTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const normalized = normalizeTelegramUpdate(update);
  if (!normalized) return;

  const existing = await MessageModel.exists({
    platform: normalized.platform,
    externalMessageId: normalized.externalMessageId
  });
  if (existing) return;

  const customer = await CustomerModel.findOneAndUpdate(
    { platform: normalized.platform, platformId: normalized.senderId },
    {
      $set: {
        name: normalized.senderName,
        ...(normalized.avatarUrl ? { avatarUrl: normalized.avatarUrl } : {}),
        ...(normalized.senderUsername ? { notes: `@${normalized.senderUsername}` } : {})
      },
      $setOnInsert: { platform: normalized.platform, platformId: normalized.senderId }
    },
    { upsert: true, new: true }
  );

  const conversation = await ConversationModel.findOneAndUpdate(
    { platform: normalized.platform, channelId: normalized.channelId },
    {
      $set: {
        customerId: customer._id,
        conversationType: normalized.metadata.chatType === "private" ? "private" : "group",
        ...(normalized.metadata.chatTitle ? { conversationName: normalized.metadata.chatTitle } : {}),
        lastMessageAt: normalized.sentAt,
        lastMessageSnippet: normalized.content
      },
      $setOnInsert: { platform: normalized.platform, channelId: normalized.channelId }
    },
    { upsert: true, new: true }
  );

  try {
    const storedMessage = await MessageModel.create({
      conversationId: conversation._id,
      platform: normalized.platform,
      externalMessageId: normalized.externalMessageId,
      senderType: "customer",
      senderId: normalized.senderId,
      type: normalized.type,
      content: normalized.content,
      deliveryStatus: "delivered",
      metadata: {
        ...normalized.metadata,
        ...(normalized.senderUsername ? { senderUsername: normalized.senderUsername } : {})
      }
    });
    await ConversationModel.updateOne(
      { _id: conversation._id },
      { $inc: { unreadCount: 1 } }
    );
    const updatedConversation = await ConversationModel.findById(conversation._id).populate("customerId", "name avatarUrl").populate("tagIds", "name color").lean();
    if (updatedConversation) {
      emitChatEvent("chat:message_received", String(conversation._id), toMessage(storedMessage.toObject()));
      emitInboxEventToRecipients("chat:conversation_updated", [updatedConversation.ownerId ? String(updatedConversation.ownerId) : "", updatedConversation.assignedAgentId ? String(updatedConversation.assignedAgentId) : ""], toConversation(updatedConversation));
    }
  } catch (error) {
    if (isDuplicateKey(error)) return;
    throw error;
  }
}

export async function registerTelegramChannel(config: TelegramChannelConfigInput) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");

  const webhookUrl = `${config.webhookBaseUrl.replace(/\/$/, "")}/api/v1/channels/telegram/webhook/${webhookSecret}`;
  await createProviderSecret("telegram", "bot-token", config.botToken);
  await new TelegramClient(config.botToken).setWebhook(webhookUrl, webhookSecret);
  return { provider: "telegram", webhookUrl } as const;
}

export async function orchestrateTelegramReply(input: TelegramReplyInput, deps: { now: () => Date; answer: (content: string) => Promise<{ answer: string; sources: unknown[]; handoff: boolean }>; createBotMessage: (input: TelegramReplyInput, answer: string) => Promise<{ id: string }>; enqueue: (command: { messageId: string; conversationId: string; platform: "telegram"; channelId: string; content: string }) => Promise<string> }): Promise<void> {
  if (isBotPaused(input.botPausedUntil ?? null, deps.now())) return;
  const result = await deps.answer(input.content);
  const { botPausedUntil: _botPausedUntil, ...messageInput } = input;
  const message = await deps.createBotMessage(messageInput, result.answer);
  await deps.enqueue({ messageId: message.id, conversationId: input.conversationId, platform: "telegram", channelId: input.channelId, content: result.answer });
}

interface TelegramReplyInput { conversationId: string; channelId: string; content: string; botPausedUntil?: Date | null; }

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
