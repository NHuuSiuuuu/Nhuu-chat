import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ConversationModel } from "./conversation.model.js";
import { CustomerModel } from "./customer.model.js";
import { MessageModel } from "./message.model.js";

describe("Zalo personal canonical model support", () => {
  it("accepts zalo_personal in each canonical platform validator", async () => {
    const customer = new CustomerModel({ name: "Khách Zalo", platform: "zalo_personal", platformId: "zalo-user-1" });
    const conversation = new ConversationModel({
      customerId: new mongoose.Types.ObjectId(),
      platform: "zalo_personal",
      channelId: "thread-1",
      ownerId: new mongoose.Types.ObjectId()
    });
    const message = new MessageModel({
      conversationId: new mongoose.Types.ObjectId(),
      platform: "zalo_personal",
      senderType: "customer",
      senderId: "zalo-user-1"
    });

    await expect(customer.validate()).resolves.toBeUndefined();
    await expect(conversation.validate()).resolves.toBeUndefined();
    await expect(message.validate()).resolves.toBeUndefined();
  });

  it("defines owner-scoped uniqueness for platform conversation threads", () => {
    const index = ConversationModel.schema.indexes().find(([fields, options]) =>
      fields.platform === 1 && fields.channelId === 1 && fields.ownerId === 1 && options?.unique === true
    );

    expect(index).toBeDefined();
  });
});
