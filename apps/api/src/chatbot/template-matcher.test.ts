import type { AutomationTemplateContract } from "@nhuu-chat/contracts";
import { describe, expect, it } from "vitest";

import { matchAutomationTemplate } from "./template-matcher.js";

function template(
  id: string,
  patch: Partial<AutomationTemplateContract> = {}
): AutomationTemplateContract {
  return {
    id,
    ownerId: "owner-1",
    assistantId: "assistant-1",
    name: `Template ${id}`,
    keywords: ["xin chào"],
    responseTemplate: `Response ${id}`,
    allowAiRewrite: false,
    priority: 0,
    enabled: true,
    channelScope: { mode: "all", identifiers: [] },
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    ...patch
  };
}

describe("matchAutomationTemplate", () => {
  it("matches whole keywords without case or Vietnamese diacritic sensitivity", () => {
    const greeting = template("greeting");

    expect(matchAutomationTemplate({
      message: "Khách nhắn XIN CHAO shop!",
      platform: "telegram",
      templates: [greeting]
    })).toBe(greeting);
  });

  it("does not match a keyword inside another word", () => {
    expect(matchAutomationTemplate({
      message: "Shop có giao hàng không?",
      platform: "telegram",
      templates: [template("price", { keywords: ["giá"] })]
    })).toBeNull();
  });

  it("chooses the highest priority match and keeps input creation order for ties", () => {
    const firstCreated = template("first", { priority: 20 });
    const samePriorityLater = template("second", { priority: 20 });
    const lowerPriority = template("third", { priority: 10 });

    expect(matchAutomationTemplate({
      message: "xin chào",
      platform: "telegram",
      templates: [lowerPriority, firstCreated, samePriorityLater]
    })).toBe(firstCreated);
  });

  it("ignores disabled templates and templates outside the current platform", () => {
    const disabled = template("disabled", { enabled: false, priority: 100 });
    const wrongPlatform = template("facebook", {
      priority: 50,
      channelScope: { mode: "channels", identifiers: ["facebook"] }
    });
    const telegram = template("telegram", {
      channelScope: { mode: "channels", identifiers: ["telegram"] }
    });

    expect(matchAutomationTemplate({
      message: "xin chao",
      platform: "telegram",
      templates: [disabled, wrongPlatform, telegram]
    })).toBe(telegram);
  });

  it.each(["", "   "])("returns null for empty or media-only text input %j", (message) => {
    expect(matchAutomationTemplate({
      message,
      platform: "telegram",
      templates: [template("greeting")]
    })).toBeNull();
  });
});
