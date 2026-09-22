import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { GeneralSettingsContract, NotificationSound } from "@nhuu-chat/contracts";
import { toast } from "sonner";

import { InboxIcon } from "../conversations/InboxIcon.js";
import { loadGeneralSettings, patchGeneralSettings } from "./general-settings.js";
const DEFAULT_SETTINGS: GeneralSettingsContract = {
  browserNotificationsEnabled: true,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false
};

const soundOptions: Array<{ value: NotificationSound; label: string }> = [
  { value: "off", label: "Tắt" },
  { value: "default", label: "Mặc định" },
  { value: "tri-tone", label: "Tri tone" },
  { value: "clubhouse", label: "Clubhouse" }
];

type Props = {
  apiUrl: string;
  token: string;
  refresh?: () => Promise<string | null>;
};

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
    <input aria-label={label} checked={checked} className="peer sr-only" onChange={(event) => onChange(event.target.checked)} role="switch" type="checkbox" />
    <span aria-hidden="true" className={`absolute inset-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500 ${checked ? "bg-blue-600" : "bg-gray-300"}`} />
    <span aria-hidden="true" className={`relative inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
  </label>;
}

function SettingRow({ icon, title, description, children }: { icon: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="flex items-start gap-4 py-5">
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center text-gray-600"><InboxIcon name={icon} size={21} /></span>
    <div className="min-w-0 flex-1">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
      {children}
    </div>
  </div>;
}

export function GeneralSettingsPanel({ apiUrl, token, refresh }: Props) {
  const [settings, setSettings] = useState<GeneralSettingsContract>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const confirmedSettingsRef = useRef(DEFAULT_SETTINGS);
  const requestIds = useRef<Partial<Record<keyof GeneralSettingsContract, number>>>({});
  const fieldQueues = useRef<Partial<Record<keyof GeneralSettingsContract, Promise<void>>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notificationWarning, setNotificationWarning] = useState<string | null>(null);

  function updateLocalSettings(update: (current: GeneralSettingsContract) => GeneralSettingsContract) {
    const next = update(settingsRef.current);
    settingsRef.current = next;
    setSettings(next);
  }

  useEffect(() => {
    let active = true;
    void loadGeneralSettings({ apiUrl, token, refresh }).then((result) => {
      if (!active) return;
      settingsRef.current = result;
      confirmedSettingsRef.current = result;
      setSettings(result);
      setLoadError(null);
    }).catch(() => {
      if (active) setLoadError("Không thể tải cài đặt chung");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [apiUrl, refresh, token]);

  async function changeSetting<K extends keyof GeneralSettingsContract>(key: K, value: GeneralSettingsContract[K]) {
    const requestId = (requestIds.current[key] ?? 0) + 1;
    requestIds.current[key] = requestId;
    updateLocalSettings((current) => ({ ...current, [key]: value }));
    setSaveError(null);
    const previousRequest = fieldQueues.current[key] ?? Promise.resolve();
    const saveRequest = previousRequest.catch(() => undefined).then(async () => {
      try {
        const saved = await patchGeneralSettings({ apiUrl, token, refresh }, { [key]: value });
        confirmedSettingsRef.current = { ...confirmedSettingsRef.current, [key]: saved[key] };
        if (requestIds.current[key] === requestId) {
          updateLocalSettings((current) => ({ ...current, [key]: saved[key] }));
        }
      } catch {
        if (requestIds.current[key] === requestId) {
          updateLocalSettings((current) => ({ ...current, [key]: confirmedSettingsRef.current[key] }));
          setSaveError("Không thể lưu cài đặt. Vui lòng thử lại.");
          toast.error("Không thể lưu cài đặt chung");
        }
      }
    });
    fieldQueues.current[key] = saveRequest;
    await saveRequest;
  }

  async function changeBrowserNotifications(enabled: boolean) {
    setNotificationWarning(null);
    const savePromise = changeSetting("browserNotificationsEnabled", enabled);
    if (enabled) {
      if (typeof Notification === "undefined") {
        setNotificationWarning("Trình duyệt không hỗ trợ thông báo");
      } else {
        try {
          const permission = Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
          if (permission === "denied") setNotificationWarning("Quyền thông báo đang bị chặn. Hãy bật quyền trong cài đặt trình duyệt.");
        } catch {
          setNotificationWarning("Không thể yêu cầu quyền thông báo từ trình duyệt");
        }
      }
    }
    await savePromise;
  }

  if (isLoading) return <div className="grid min-h-[420px] place-items-center p-6 text-sm text-gray-500" role="status">Đang tải cài đặt chung...</div>;

  return <div className="min-w-0 p-5 sm:p-8">
    <h2 className="text-2xl font-bold text-gray-900">Cài đặt chung</h2>
    {loadError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{loadError}</p>}
    <section className="mt-6 rounded-xl border border-gray-100 bg-white px-4 sm:px-7" aria-labelledby="general-settings-notifications-heading">
      <h2 className="border-b border-gray-100 py-5 text-lg font-semibold text-gray-800" id="general-settings-notifications-heading">Thông báo và hội thoại</h2>
      <SettingRow icon="bell" title="Âm thanh và thông báo" description="Thông báo qua trình duyệt khi có tin nhắn mới hoặc bình luận mới">
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <span className="sr-only">Bật thông báo</span>
          <SettingToggle label="Thông báo khi có tin nhắn hoặc bình luận mới" checked={settings.browserNotificationsEnabled} onChange={(checked) => void changeBrowserNotifications(checked)} />
        </div>
        {notificationWarning && <p className="mt-2 text-sm text-amber-700" role="status">{notificationWarning}</p>}
        <label className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 py-3 text-sm text-gray-700">
          <span>Phát âm thanh khi có hội thoại mới</span>
          <select aria-label="Âm thanh thông báo" className="min-w-32 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={settings.notificationSound} onChange={(event) => void changeSetting("notificationSound", event.target.value as NotificationSound)}>
            {soundOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </SettingRow>
      <div className="border-t border-gray-100">
        <SettingRow icon="user" title="Hội thoại" description="Đẩy những hội thoại chưa đọc lên đầu danh sách hội thoại">
          <div className="mt-3 flex justify-end"><SettingToggle label="Đẩy hội thoại chưa đọc lên đầu danh sách" checked={settings.moveUnreadConversationsToTop} onChange={(checked) => void changeSetting("moveUnreadConversationsToTop", checked)} /></div>
          <div className="mt-4 flex items-start justify-between gap-4 border-t border-gray-100 pt-4">
            <p className="text-sm leading-6 text-gray-700">Chuyển nhanh sang tin nhắn chưa đọc kế tiếp trong danh sách</p>
            <SettingToggle label="Chuyển sang hội thoại chưa đọc kế tiếp" checked={settings.openNextUnreadConversation} onChange={(checked) => void changeSetting("openNextUnreadConversation", checked)} />
          </div>
        </SettingRow>
      </div>
      {saveError && <p className="mb-5 text-sm text-rose-700" role="alert">{saveError}</p>}
    </section>
  </div>;
}
