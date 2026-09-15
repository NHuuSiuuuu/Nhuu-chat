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

  it("returns null for malformed or empty events", () => {
    expect(normalizeZaloPersonalMessage(null, "account-1")).toBeNull();
    expect(normalizeZaloPersonalMessage({}, "account-1")).toBeNull();
    expect(normalizeZaloPersonalMessage({ type: 0, threadId: "thread", data: { content: "" } }, "account-1")).toBeNull();
  });
});
