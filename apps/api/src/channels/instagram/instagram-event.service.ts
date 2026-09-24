import mongoose from "mongoose";
import { AppError } from "../../common/errors.js";
import { ConversationModel } from "../../models/conversation.model.js";
import { CustomerModel } from "../../models/customer.model.js";
import { InstagramAccountConnectionModel } from "../../models/instagram-account-connection.model.js";
import { MessageModel } from "../../models/message.model.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../../realtime/socket.js";
import { toConversation } from "../../services/conversation.service.js";
import { toMessage } from "../../services/message.service.js";

type InstagramTextEvent = { accountId: string; igsid: string; mid: string; senderId: string; text: string; timestamp: Date; echo: boolean };
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null; }
function nonempty(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function normalizeInstagramWebhook(payload: unknown): InstagramTextEvent[] {
  const root = record(payload);
  if (root?.object !== "instagram" || !Array.isArray(root.entry) || root.entry.length === 0) throw new AppError(400, "INSTAGRAM_WEBHOOK_PAYLOAD_INVALID", "Instagram webhook payload is invalid");
  const result: InstagramTextEvent[] = [];
  for (const entryValue of root.entry) {
    const entry = record(entryValue);
    const accountId = nonempty(entry?.id);
    if (!entry || !accountId || !Array.isArray(entry.messaging) || entry.messaging.length === 0) throw new AppError(400, "INSTAGRAM_WEBHOOK_PAYLOAD_INVALID", "Instagram webhook payload is invalid");
    for (const eventValue of entry.messaging) {
      const event = record(eventValue);
      const message = record(event?.message);
      const sender = nonempty(record(event?.sender)?.id);
      const recipient = nonempty(record(event?.recipient)?.id);
      const mid = nonempty(message?.mid);
      const text = typeof message?.text === "string" && message.text.trim() ? message.text : null;
      if (!event || !sender || !recipient || !mid || !text || message?.is_echo !== undefined && typeof message.is_echo !== "boolean" || message?.attachments !== undefined) continue;
      const echo = message.is_echo === true;
      if (echo ? sender !== accountId || recipient === accountId : recipient !== accountId || sender === accountId) continue;
      const timestamp = typeof event.timestamp === "number" && Number.isFinite(event.timestamp) && event.timestamp > 0 && event.timestamp <= 8.64e15 ? event.timestamp : Date.now();
      result.push({ accountId, igsid: echo ? recipient : sender, mid, senderId: sender, text, timestamp: new Date(timestamp), echo });
    }
  }
  return result;
}

function isDuplicateKey(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === 11000; }

async function resolveConnection(accountId: string) {
  const rows = await InstagramAccountConnectionModel.find({ instagramUserId: accountId, status: "connected" }).select("ownerUserId").limit(2).lean();
  if (rows.length !== 1) throw new AppError(404, "INSTAGRAM_ACCOUNT_NOT_FOUND", "Instagram account is not connected");
  return rows[0]!;
}

async function persist(event: InstagramTextEvent, ownerId: mongoose.Types.ObjectId): Promise<void> {
  const session = await mongoose.startSession();
  let emitted: { conversationId: string; message: ReturnType<typeof toMessage>; conversation: ReturnType<typeof toConversation>; recipients: string[] } | undefined;
  try {
    await session.withTransaction(async () => {
      if (await MessageModel.exists({ platform: "instagram", externalMessageId: `instagram:${event.accountId}:${event.mid}` }).session(session)) return;
      const customerId = `instagram:${event.accountId}:${event.igsid}`;
      const customer = await CustomerModel.findOneAndUpdate(
        { platform: "instagram", platformId: customerId },
        { $setOnInsert: { platform: "instagram", platformId: customerId, name: `Instagram ${event.igsid}` } },
        { upsert: true, returnDocument: "after", session }
      );
      const conversation = await ConversationModel.findOneAndUpdate(
        { platform: "instagram", channelId: event.accountId, ownerId, customerId: customer._id },
        { $setOnInsert: { platform: "instagram", channelId: event.accountId, ownerId, customerId: customer._id, botEnabled: false, lastMessageAt: event.timestamp, lastMessageSnippet: event.text } },
        { upsert: true, returnDocument: "after", session }
      );
      const result = await MessageModel.updateOne(
        { platform: "instagram", externalMessageId: `instagram:${event.accountId}:${event.mid}` },
        { $setOnInsert: { conversationId: conversation._id, platform: "instagram", externalMessageId: `instagram:${event.accountId}:${event.mid}`, createdAt: event.timestamp, updatedAt: new Date(), senderType: event.echo ? "agent" : "customer", senderId: event.echo ? String(ownerId) : event.igsid, type: "text", content: event.text, deliveryStatus: event.echo ? "sent" : "delivered" } },
        { upsert: true, session, timestamps: false }
      );
      if (result.upsertedCount !== 1) return;
      const update = {
        ...(event.timestamp.getTime() >= conversation.lastMessageAt.getTime() ? { $set: { lastMessageAt: event.timestamp, lastMessageSnippet: event.text } } : {}),
        ...(event.echo ? {} : { $inc: { unreadCount: 1 } })
      };
      const updated = Object.keys(update).length
        ? await ConversationModel.findOneAndUpdate({ _id: conversation._id, ownerId }, update, { returnDocument: "after", session }).populate("customerId", "name avatarUrl").populate("tagIds", "name color")
        : await ConversationModel.findById(conversation._id).session(session).populate("customerId", "name avatarUrl").populate("tagIds", "name color");
      const message = await MessageModel.findOne({ platform: "instagram", externalMessageId: `instagram:${event.accountId}:${event.mid}` }).session(session).lean();
      if (!updated || !message) throw new Error("Instagram persistence incomplete");
      emitted = { conversationId: String(conversation._id), message: toMessage(message), conversation: toConversation(updated.toObject()), recipients: [String(ownerId), ...(updated.assignedAgentId ? [String(updated.assignedAgentId)] : [])] };
    });
  } catch (error) {
    if (!isDuplicateKey(error) || !(await MessageModel.exists({ platform: "instagram", externalMessageId: `instagram:${event.accountId}:${event.mid}` }))) throw error;
    return;
  } finally { await session.endSession(); }
  if (emitted) {
    emitChatEvent("chat:message_received", emitted.conversationId, emitted.message);
    emitInboxEventToRecipients("chat:conversation_updated", emitted.recipients, emitted.conversation);
  }
}

export async function processInstagramWebhook(payload: unknown): Promise<void> {
  const events = normalizeInstagramWebhook(payload);
  const connections = new Map<string, mongoose.Types.ObjectId>();
  for (const event of events) {
    if (!connections.has(event.accountId)) connections.set(event.accountId, (await resolveConnection(event.accountId)).ownerUserId as mongoose.Types.ObjectId);
    await persist(event, connections.get(event.accountId)!);
  }
}
