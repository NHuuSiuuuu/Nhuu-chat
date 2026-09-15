import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndDelete: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
  collection: { createIndex: vi.fn() },
  db: { transaction: vi.fn() }
}));
const templateDatabase = vi.hoisted(() => ({
  create: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndDelete: vi.fn(),
  findOneAndUpdate: vi.fn()
}));

vi.mock("../models/assistant.model.js", () => ({ AssistantModel: database }));
vi.mock("../models/automation-template.model.js", () => ({ AutomationTemplateModel: templateDatabase }));

import {
  createAssistant,
  deleteAssistant,
  listAssistants,
  resolveAssistant,
  updateAssistant
} from "./assistant.service.js";
import {
  createAutomationTemplate,
  deleteAutomationTemplate,
  listAutomationTemplates,
  updateAutomationTemplate
} from "./automation-template.service.js";

const ownerId = "507f1f77bcf86cd799439011";
const assistantId = "507f191e810c19729de860ea";

function assistantRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: assistantId,
    ownerId,
    name: "Tư vấn bán hàng",
    instructions: "Trả lời ngắn gọn",
    modelTier: "balanced",
    enabled: true,
    fallbackMessage: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.",
    channelScope: { mode: "all", identifiers: [] },
    isDefault: false,
    createdAt: new Date("2026-09-14T10:00:00.000Z"),
    updatedAt: new Date("2026-09-14T11:00:00.000Z"),
    __v: 0,
    ...overrides
  };
}

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64b64cfa12ab34cd56ef7890",
    ownerId,
    assistantId,
    name: "Báo giá",
    keywords: ["giá"],
    responseTemplate: "Giá từ 100.000đ",
    allowAiRewrite: false,
    priority: 10,
    enabled: true,
    channelScope: { mode: "all", identifiers: [] },
    createdAt: new Date("2026-09-14T10:00:00.000Z"),
    updatedAt: new Date("2026-09-14T11:00:00.000Z"),
    __v: 0,
    ...overrides
  };
}

function sortedQuery<T>(value: T) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function leanQuery<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("assistant service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    database.collection.createIndex.mockResolvedValue("unique_default_assistant_per_owner");
    database.db.transaction.mockImplementation(async (work: (session: object) => unknown) => work({ id: "session" }));
  });

  it("lists only assistants belonging to the authenticated owner and normalizes DTOs", async () => {
    database.find.mockReturnValue(sortedQuery([assistantRow()]));

    await expect(listAssistants(ownerId)).resolves.toEqual({
      assistants: [{
        id: assistantId,
        ownerId,
        name: "Tư vấn bán hàng",
        instructions: "Trả lời ngắn gọn",
        modelTier: "balanced",
        enabled: true,
        fallbackMessage: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.",
        channelScope: { mode: "all", identifiers: [] },
        isDefault: false,
        createdAt: "2026-09-14T10:00:00.000Z",
        updatedAt: "2026-09-14T11:00:00.000Z"
      }]
    });
    expect(database.find).toHaveBeenCalledWith({ ownerId });
  });

  it("creates a default assistant and unsets the previous owner default in one transaction", async () => {
    database.updateMany.mockResolvedValue({ acknowledged: true });
    database.create.mockResolvedValue([assistantRow({ isDefault: true })]);

    await createAssistant(ownerId, {
      name: "Tư vấn bán hàng",
      instructions: "Trả lời ngắn gọn",
      modelTier: "balanced",
      enabled: true,
      fallbackMessage: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.",
      channelScope: { mode: "all", identifiers: [] },
      isDefault: true
    });

    expect(database.db.transaction).toHaveBeenCalledOnce();
    expect(database.updateMany).toHaveBeenCalledWith(
      { ownerId, isDefault: true },
      { $set: { isDefault: false } },
      { session: { id: "session" } }
    );
    expect(database.create).toHaveBeenCalledWith(
      [expect.objectContaining({ ownerId, isDefault: true })],
      { session: { id: "session" } }
    );
  });

  it("rejects a concurrent default collision through a database partial unique index", async () => {
    database.updateMany.mockResolvedValue({ acknowledged: true });
    database.create.mockRejectedValue(Object.assign(new Error("duplicate default"), { code: 11000 }));

    await expect(createAssistant(ownerId, {
      name: "Tư vấn đồng thời",
      instructions: "Trả lời ngắn gọn",
      modelTier: "balanced",
      enabled: true,
      fallbackMessage: "Mình sẽ chuyển bạn đến nhân viên hỗ trợ nhé.",
      channelScope: { mode: "all", identifiers: [] },
      isDefault: true
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "DUPLICATE_RESOURCE",
      message: "Resource already exists"
    });
    expect(database.collection.createIndex).toHaveBeenCalledWith(
      { ownerId: 1, isDefault: 1 },
      {
        unique: true,
        partialFilterExpression: { isDefault: true },
        name: "unique_default_assistant_per_owner"
      }
    );
  });

  it("updates only an owned assistant and reports cross-owner access as not found", async () => {
    database.findOneAndUpdate.mockReturnValue(leanQuery(null));

    await expect(updateAssistant(ownerId, assistantId, { enabled: false })).rejects.toMatchObject({
      statusCode: 404,
      code: "ASSISTANT_NOT_FOUND"
    });
    expect(database.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: assistantId, ownerId },
      { $set: { enabled: false } },
      { new: true, runValidators: true }
    );
  });

  it("deletes only an owned assistant", async () => {
    database.findOneAndDelete.mockReturnValue(leanQuery(null));

    await expect(deleteAssistant(ownerId, assistantId)).rejects.toMatchObject({
      statusCode: 404,
      code: "ASSISTANT_NOT_FOUND"
    });
    expect(database.findOneAndDelete).toHaveBeenCalledWith({ _id: assistantId, ownerId });
  });

  it("resolves a direct platform channel assignment before the default assistant", async () => {
    const direct = assistantRow({
      channelScope: { mode: "channels", identifiers: ["telegram:shop-1"] }
    });
    database.findOne.mockReturnValueOnce(leanQuery(direct));

    await expect(resolveAssistant(ownerId, "telegram", "shop-1")).resolves.toMatchObject({
      id: assistantId,
      channelScope: { mode: "channels", identifiers: ["telegram:shop-1"] }
    });
    expect(database.findOne).toHaveBeenCalledWith({
      ownerId,
      enabled: true,
      "channelScope.mode": "channels",
      "channelScope.identifiers": "telegram:shop-1"
    });
    expect(database.findOne).toHaveBeenCalledOnce();
  });

  it("falls back to the enabled default when no direct assignment exists", async () => {
    database.findOne
      .mockReturnValueOnce(leanQuery(null))
      .mockReturnValueOnce(leanQuery(assistantRow({ isDefault: true })));

    await expect(resolveAssistant(ownerId, "zalo", "oa-1")).resolves.toMatchObject({
      id: assistantId,
      isDefault: true
    });
    expect(database.findOne).toHaveBeenNthCalledWith(2, {
      ownerId,
      enabled: true,
      isDefault: true
    });
  });
});

