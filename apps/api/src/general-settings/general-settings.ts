export const notificationSounds = ["off", "default", "tri-tone", "clubhouse"] as const;
export type NotificationSound = (typeof notificationSounds)[number];
export const themeModes = ["light", "dark", "system"] as const;
export const accentColors = ["blue", "cyan", "violet", "emerald", "rose"] as const;
export const interfaceDensities = ["comfortable", "compact"] as const;
export const messageFontSizes = ["small", "medium", "large"] as const;

export interface GeneralSettings {
  browserNotificationsEnabled: boolean;
  notificationSound: NotificationSound;
  moveUnreadConversationsToTop: boolean;
  openNextUnreadConversation: boolean;
  themeMode: "light" | "dark" | "system";
  accentColor: "blue" | "cyan" | "violet" | "emerald" | "rose";
  interfaceDensity: "comfortable" | "compact";
  messageFontSize: "small" | "medium" | "large";
}

export type GeneralSettingsPatch = Partial<GeneralSettings>;

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  browserNotificationsEnabled: true,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false,
  themeMode: "light",
  accentColor: "blue",
  interfaceDensity: "comfortable",
  messageFontSize: "medium"
};

function isNotificationSound(value: unknown): value is NotificationSound {
  return notificationSounds.includes(value as NotificationSound);
}

function isOption<T extends string>(options: readonly T[], value: unknown): value is T {
  return options.includes(value as T);
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
      : DEFAULT_GENERAL_SETTINGS.openNextUnreadConversation,
    themeMode: isOption(themeModes, settings.themeMode) ? settings.themeMode : DEFAULT_GENERAL_SETTINGS.themeMode,
    accentColor: isOption(accentColors, settings.accentColor) ? settings.accentColor : DEFAULT_GENERAL_SETTINGS.accentColor,
    interfaceDensity: isOption(interfaceDensities, settings.interfaceDensity) ? settings.interfaceDensity : DEFAULT_GENERAL_SETTINGS.interfaceDensity,
    messageFontSize: isOption(messageFontSizes, settings.messageFontSize) ? settings.messageFontSize : DEFAULT_GENERAL_SETTINGS.messageFontSize
  };
}
