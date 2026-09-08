import { describe, expect, it } from "vitest";

import { ConversationModel } from "./conversation.model.js";
import { CustomerModel } from "./customer.model.js";
import { KnowledgeChunkModel, KnowledgeDocumentModel } from "./knowledge.model.js";
import { MessageModel } from "./message.model.js";
import { UserModel } from "./user.model.js";

describe("production model module imports", () => {
  it("loads all model modules through the ESM production runtime", () => {
    expect([
      UserModel,
      CustomerModel,
      ConversationModel,
      MessageModel,
      KnowledgeDocumentModel,
      KnowledgeChunkModel
    ]).toHaveLength(6);
  });
});
