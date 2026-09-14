import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { AssistantModel } from "./assistant.model.js";
import { AutomationTemplateModel } from "./automation-template.model.js";
import { BotProcessingModel } from "./bot-processing.model.js";

describe("chatbot models", () => {
  it("stores owner-scoped assistant fields and defaults fallback message", () => {
    const assistant = new AssistantModel({
      ownerId: new mongoose.Types.ObjectId(),
      name: "Tư vấn bán hàng",
      instructions: "Trả lời ngắn gọn",
      modelTier: "balanced"
    });

    expect(assistant.ownerId).toBeDefined();
    expect(assistant.modelTier).toBe("balanced");
    expect(assistant.fallbackMessage).toBe("Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.");
    expect(assistant.enabled).toBe(true);
    expect(assistant.channelScope.toObject()).toEqual({ mode: "all", identifiers: [] });
  });

  it("validates assistant and template enums", () => {
    const assistant = new AssistantModel({ modelTier: "invalid" });
    const template = new AutomationTemplateModel({
      channelScope: { mode: "invalid", identifiers: [] }
    });

    expect(AssistantModel.schema.path("modelTier").enumValues).toEqual([
      "smart", "balanced", "economy"
    ]);
    expect(AutomationTemplateModel.schema.path("channelScope.mode")).toBeDefined();
    expect(assistant.modelTier).toBe("invalid");
    expect(template.channelScope?.mode).toBe("invalid");
  });

  it("requires owner fields for assistant and template documents", () => {
    expect(AssistantModel.schema.path("ownerId").isRequired).toBe(true);
    expect(AutomationTemplateModel.schema.path("ownerId").isRequired).toBe(true);
  });

  it("defines a unique partial idempotency index for processing records", () => {
    const index = BotProcessingModel.schema.indexes().find(([fields, options]) =>
      fields.ownerId === 1 &&
      fields.conversationId === 1 &&
      fields.customerMessageId === 1 &&
      options?.unique === true
    );

    expect(index).toBeDefined();
    expect(index?.[1].partialFilterExpression).toEqual({
      customerMessageId: { $type: "objectId" }
    });
  });
});
