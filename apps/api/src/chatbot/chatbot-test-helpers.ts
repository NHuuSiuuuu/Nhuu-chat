import mongoose from "mongoose";
import { AssistantModel } from "../models/assistant.model.js";
import { AutomationTemplateModel } from "../models/automation-template.model.js";
import { BotProcessingModel } from "../models/bot-processing.model.js";
import { ConversationModel } from "../models/conversation.model.js";
import { CustomerModel } from "../models/customer.model.js";
import { MessageModel } from "../models/message.model.js";

export const now = new Date("2026-09-14T12:00:00.000Z");
export const fallback = "Em chưa có đủ thông tin, nhân viên sẽ hỗ trợ.";

export async function resetBotDatabase() {
  await Promise.all(
    [
      AssistantModel,
      AutomationTemplateModel,
      BotProcessingModel,
      ConversationModel,
      CustomerModel,
      MessageModel
    ].map((model) => model.deleteMany({}))
  );
  await BotProcessingModel.init();
}

export async function seedBotConversation() {
  const ownerId = String(new mongoose.Types.ObjectId());
  const customer = await CustomerModel.create({
    name: "Khách",
    platform: "telegram",
    platformId: "42"
  });
  const conversation = await ConversationModel.create({
    ownerId,
    customerId: customer._id,
    platform: "telegram",
    channelId: "42",
    unreadCount: 2
  });
  const assistant = await AssistantModel.create({
    ownerId,
    name: "Trợ lý",
    instructions: "Chỉ dùng kiến thức cửa hàng.",
    modelTier: "balanced",
    fallbackMessage: fallback,
    isDefault: true
  });
  const message = await MessageModel.create({
    conversationId: conversation._id,
    platform: "telegram",
    senderType: "customer",
    senderId: "42",
    content: "giá",
    deliveryStatus: "delivered"
  });
  const input = {
    ownerId,
    conversationId: String(conversation._id),
    customerMessageId: String(message._id),
    platform: "telegram",
    channelId: "42",
    senderType: "customer" as const,
    content: "giá",
    type: "text" as const
  };
  return { input, assistant, conversation, message };
}

export async function seedTemplate(ownerId: string, assistantId: string, extra = {}) {
  return AutomationTemplateModel.create({
    ownerId,
    assistantId,
    name: "Báo giá",
    keywords: ["giá"],
    responseTemplate: "Giá 100.000đ",
    allowAiRewrite: false,
    priority: 1,
    enabled: true,
    channelScope: { mode: "channels", identifiers: ["telegram:42"] },
    ...extra
  });
}
