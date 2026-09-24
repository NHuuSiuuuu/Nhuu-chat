import mongoose from "mongoose";

import { AppError } from "../../common/errors.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { FacebookPageConnectionModel } from "../../models/facebook-page-connection.model.js";
import { MessageModel } from "../../models/message.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../../realtime/socket.js";
import { toConversation } from "../../services/conversation.service.js";
import { toMessage } from "../../services/message.service.js";
import { normalizeMessengerWebhook, type MessengerTextEvent } from "./facebook-messenger.normalizer.js";

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

// Một Page chỉ được định tuyến tới đúng một connection đang hoạt động.
async function resolveOwner(pageId: string) {
  const connections = await FacebookPageConnectionModel.find({ pageId, status: "connected" })
    .select("userId")
    .limit(2)
    .lean();
  if (connections.length > 1) {
    throw new AppError(503, "FACEBOOK_PAGE_OWNER_CONFLICT", "Facebook Page ownership is ambiguous");
  }
  return connections[0]?.userId;
}

// Ghi tin và unread trong cùng giao dịch; webhook retry chỉ thấy external ID đã tồn tại.
async function persistMessengerText(event: MessengerTextEvent, ownerId: mongoose.Types.ObjectId): Promise<void> {
  const session = await mongoose.startSession();
  let emitted: { conversationId: string; message: ReturnType<typeof toMessage>; conversation: ReturnType<typeof toConversation>; recipients: string[] } | undefined;
  try {
    await session.withTransaction(async () => {
      const existing = await MessageModel.exists({ platform: "facebook", externalMessageId: event.externalMessageId }).session(session);
      if (existing) return;

      const psid = event.customerId.slice(`facebook:${event.pageId}:`.length);
      const customer = await CustomerModel.findOneAndUpdate(
        { platform: "facebook", platformId: event.customerId },
        { $setOnInsert: { platform: "facebook", platformId: event.customerId, name: `Facebook ${psid}` } },
        { upsert: true, returnDocument: "after", session }
      );
      const conversation = await ConversationModel.findOneAndUpdate(
        { platform: "facebook", channelId: event.pageId, ownerId, customerId: customer._id },
        { $setOnInsert: { platform: "facebook", channelId: event.pageId, ownerId, customerId: customer._id, botEnabled: false, lastMessageAt: event.sentAt, lastMessageSnippet: event.content } },
        { upsert: true, returnDocument: "after", session }
      );
      const result = await MessageModel.updateOne(
        { platform: "facebook", externalMessageId: event.externalMessageId },
        { $setOnInsert: {
          conversationId: conversation._id,
          platform: "facebook",
          externalMessageId: event.externalMessageId,
          createdAt: event.sentAt,
          updatedAt: new Date(),
          senderType: event.echo ? "agent" : "customer",
          senderId: event.senderId,
          type: "text",
          content: event.content,
          deliveryStatus: event.echo ? "sent" : "delivered"
        } },
        { upsert: true, session, timestamps: false }
      );
      if (result.upsertedCount !== 1) return;

      const update = {
        ...(event.sentAt.getTime() >= conversation.lastMessageAt.getTime()
          ? { $set: { lastMessageAt: event.sentAt, lastMessageSnippet: event.content } }
          : {}),
        ...(event.echo ? {} : { $inc: { unreadCount: 1 } })
      };
      const updated = Object.keys(update).length
        ? await ConversationModel.findOneAndUpdate(
          { _id: conversation._id, ownerId }, update, { returnDocument: "after", session }
        ).populate("customerId", "name avatarUrl").populate("tagIds", "name color")
        : await ConversationModel.findById(conversation._id).session(session)
          .populate("customerId", "name avatarUrl").populate("tagIds", "name color");
      const message = await MessageModel.findOne({ platform: "facebook", externalMessageId: event.externalMessageId }).session(session).lean();
      if (!updated || !message) throw new Error("Messenger persistence incomplete");
      emitted = {
        conversationId: String(conversation._id),
        message: toMessage(message),
        conversation: toConversation(updated.toObject()),
        recipients: [String(ownerId), ...(updated.assignedAgentId ? [String(updated.assignedAgentId)] : [])]
      };
    });
  } catch (error) {
    if (!isDuplicateKey(error) || !(await MessageModel.exists({ platform: "facebook", externalMessageId: event.externalMessageId }))) throw error;
    return;
  } finally {
    await session.endSession();
  }
  if (emitted) {
    emitChatEvent("chat:message_received", emitted.conversationId, emitted.message);
    emitInboxEventToRecipients("chat:conversation_updated", emitted.recipients, emitted.conversation);
  }
}

// Xử lý tuần tự từng tin để lỗi lưu dữ liệu không bị xác nhận thành công nhầm.
export async function processMessengerWebhook(payload: unknown): Promise<void> {
  const events = normalizeMessengerWebhook(payload);
  const owners = new Map<string, mongoose.Types.ObjectId | undefined>();
  for (const event of events) {
    if (!owners.has(event.pageId)) owners.set(event.pageId, await resolveOwner(event.pageId));
    const ownerId = owners.get(event.pageId);
    if (!ownerId) continue;
    await persistMessengerText(event, ownerId);
  }
}
