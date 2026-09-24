import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { AccentColor, GeneralSettingsContract, InterfaceDensity, MessageFontSize, ThemeMode } from "@nhuu-chat/contracts";

import { DEFAULT_APPEARANCE_SETTINGS, applyAppearanceSettings } from "../../state/appearance-settings.js";
import { publishGeneralSettingsUpdate } from "../../state/general-settings.js";
import { loadGeneralSettings, patchGeneralSettings } from "./general-settings.js";

type Props = { apiUrl: string; token: string; refresh?: () => Promise<string | null> };
type AppearanceKey = keyof typeof DEFAULT_APPEARANCE_SETTINGS;
const options: {
  themeMode: Array<[ThemeMode, string]>;
  accentColor: Array<[AccentColor, string, string]>;
  interfaceDensity: Array<[InterfaceDensity, string]>;
  messageFontSize: Array<[MessageFontSize, string]>;
} = {
  themeMode: [["light", "Sáng"], ["dark", "Tối"], ["system", "Theo thiết bị"]],
  accentColor: [["blue", "Xanh dương", "#2563eb"], ["cyan", "Xanh cyan", "#0891b2"], ["violet", "Tím", "#7c3aed"], ["emerald", "Xanh lá", "#059669"], ["rose", "Hồng", "#e11d48"]],
  interfaceDensity: [["comfortable", "Thoải mái"], ["compact", "Gọn"]],
  messageFontSize: [["small", "Nhỏ"], ["medium", "Vừa"], ["large", "Lớn"]]
};

function OptionGroup<T extends string>({ label, value, choices, onChange }: { label: string; value: T; choices: Array<[T, string, string?]>; onChange: (value: T) => void }) {
  return <fieldset className="border-b border-gray-100 py-5">
    <legend className="mb-3 text-sm font-semibold text-gray-800">{label}</legend>
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {choices.map(([choice, title, color]) => <button aria-pressed={value === choice} aria-label={`${label}: ${title}`} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${value === choice ? "border-[var(--accent-color)] bg-[var(--accent-soft)] font-semibold text-gray-900" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"} cursor-pointer`} key={choice} onClick={() => onChange(choice)} type="button">
        {color && <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: color }} />}{title}
      </button>)}
    </div>
  </fieldset>;
}

export function AppearanceSettingsPanel({ apiUrl, token, refresh }: Props) {
  const defaultsRef = useRef<GeneralSettingsContract>({
    browserNotificationsEnabled: true, notificationSound: "default", moveUnreadConversationsToTop: true, openNextUnreadConversation: false,
    ...DEFAULT_APPEARANCE_SETTINGS
  });
  const [settings, setSettings] = useState(defaultsRef.current);
  const settingsRef = useRef(settings);
  const confirmedRef = useRef(settings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function apply(next: GeneralSettingsContract) {
    settingsRef.current = next;
    setSettings(next);
    applyAppearanceSettings(next);
    publishGeneralSettingsUpdate(next);
  }

  useEffect(() => {
    let active = true;
    void loadGeneralSettings({ apiUrl, token, refresh }).then((loaded) => {
      if (!active) return;
      settingsRef.current = loaded;
      confirmedRef.current = loaded;
      setSettings(loaded);
      applyAppearanceSettings(loaded);
    }).catch(() => { if (active) setError("Không thể tải cài đặt giao diện"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiUrl, refresh, token]);

  function update<K extends AppearanceKey>(key: K, value: GeneralSettingsContract[K]) {
    const current = settingsRef.current;
    const next = { ...current, [key]: value };
    apply(next);
    setError(null);
    const save = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const result = await patchGeneralSettings({ apiUrl, token, refresh }, { [key]: value });
        confirmedRef.current = { ...confirmedRef.current, [key]: result[key] };
      } catch {
        if (settingsRef.current[key] === value) {
          const rollback = { ...settingsRef.current, [key]: confirmedRef.current[key] };
          apply(rollback);
          setError("Không thể lưu cài đặt giao diện. Đã khôi phục lựa chọn trước đó.");
        }
      }
    });
    saveQueue.current = save;
  }

  function reset() {
    const next = { ...settingsRef.current, ...DEFAULT_APPEARANCE_SETTINGS };
    const patch = { ...DEFAULT_APPEARANCE_SETTINGS };
    apply(next);
    setError(null);
    const save = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const result = await patchGeneralSettings({ apiUrl, token, refresh }, patch);
        confirmedRef.current = result;
        apply(result);
      } catch {
        apply({
          ...settingsRef.current,
          themeMode: confirmedRef.current.themeMode,
          accentColor: confirmedRef.current.accentColor,
          interfaceDensity: confirmedRef.current.interfaceDensity,
          messageFontSize: confirmedRef.current.messageFontSize
        });
        setError("Không thể lưu cài đặt giao diện. Đã khôi phục lựa chọn trước đó.");
      }
    });
    saveQueue.current = save;
  }

  if (loading) return <div className="grid min-h-[420px] place-items-center p-6 text-sm text-gray-500" role="status">Đang tải cài đặt giao diện...</div>;

  return <div className="min-w-0 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-bold text-gray-900">Giao diện</h2><p className="mt-1 text-sm text-gray-500">Tuỳ chỉnh cách hiển thị theo sở thích của bạn.</p></div>
      <button aria-label="Khôi phục mặc định" className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 cursor-pointer" onClick={reset} type="button">Khôi phục mặc định</button>
    </header>
    {error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
      <section aria-label="Tuỳ chọn giao diện" className="rounded-xl border border-gray-100 bg-white px-4 sm:px-6">
        <OptionGroup label="Chế độ màu" value={settings.themeMode} choices={options.themeMode} onChange={(value) => update("themeMode", value)} />
        <OptionGroup label="Màu nhấn" value={settings.accentColor} choices={options.accentColor} onChange={(value) => update("accentColor", value)} />
        <OptionGroup label="Mật độ giao diện" value={settings.interfaceDensity} choices={options.interfaceDensity} onChange={(value) => update("interfaceDensity", value)} />
        <OptionGroup label="Cỡ chữ tin nhắn" value={settings.messageFontSize} choices={options.messageFontSize} onChange={(value) => update("messageFontSize", value)} />
      </section>
      <section aria-label="Xem trước giao diện" className="self-start rounded-xl border border-gray-200 bg-[var(--surface-color)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">Xem trước</h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="conversation-item flex min-h-[88px] items-center border-b border-gray-100"><div className="flex w-full items-center gap-3 px-3 py-3.5 text-left"><span className="grid size-9 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-color)]">A</span><span><strong className="block text-sm text-gray-900">An Nguyễn</strong><span className="text-xs text-gray-500">Hội thoại gần đây</span></span></div></div>
          <div className="space-y-3 p-3"><p className="w-fit max-w-[90%] rounded-2xl bg-gray-100 px-3 py-2 text-[length:var(--message-font-size)] leading-6 text-gray-800">Tin nhắn xem trước</p><p className="ml-auto w-fit max-w-[90%] rounded-2xl bg-[var(--accent-soft)] px-3 py-2 text-[length:var(--message-font-size)] leading-6 text-gray-900">Giao diện sẽ cập nhật ngay</p></div>
        </div>
        <p className="mt-3 text-xs text-gray-500">Thay đổi được lưu cho tài khoản này và áp dụng ngay.</p>
      </section>
    </div>
  </div>;
}
