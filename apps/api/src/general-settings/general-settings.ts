export const notificationSounds = ["off", "default", "tri-tone", "clubhouse"] as const;
export type NotificationSound = (typeof notificationSounds)[number];

export interface GeneralSettings {
  browserNotificationsEnabled: boolean;
  notificationSound: NotificationSound;
  moveUnreadConversationsToTop: boolean;
  openNextUnreadConversation: boolean;
}

export type GeneralSettingsPatch = Partial<GeneralSettings>;

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  browserNotificationsEnabled: true,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false
};

function isNotificationSound(value: unknown): value is NotificationSound {
  return notificationSounds.includes(value as NotificationSound);
}

// Chuẩn hóa dữ liệu cũ hoặc không đầy đủ để mọi consumer luôn nhận đủ cấu hình hợp lệ.
export function normalizeGeneralSettings(value: unknown): GeneralSettings {
  const settings = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    browserNotificationsEnabled: typeof settings.browserNotificationsEnabled === "boolean"
      ? settings.browserNotificationsEnabled
      : DEFAULT_GENERAL_SETTINGS.browserNotificationsEnabled,
    notificationSound: isNotificationSound(settings.notificationSound)
      ? settings.notificationSound
      : DEFAULT_GENERAL_SETTINGS.notificationSound,
    moveUnreadConversationsToTop: typeof settings.moveUnreadConversationsToTop === "boolean"
      ? settings.moveUnreadConversationsToTop
      : DEFAULT_GENERAL_SETTINGS.moveUnreadConversationsToTop,
    openNextUnreadConversation: typeof settings.openNextUnreadConversation === "boolean"
      ? settings.openNextUnreadConversation
      : DEFAULT_GENERAL_SETTINGS.openNextUnreadConversation
  };
}
