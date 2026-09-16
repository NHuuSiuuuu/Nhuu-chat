import { describe, expect, it } from "vitest";

import { normalizeZaloPersonalMessage } from "./zalo-personal.normalizer.js";

describe("Zalo personal message normalizer", () => {
  it("normalizes direct text with the thread id as channel id", () => {
    const result = normalizeZaloPersonalMessage({
      type: 0,
      threadId: "thread-direct",
      isSelf: false,
      data: { msgId: "message-1", uidFrom: "sender-1", dName: "Sender", content: "hello", ts: "1700000000000", msgType: "webchat" }
    }, "account-1");

    expect(result).toMatchObject({
      platform: "zalo_personal",
      externalMessageId: "message-1",
      channelId: "thread-direct",
      senderId: "sender-1",
      senderName: "Sender",
      type: "text",
      content: "hello",
      chatType: "private",
      isSelf: false
    });
    expect(result?.sentAt).toEqual(new Date(1700000000000));
  });

  it("normalizes group media with caption and recognizes account-originated events", () => {
    const result = normalizeZaloPersonalMessage({
      type: 1,
      threadId: "group-1",
      isSelf: true,
      data: { msgId: "message-2", uidFrom: "account-1", dName: "Nhuu", content: "caption", ts: 1700000001000, msgType: "photo", propertyExt: { ext: "image/jpeg" } }
    }, "account-1");

    expect(result).toMatchObject({
      channelId: "group-1",
      senderId: "account-1",
      type: "image",
      content: "caption",
      chatType: "group",
      isSelf: true
    });
  });

  it("preserves safe metadata for media-only messages without retaining secrets", () => {
    const result = normalizeZaloPersonalMessage({
      type: 0,
      threadId: "thread-media",
      data: {
        msgId: "message-media-1",
        uidFrom: "sender-1",
        content: "",
        ts: 1700000001000,
        msgType: "photo",
        propertyExt: {
          url: "https://cdn.example/photo.jpg",
          fileName: "photo.jpg",
          width: 1200,
          accessToken: "do-not-persist",
          cookie: "do-not-persist"
        }
      }
    }, "account-1");

    expect(result).toMatchObject({
      type: "image",
      content: "",
      metadata: {
        messageType: "photo",
        media: { url: "https://cdn.example/photo.jpg", fileName: "photo.jpg", width: 1200 }
      }
    });
    expect(JSON.stringify(result)).not.toContain("do-not-persist");
  });

  it("normalizes caption and safe media fields from a native zca-js attachment object", () => {
    const result = normalizeZaloPersonalMessage({
      type: 1,
      threadId: "group-native-photo",
      data: {
        msgId: "message-native-photo",
        uidFrom: "sender-1",
        dName: "Khách hàng",
        ts: "1700000002000",
        msgType: "chat.photo",
        content: {
          title: "Menu mùa thu",
          description: "Ảnh menu mới",
          href: "https://cdn.example/menu.jpg",
          thumb: "https://cdn.example/menu-thumb.jpg",
          childnumber: 1,
          action: "",
          params: JSON.stringify({ width: 1200, height: 800, accessToken: "do-not-persist" }),
          type: "photo"
        },
        propertyExt: { ext: "image/jpeg", color: 0, size: 0, type: 0, subType: 0 }
      }
    }, "account-1");

    expect(result).toMatchObject({
      type: "image",
      content: "Menu mùa thu",
      metadata: {
        messageType: "chat.photo",
        media: {
          ext: "image/jpeg",
          title: "Menu mùa thu",
          description: "Ảnh menu mới",
          href: "https://cdn.example/menu.jpg",
          thumb: "https://cdn.example/menu-thumb.jpg",
          childnumber: 1,
          action: "",
          params: { width: 1200, height: 800 },
          type: "photo"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("do-not-persist");
  });

  it("returns null for malformed or empty events", () => {
    expect(normalizeZaloPersonalMessage(null, "account-1")).toBeNull();
    expect(normalizeZaloPersonalMessage({}, "account-1")).toBeNull();
    expect(normalizeZaloPersonalMessage({ type: 0, threadId: "thread", data: { content: "" } }, "account-1")).toBeNull();
    expect(normalizeZaloPersonalMessage({ type: 2, threadId: "thread", data: { msgId: "message-3", uidFrom: "sender-1", content: "hello", ts: 1700000000000 } }, "account-1")).toBeNull();
  });

  it("uses sender identity for self messages even when the event flag contradicts it", () => {
    const result = normalizeZaloPersonalMessage({
      type: 0,
      threadId: "thread-direct",
      isSelf: true,
      data: { msgId: "message-4", uidFrom: "other-account", content: "hello", ts: 1700000000000 }
    }, "account-1");

    expect(result?.isSelf).toBe(false);
  });
});
