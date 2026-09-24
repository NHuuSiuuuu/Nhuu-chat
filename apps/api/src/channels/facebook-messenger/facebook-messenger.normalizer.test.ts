import { describe, expect, it } from "vitest";

import { normalizeMessengerWebhook } from "./facebook-messenger.normalizer.js";

describe("normalizeMessengerWebhook", () => {
  it("namespaces a customer text message by Page and preserves its timestamp", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 1720000000000, message: { mid: "mid-1", text: "Hello" } }] }] })).toEqual([
      { pageId: "page-1", customerId: "facebook:page-1:psid-1", externalMessageId: "facebook:page-1:mid-1", senderId: "psid-1", content: "Hello", sentAt: new Date(1720000000000), echo: false }
    ]);
  });

  it("ignores attachments, unsupported events and malformed payloads", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, message: { mid: "photo", attachments: [{ type: "image" }] } },
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, postback: { payload: "a" } },
      { sender: { id: "psid-1" }, recipient: { id: "wrong" }, message: { mid: "bad", text: "No" } }
    ] }] })).toEqual([]);
    expect(normalizeMessengerWebhook({ object: "user", entry: [] })).toEqual([]);
    expect(normalizeMessengerWebhook(null)).toEqual([]);
  });

  it("normalizes a Page echo to the recipient customer", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "page-1" }, recipient: { id: "psid-1" }, message: { mid: "echo-1", text: "Reply", is_echo: true } }] }] })).toEqual([
      { pageId: "page-1", customerId: "facebook:page-1:psid-1", externalMessageId: "facebook:page-1:echo-1", senderId: "page-1", content: "Reply", sentAt: expect.any(Date), echo: true }
    ]);
  });

  it("falls back to a valid time for an out of range provider timestamp", () => {
    const events = normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 9e15, message: { mid: "mid-1", text: "Hello" } }] }] });
    expect(Number.isFinite(events[0]?.sentAt.getTime())).toBe(true);
  });
});