describe("automation template service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    templateDatabase.findOne.mockReturnValue(leanQuery(templateRow({ name: "Chào khách hàng" })));
    templateDatabase.findOneAndUpdate.mockReturnValue(leanQuery(templateRow({ name: "Chào khách hàng" })));
  });

  it("lists templates only after confirming the parent belongs to the owner", async () => {
    database.findOne.mockReturnValue(leanQuery(assistantRow()));
    templateDatabase.find.mockReturnValue(sortedQuery([templateRow()]));

    await expect(listAutomationTemplates(ownerId, assistantId)).resolves.toMatchObject({
      templates: [{ id: "64b64cfa12ab34cd56ef7890", ownerId, assistantId }]
    });
    expect(database.findOne).toHaveBeenCalledWith({ _id: assistantId, ownerId });
    expect(templateDatabase.find).toHaveBeenCalledWith({ ownerId, assistantId });
  });

  it("rejects creation when the requested assistant is outside the owner", async () => {
    database.findOne.mockReturnValue(leanQuery(null));

    await expect(createAutomationTemplate(ownerId, {
      assistantId,
      name: "Báo giá",
      keywords: ["giá"],
      responseTemplate: "Giá từ 100.000đ",
      allowAiRewrite: false,
      priority: 10,
      enabled: true,
      channelScope: { mode: "all", identifiers: [] }
    })).rejects.toMatchObject({ statusCode: 404, code: "ASSISTANT_NOT_FOUND" });
    expect(templateDatabase.create).not.toHaveBeenCalled();
  });

  it("does not recreate a greeting template after it has been deleted", async () => {
    database.findOne.mockReturnValue(leanQuery(assistantRow()));
    templateDatabase.find.mockReturnValue(sortedQuery([]));

    await expect(listAutomationTemplates(ownerId, assistantId)).resolves.toEqual({ templates: [] });

    expect(templateDatabase.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("updates and deletes only templates under the owner and route assistant", async () => {
    database.findOne.mockReturnValue(leanQuery(assistantRow()));
    templateDatabase.findOneAndUpdate.mockReturnValue(leanQuery(templateRow({ priority: 20 })));
    templateDatabase.findOneAndDelete.mockReturnValue(leanQuery(null));
    const templateId = "64b64cfa12ab34cd56ef7890";

    await expect(updateAutomationTemplate(ownerId, assistantId, templateId, { priority: 20 }))
      .resolves.toMatchObject({ id: templateId, priority: 20 });
    await expect(deleteAutomationTemplate(ownerId, assistantId, templateId)).rejects.toMatchObject({
      statusCode: 404,
      code: "AUTOMATION_TEMPLATE_NOT_FOUND"
    });
    expect(templateDatabase.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: templateId, ownerId, assistantId },
      { $set: { priority: 20 } },
      { new: true, runValidators: true }
    );
    expect(templateDatabase.findOneAndDelete).toHaveBeenCalledWith({ _id: templateId, ownerId, assistantId });
  });
});
