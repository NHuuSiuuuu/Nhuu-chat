import { describe, expect, it } from "vitest";

import {
  getNextUnreadConversationId,
  getNotificationSoundTones,
  orderConversationsByUnread,
  shouldPlayNotificationSound,
  shouldNotifyForIncomingMessage,
} from "./general-settings.js";

const enabledSettings = { browserNotificationsEnabled: true };

describe("general settings inbox behavior", () => {
  describe("incoming notifications", () => {
    it("notifies only for customer messages when enabled", () => {
      expect(shouldNotifyForIncomingMessage(enabledSettings, "customer")).toBe(true);
      expect(shouldNotifyForIncomingMessage(enabledSettings, "agent")).toBe(false);
      expect(shouldNotifyForIncomingMessage(enabledSettings, "bot")).toBe(false);
    });

    it("does not notify customer messages when notifications are disabled", () => {
      expect(shouldNotifyForIncomingMessage({ browserNotificationsEnabled: false }, "customer")).toBe(false);
    });
  });

  describe("notification sound", () => {
    it("plays customer message sounds independently of browser notification permission", () => {
      expect(shouldPlayNotificationSound("default", "customer")).toBe(true);
      expect(shouldPlayNotificationSound("default", "agent")).toBe(false);
      expect(shouldPlayNotificationSound("off", "customer")).toBe(false);
    });

    it("maps enabled sound choices to tone patterns", () => {
      expect(getNotificationSoundTones("default")).toEqual([{ frequency: 880, durationMs: 140 }]);
      expect(getNotificationSoundTones("tri-tone")).toEqual([
        { frequency: 660, durationMs: 100 },
        { frequency: 880, durationMs: 100 },
        { frequency: 1100, durationMs: 160 },
      ]);
      expect(getNotificationSoundTones("clubhouse")).toEqual([
        { frequency: 523, durationMs: 100 },
        { frequency: 659, durationMs: 100 },
        { frequency: 784, durationMs: 180 },
      ]);
    });

    it("maps off to no sound", () => {
      expect(getNotificationSoundTones("off")).toBeNull();
    });
  });

  describe("unread conversation ordering", () => {
    const conversations = [
      { id: "read-1", unreadCount: 0, lastMessageAt: "2026-09-20T10:00:00.000Z" },
      { id: "unread-1", unreadCount: 2, lastMessageAt: "2026-09-20T09:00:00.000Z" },
      { id: "read-2", unreadCount: 0, lastMessageAt: "2026-09-21T10:00:00.000Z" },
      { id: "unread-2", unreadCount: 1, lastMessageAt: "2026-09-21T09:00:00.000Z" },
    ];

    it("moves unread conversations first and orders each group by latest message", () => {
      expect(orderConversationsByUnread(conversations, true).map(({ id }) => id)).toEqual([
        "unread-2",
        "unread-1",
        "read-2",
        "read-1",
      ]);
    });

    it("preserves the existing order when unread prioritization is disabled", () => {
      expect(orderConversationsByUnread(conversations, false).map(({ id }) => id)).toEqual([
        "read-1",
        "unread-1",
        "read-2",
        "unread-2",
      ]);
    });
  });

  describe("next unread conversation", () => {
    const conversations = [
      { id: "current", unreadCount: 0 },
      { id: "read", unreadCount: 0 },
      { id: "unread-1", unreadCount: 1 },
      { id: "unread-2", unreadCount: 3 },
    ];

    it("selects the first unread conversation after the current one and wraps around", () => {
      expect(getNextUnreadConversationId(conversations, "current")).toBe("unread-1");
      expect(getNextUnreadConversationId(conversations, "unread-2")).toBe("unread-1");
    });

    it("returns null when no other conversation is unread", () => {
      expect(getNextUnreadConversationId([{ id: "current", unreadCount: 0 }], "current")).toBeNull();
    });
  });
});
