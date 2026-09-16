import mongoose from "mongoose";
import { chatEvents } from "@nhuu-chat/contracts";
import { OutboundQueue } from "../jobs/outbound.queue.js";
import { OutboundWorker } from "../jobs/outbound.worker.js";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { MessageModel } from "../models/message.model.js";
import { isBotPaused, withConversationSendLock } from "../orchestration/bot-pause.service.js";
import { emitChatEvent, emitInboxEventToRecipients } from "../realtime/socket.js";
import { toConversation } from "../services/conversation.service.js";
import { toMessage } from "../services/message.service.js";
import {
  withBotTimeout,
  type BotProcessResult,
  type NormalizedCustomerMessage,
  type ResolveBotAdapter
} from "./channel-bot-adapter.js";

export interface BotDeliveryInput extends NormalizedCustomerMessage {
  processingId: string;
  assistantId: string;
  handoff: boolean;
}

export class BotDeliveryService {
  constructor(
    private readonly options: {
      resolveAdapter: ResolveBotAdapter;
      now?: () => Date;
      timeoutMs?: number;
    }
  ) {}

  // Giữ trước ID bot trên claim, lưu pending rồi mới gửi; một claim không thể tạo câu trả lời thứ hai.
  async deliver(input: BotDeliveryInput): Promise<BotProcessResult> {
    const now = this.options.now ?? (() => new Date());
    const filter = {
      _id: input.processingId,
      ownerId: input.ownerId,
      conversationId: input.conversationId,
      customerMessageId: input.customerMessageId,
      assistantId: input.assistantId,
      status: "processing"
    };
    let reserved = false;
    const botMessageId = new mongoose.Types.ObjectId();
    try {
      const conversation = await ConversationModel.findOne({
        _id: input.conversationId,
        ownerId: input.ownerId,
        platform: input.platform,
        channelId: input.channelId
      }).lean();
      if (!conversation || isBotPaused(conversation.botPausedUntil, now())) {
        await BotProcessingModel.updateOne(
          { ...filter, botMessageId: { $exists: false } },
          {
            $set: { status: "failed", errorCode: "BOT_PAUSED" }
          }
        );
        return { status: "skipped" };
      }
      const processing = await BotProcessingModel.findOneAndUpdate(
        {
          ...filter,
          botMessageId: { $exists: false }
        },
        { $set: { botMessageId } },
        { returnDocument: "after" }
      ).lean();
      if (!processing) return { status: "skipped" };
      reserved = true;
      await MessageModel.create({
        _id: botMessageId,
        conversationId: input.conversationId,
        platform: input.platform,
        senderType: "bot",
        senderId: input.assistantId,
        type: "text",
        content: input.content,
        deliveryStatus: "pending",
        metadata: { botProcessingId: input.processingId, handoff: input.handoff }
      });

      // Adapter chưa nhận khóa idempotency nên chỉ gửi một lần, kể cả lỗi/timeout không rõ kết quả.
      const queue = new OutboundQueue(now);
      let outcome: BotProcessResult = { status: "failed" };
      const worker = new OutboundWorker({
        queue,
        now,
        maxAttempts: 1,
        deliver: () =>
          withBotTimeout(async (signal) => {
            const adapter = await this.options.resolveAdapter(input);
            signal.throwIfAborted();
            if (!adapter) throw new Error("ADAPTER_UNAVAILABLE");
            return withConversationSendLock(input.conversationId, async () => {
              const latest = await ConversationModel.findOne({
                _id: input.conversationId,
                ownerId: input.ownerId,
                platform: input.platform,
                channelId: input.channelId
              }).lean();
              signal.throwIfAborted();
              if (!latest || isBotPaused(latest.botPausedUntil, now())) throw new Error("BOT_PAUSED");
              try {
                return await withBotTimeout(() => adapter.sendText({ channelId: input.channelId, content: input.content }), this.options.timeoutMs ?? 10_000);
              } catch {
                throw new Error("ADAPTER_FAILED");
              }
            }, signal);
          }, this.options.timeoutMs ?? 10_000),
        updateDelivery: async (_command, state) => {
          const failed = state.status === "failed";
          const handoff = input.handoff;
          const status = failed ? "failed" : handoff ? "handed_off" : "sent";
          const errorCode = failed ? "DELIVERY_FAILED" : undefined;
          // Cập nhật trạng thái gửi, bàn giao và snippet cùng transaction trước khi phát realtime.
          const persisted = await MessageModel.db.transaction(async (session) => {
            const message = await MessageModel.findOneAndUpdate(
              { _id: botMessageId },
              {
                $set: {
                  deliveryStatus: state.status,
                  "metadata.handoff": handoff,
                  ...(state.externalMessageId
                    ? { externalMessageId: state.externalMessageId }
                    : {}),
                  ...(errorCode ? { "metadata.errorCode": errorCode } : {})
                }
              },
              { returnDocument: "after", session }
            ).lean();
            const updatedProcessing = await BotProcessingModel.findOneAndUpdate(
              filter,
              {
                $set: { status, ...(errorCode ? { errorCode } : {}) }
              },
              { returnDocument: "after", session }
            ).lean();
            const updatedConversation = await ConversationModel.findOneAndUpdate(
              {
                _id: input.conversationId,
                ownerId: input.ownerId
              },
              {
                $set: {
                  lastMessageAt: now(),
                  lastMessageSnippet: input.content,
                  ...(handoff ? { status: "pending" } : {})
                },
                ...(handoff
                  ? { $max: { botPausedUntil: new Date(now().getTime() + 1_800_000) } }
                  : {})
              },
              { returnDocument: "after", session }
            )
              .populate("customerId", "name avatarUrl")
              .populate("tagIds", "name color")
              .lean();
            if (!message || !updatedProcessing || !updatedConversation)
              throw new Error("PERSISTENCE_FAILED");
            return { message, conversation: updatedConversation };
          });
          outcome = { status };
          // Lỗi socket không đổi kết quả gửi đã lưu và tuyệt đối không kích hoạt retry.
          try {
            const message = toMessage(persisted.message);
            emitChatEvent(chatEvents.messageReceived, input.conversationId, message);
            emitChatEvent(chatEvents.deliveryUpdated, input.conversationId, message);
            emitInboxEventToRecipients(
              chatEvents.conversationUpdated,
              [
                input.ownerId,
                persisted.conversation.assignedAgentId
                  ? String(persisted.conversation.assignedAgentId)
                  : ""
              ],
              toConversation(persisted.conversation)
            );
          } catch {
            /* Trạng thái bền vững vẫn được tải lại khi client kết nối lại. */
          }
        }
      });
      await queue.enqueue({
        messageId: String(botMessageId),
        conversationId: input.conversationId,
        platform: input.platform,
        channelId: input.channelId,
        content: input.content
      });
      await worker.runNext();
      return outcome;
    } catch {
      if (reserved) {
        // Giữ claim khi lỗi lưu trữ; bàn giao có dấu vết, không tự gửi lại kết quả có thể đã tới khách.
        await BotProcessingModel.updateOne(filter, {
          $set: { status: "failed", errorCode: "PERSISTENCE_FAILED" }
        }).catch(() => undefined);
        await MessageModel.updateOne(
          { _id: botMessageId },
          {
            $set: {
              deliveryStatus: "failed",
              "metadata.errorCode": "PERSISTENCE_FAILED",
              "metadata.handoff": input.handoff
            }
          }
        ).catch(() => undefined);
        await ConversationModel.updateOne(
          { _id: input.conversationId, ownerId: input.ownerId },
          {
            $set: { status: input.handoff ? "pending" : "open" }
          }
        ).catch(() => undefined);
      } else {
        // Chỉ kết thúc claim chưa được giữ chỗ; không bàn giao đè lên lượt gửi thắng đồng thời.
        await BotProcessingModel.db
          .transaction(async (session) => {
            const recovered = await BotProcessingModel.updateOne(
              { ...filter, botMessageId: { $exists: false } },
              { $set: { status: "failed", errorCode: "PERSISTENCE_FAILED" } },
              { session }
            );
            if (recovered.modifiedCount !== 1) return;
            await ConversationModel.updateOne(
              { _id: input.conversationId, ownerId: input.ownerId },
              {
                $set: { status: input.handoff ? "pending" : "open" }
              },
              { session }
            );
          })
          .catch(() => undefined);
      }
      return { status: "failed" };
    }
  }
}
