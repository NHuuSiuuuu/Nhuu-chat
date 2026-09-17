import type { PinnedMessageContract } from "@nhuu-chat/contracts";

import { AppError } from "../common/errors.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { conversationAccessFilter } from "../realtime/access.js";
import type { AuthUser } from "./auth.service.js";

type StoredPin = {
  messageId: unknown;
  pinnedBy: unknown;
  pinnedAt: Date | string;
};

type ConversationWithPins = {
  pinnedMessages?: StoredPin[];
};

type PinnedMessageRow = {
  _id: unknown;
  content: string;
  type: PinnedMessageContract["type"];
  metadata?: unknown;
  createdAt: Date | string;
};

const PIN_LIMIT = 10;

function pinLimitError(): AppError {
  return new AppError(
    409,
    "CONVERSATION_PIN_LIMIT_REACHED",
    "A conversation can have at most 10 pinned messages"
  );
}

function getSenderName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || !("senderName" in metadata)) return undefined;
  return typeof metadata.senderName === "string" ? metadata.senderName : undefined;
}

async function findAccessibleConversation(
  conversationId: string,
  auth: AuthUser
): Promise<ConversationWithPins> {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    ...conversationAccessFilter(auth)
  }).lean() as ConversationWithPins | null;

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
  }

  return conversation;
}

// Ghép metadata ghim với dữ liệu message, lọc reference cũ và giữ thứ tự ghim mới nhất.
async function loadCanonicalPins(
  conversationId: string,
  storedPins: StoredPin[]
): Promise<{ pinnedMessages: PinnedMessageContract[] }> {
  if (storedPins.length === 0) return { pinnedMessages: [] };

  const messageIds = storedPins.map((pin) => String(pin.messageId));
  const rows = await MessageModel.find({
    _id: { $in: messageIds },
    conversationId
  }).lean() as PinnedMessageRow[];
  const messagesById = new Map(rows.map((row) => [String(row._id), row]));
  const pinnedMessages = [...storedPins]
    .sort((left, right) => new Date(right.pinnedAt).getTime() - new Date(left.pinnedAt).getTime())
    .flatMap((pin): PinnedMessageContract[] => {
      const message = messagesById.get(String(pin.messageId));
      if (!message) return [];

      const senderName = getSenderName(message.metadata);
      return [{
        messageId: String(pin.messageId),
        content: message.content,
        type: message.type,
        ...(senderName ? { senderName } : {}),
        createdAt: new Date(message.createdAt).toISOString(),
        pinnedBy: String(pin.pinnedBy),
        pinnedAt: new Date(pin.pinnedAt).toISOString()
      }];
    });

  return { pinnedMessages };
}

export async function listConversationPins(
  conversationId: string,
  auth: AuthUser
): Promise<{ pinnedMessages: PinnedMessageContract[] }> {
  const conversation = await findAccessibleConversation(conversationId, auth);
  return loadCanonicalPins(conversationId, conversation.pinnedMessages ?? []);
}

export async function pinConversationMessage(
  conversationId: string,
  messageId: string,
  auth: AuthUser
): Promise<{ pinnedMessages: PinnedMessageContract[] }> {
  const conversation = await findAccessibleConversation(conversationId, auth);
  const message = await MessageModel.findOne({ _id: messageId, conversationId }).lean();
  if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found");

  const storedPins = conversation.pinnedMessages ?? [];
  if (storedPins.some((pin) => String(pin.messageId) === messageId)) {
    return loadCanonicalPins(conversationId, storedPins);
  }
  if (storedPins.length >= PIN_LIMIT) throw pinLimitError();

  const pinnedMessage = { messageId, pinnedBy: auth.id, pinnedAt: new Date() };
  const updated = await ConversationModel.findOneAndUpdate(
    {
      _id: conversationId,
      ...conversationAccessFilter(auth),
      "pinnedMessages.messageId": { $ne: messageId },
      $expr: {
        $lt: [
          { $size: { $ifNull: ["$pinnedMessages", []] } },
          PIN_LIMIT
        ]
      }
    },
    { $push: { pinnedMessages: pinnedMessage } },
    { new: true }
  ).lean() as ConversationWithPins | null;
  if (!updated) {
    const latest = await findAccessibleConversation(conversationId, auth);
    const latestPins = latest.pinnedMessages ?? [];
    if (latestPins.some((pin) => String(pin.messageId) === messageId)) {
      return loadCanonicalPins(conversationId, latestPins);
    }
    if (latestPins.length >= PIN_LIMIT) throw pinLimitError();
    throw new AppError(409, "CONVERSATION_PIN_CONFLICT", "Conversation pin state changed");
  }

  return loadCanonicalPins(conversationId, updated.pinnedMessages ?? []);
}

export async function unpinConversationMessage(
  conversationId: string,
  messageId: string,
  auth: AuthUser
): Promise<{ pinnedMessages: PinnedMessageContract[] }> {
  const conversation = await findAccessibleConversation(conversationId, auth);
  const storedPins = conversation.pinnedMessages ?? [];
  if (!storedPins.some((pin) => String(pin.messageId) === messageId)) {
    return loadCanonicalPins(conversationId, storedPins);
  }

  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversationId, ...conversationAccessFilter(auth) },
    { $pull: { pinnedMessages: { messageId } } },
    { new: true }
  ).lean() as ConversationWithPins | null;
  if (!updated) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");

  return loadCanonicalPins(conversationId, updated.pinnedMessages ?? []);
}
