import { describe, expect, it } from "vitest";

import { normalizeMessengerWebhook } from "./facebook-messenger.normalizer.js";

describe("normalizeMessengerWebhook", () => {
  it("namespaces a customer text message by Page and preserves its timestamp", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 1720000000000, message: { mid: "mid-1", text: "Hello" } }] }] })).toEqual([
      { pageId: "page-1", customerId: "facebook:page-1:psid-1", externalMessageId: "facebook:page-1:mid-1", senderId: "psid-1", content: "Hello", attachments: [], sentAt: new Date(1720000000000), echo: false }
    ]);
  });

  it("normalizes image attachments and sticker ids without requiring text", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 1720000000000, message: { mid: "photo-1", attachments: [{ type: "image", payload: { url: "https://cdn.example/photo.jpg" } }], sticker_id: "sticker-7" } },
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, message: { mid: "sticker-1", sticker_id: 42 } }
    ] }] })).toMatchObject([
      { externalMessageId: "facebook:page-1:photo-1", content: "", attachments: [{ url: "https://cdn.example/photo.jpg", fileType: "image/jpeg" }], stickerId: "sticker-7" },
      { externalMessageId: "facebook:page-1:sticker-1", content: "", attachments: [], stickerId: "42" }
    ]);
  });

  it("ignores unsupported events, unsafe attachment URLs and malformed payloads", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, message: { mid: "unsafe-photo", attachments: [{ type: "image", payload: { url: "javascript:alert(1)" } }] } },
      { sender: { id: "psid-1" }, recipient: { id: "page-1" }, postback: { payload: "a" } },
      { sender: { id: "psid-1" }, recipient: { id: "wrong" }, message: { mid: "bad", text: "No" } }
    ] }] })).toEqual([]);
    expect(normalizeMessengerWebhook({ object: "user", entry: [] })).toEqual([]);
    expect(normalizeMessengerWebhook(null)).toEqual([]);
  });

  it("normalizes a Page echo to the recipient customer", () => {
    expect(normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "page-1" }, recipient: { id: "psid-1" }, message: { mid: "echo-1", text: "Reply", is_echo: true } }] }] })).toEqual([
      { pageId: "page-1", customerId: "facebook:page-1:psid-1", externalMessageId: "facebook:page-1:echo-1", senderId: "page-1", content: "Reply", attachments: [], sentAt: expect.any(Date), echo: true }
    ]);
  });

  it("falls back to a valid time for an out of range provider timestamp", () => {
    const events = normalizeMessengerWebhook({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "psid-1" }, recipient: { id: "page-1" }, timestamp: 9e15, message: { mid: "mid-1", text: "Hello" } }] }] });
    expect(Number.isFinite(events[0]?.sentAt.getTime())).toBe(true);
  });
});
