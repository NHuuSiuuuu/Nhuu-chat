import { beforeEach, describe, expect, it, vi } from "vitest";

const assistantDatabase = vi.hoisted(() => ({ findOne: vi.fn() }));
const templateDatabase = vi.hoisted(() => ({ insertMany: vi.fn() }));

vi.mock("../models/assistant.model.js", () => ({ AssistantModel: assistantDatabase }));
vi.mock("../models/automation-template.model.js", () => ({ AutomationTemplateModel: templateDatabase }));

import { importAutomationTemplates } from "./automation-template.service.js";

const ownerId = "507f1f77bcf86cd799439011";
const assistantId = "507f191e810c19729de860ea";

function leanQuery<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: "64b64cfa12ab34cd56ef7890",
    ownerId,
    assistantId,
    name: "Chào khách",
    keywords: ["hi", "hello"],
    responseTemplate: "Xin chào ạ",
    allowAiRewrite: false,
    priority: 0,
    enabled: true,
    channelScope: { mode: "all", identifiers: [] },
    createdAt: new Date("2026-09-16T10:00:00.000Z"),
    updatedAt: new Date("2026-09-16T10:00:00.000Z"),
    ...overrides
  };
}

describe("importAutomationTemplates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports rows for the owned assistant with safe defaults", async () => {
    assistantDatabase.findOne.mockReturnValue(leanQuery({ _id: assistantId, ownerId }));
    templateDatabase.insertMany.mockResolvedValue([templateRow()]);

    await expect(importAutomationTemplates(ownerId, assistantId, [{
      name: "Chào khách",
      keywords: ["hi", "hello"],
      responseTemplate: "Xin chào ạ",
      enabled: true
    }])).resolves.toEqual({
      imported: 1,
      templates: [expect.objectContaining({
        id: "64b64cfa12ab34cd56ef7890",
        ownerId,
        assistantId,
        allowAiRewrite: false,
        priority: 0,
        channelScope: { mode: "all", identifiers: [] }
      })]
    });

    expect(templateDatabase.insertMany).toHaveBeenCalledWith([{
      ownerId,
      assistantId,
      name: "Chào khách",
      keywords: ["hi", "hello"],
      responseTemplate: "Xin chào ạ",
      enabled: true,
      allowAiRewrite: false,
      priority: 0,
      channelScope: { mode: "all", identifiers: [] }
    }]);
  });

  it("rejects an assistant outside the authenticated owner before inserting", async () => {
    assistantDatabase.findOne.mockReturnValue(leanQuery(null));

    await expect(importAutomationTemplates(ownerId, assistantId, [])).rejects.toMatchObject({
      statusCode: 404,
      code: "ASSISTANT_NOT_FOUND"
    });
    expect(templateDatabase.insertMany).not.toHaveBeenCalled();
  });
});
