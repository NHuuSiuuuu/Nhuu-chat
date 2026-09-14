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
      channelIdentifier: "telegram:shop-a",
      templates: [greeting]
    })).toBe(greeting);
  });

  it("does not match a keyword inside another word", () => {
    expect(matchAutomationTemplate({
      message: "Shop có giao hàng không?",
      channelIdentifier: "telegram:shop-a",
      templates: [template("price", { keywords: ["giá"] })]
    })).toBeNull();
  });

  it("chooses the highest priority match and keeps input creation order for ties", () => {
    const firstCreated = template("first", { priority: 20 });
    const samePriorityLater = template("second", { priority: 20 });
    const lowerPriority = template("third", { priority: 10 });

    expect(matchAutomationTemplate({
      message: "xin chào",
      channelIdentifier: "telegram:shop-a",
      templates: [lowerPriority, firstCreated, samePriorityLater]
    })).toBe(firstCreated);
  });

  it("ignores disabled templates and templates outside the current channel", () => {
    const disabled = template("disabled", { enabled: false, priority: 100 });
    const wrongPlatform = template("facebook", {
      priority: 50,
      channelScope: { mode: "channels", identifiers: ["facebook:page-a"] }
    });
    const telegram = template("telegram", {
      channelScope: { mode: "channels", identifiers: ["telegram:shop-a"] }
    });

    expect(matchAutomationTemplate({
      message: "xin chao",
      channelIdentifier: "telegram:shop-a",
      templates: [disabled, wrongPlatform, telegram]
    })).toBe(telegram);
  });

  it("matches an exact canonical channel identifier only", () => {
    const shopA = template("shop-a", {
      channelScope: { mode: "channels", identifiers: ["telegram:shop-a"] }
    });

    expect(matchAutomationTemplate({
      message: "xin chao",
      channelIdentifier: "telegram:shop-a",
      templates: [shopA]
    })).toBe(shopA);
    expect(matchAutomationTemplate({
      message: "xin chao",
      channelIdentifier: "telegram:shop-b",
      templates: [shopA]
    })).toBeNull();
  });

  it.each(["", "   "])("returns null for empty or media-only text input %j", (message) => {
    expect(matchAutomationTemplate({
      message,
      channelIdentifier: "telegram:shop-a",
      templates: [template("greeting")]
    })).toBeNull();
  });
});
