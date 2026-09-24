import type { NotificationSound } from "@nhuu-chat/contracts";
import type { GeneralSettingsContract } from "@nhuu-chat/contracts";

export const GENERAL_SETTINGS_UPDATED_EVENT = "nhuu-chat:general-settings-updated";

export function publishGeneralSettingsUpdate(settings: GeneralSettingsContract): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_UPDATED_EVENT, { detail: settings }));
  }
}

export type InboxMessageSender = "customer" | "agent" | "bot";

export interface NotificationSettings {
  browserNotificationsEnabled: boolean;
}

export interface NotificationTone {
  frequency: number;
  durationMs: number;
}

const SOUND_PATTERNS: Record<Exclude<NotificationSound, "off">, NotificationTone[]> = {
  default: [{ frequency: 880, durationMs: 140 }],
  "tri-tone": [
    { frequency: 660, durationMs: 100 },
    { frequency: 880, durationMs: 100 },
    { frequency: 1100, durationMs: 160 },
  ],
  clubhouse: [
    { frequency: 523, durationMs: 100 },
    { frequency: 659, durationMs: 100 },
    { frequency: 784, durationMs: 180 },
  ],
};

export function shouldNotifyForIncomingMessage(settings: NotificationSettings, senderType: InboxMessageSender): boolean {
  return settings.browserNotificationsEnabled && senderType === "customer";
}

export function shouldPlayNotificationSound(sound: NotificationSound, senderType: InboxMessageSender): boolean {
  return sound !== "off" && senderType === "customer";
}

export function getNotificationSoundTones(sound: NotificationSound): NotificationTone[] | null {
  return sound === "off" ? null : SOUND_PATTERNS[sound];
}

export function orderConversationsByUnread<T extends { unreadCount: number; lastMessageAt: string }>(items: readonly T[], enabled: boolean): T[] {
  if (!enabled) return [...items];

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const unreadDifference = Number(right.item.unreadCount > 0) - Number(left.item.unreadCount > 0);
      if (unreadDifference !== 0) return unreadDifference;
      return right.item.lastMessageAt.localeCompare(left.item.lastMessageAt) || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function getNextUnreadConversationId<T extends { id: string; unreadCount: number }>(items: readonly T[], currentId: string): string | null {
  if (items.length < 2) return null;

  const currentIndex = items.findIndex((item) => item.id === currentId);
  const startIndex = currentIndex < 0 ? 0 : currentIndex + 1;

  for (let offset = 0; offset < items.length; offset += 1) {
    const item = items[(startIndex + offset) % items.length];
    if (item.id !== currentId && item.unreadCount > 0) return item.id;
  }

  return null;
}
