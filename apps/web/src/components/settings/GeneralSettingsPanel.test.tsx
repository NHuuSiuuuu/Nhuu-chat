import * as React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeneralSettingsContract } from "@nhuu-chat/contracts";
import { playNotificationSound } from "../../state/notification-sound.js";
import { GeneralSettingsPanel } from "./GeneralSettingsPanel.js";

vi.mock("../../state/notification-sound.js", () => ({
  playNotificationSound: vi.fn().mockResolvedValue(true)
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const settings: GeneralSettingsContract = {
  browserNotificationsEnabled: false,
  notificationSound: "default",
  moveUnreadConversationsToTop: true,
  openNextUnreadConversation: false,
  themeMode: "light",
  accentColor: "blue",
  interfaceDensity: "comfortable",
  messageFontSize: "medium"
};

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "children" in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return "";
}

function jsonResponse(body: GeneralSettingsContract): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function findControl(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.find((node) => node.props["aria-label"] === label);
}

async function renderLoaded(fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settings))) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(<GeneralSettingsPanel apiUrl="https://api.example.test" refresh={async () => null} token="session-token" />);
    await Promise.resolve();
  });
  return { fetchMock, renderer: renderer! };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GeneralSettingsPanel", () => {
  it("loads and renders the four accessible general-setting controls", async () => {
    const request = new Promise<Response>(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(request);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<GeneralSettingsPanel apiUrl="https://api.example.test" refresh={async () => null} token="session-token" />);
      await Promise.resolve();
    });
    expect(textContent(renderer!.root)).toContain("Đang tải cài đặt chung...");

    await act(async () => {
      renderer!.unmount();
    });

    const loaded = await renderLoaded(fetchMock.mockResolvedValue(jsonResponse(settings)));
    expect(loaded.fetchMock).toHaveBeenLastCalledWith(
      "https://api.example.test/api/v1/me/general-settings",
      expect.objectContaining({ credentials: "include" })
    );
    expect(textContent(loaded.renderer.root)).toContain("Thông báo và hội thoại");
    expect(findControl(loaded.renderer.root, "Thông báo khi có tin nhắn hoặc bình luận mới")).toBeTruthy();
    expect(findControl(loaded.renderer.root, "Âm thanh thông báo")).toBeTruthy();
    expect(findControl(loaded.renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách")).toBeTruthy();
    expect(findControl(loaded.renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp")).toBeTruthy();
  });

  it("plays a user-triggered preview of the selected notification sound", async () => {
    const { renderer } = await renderLoaded();

    await act(async () => {
      findControl(renderer.root, "Thử âm thanh thông báo").props.onClick();
      await Promise.resolve();
    });

    expect(playNotificationSound).toHaveBeenCalledWith("default");
  });

  it("explains when the browser cannot start the notification sound preview", async () => {
    vi.mocked(playNotificationSound).mockResolvedValueOnce(false);
    const { renderer } = await renderLoaded();

    await act(async () => {
      findControl(renderer.root, "Thử âm thanh thông báo").props.onClick();
      await Promise.resolve();
    });

    expect(textContent(renderer.root)).toContain("Trình duyệt chưa phát được âm thanh");
  });

  it("optimistically patches one setting and keeps the server response", async () => {
    let resolvePatch!: (response: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => { resolvePatch = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockReturnValueOnce(pendingPatch);
    const { renderer } = await renderLoaded(fetchMock);
    const control = findControl(renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp");

    let savePromise: Promise<void>;
    await act(async () => {
      savePromise = control.props.onChange({ target: { checked: true } });
      await Promise.resolve();
    });
    expect(findControl(renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp").props.checked).toBe(true);

    await act(async () => {
      resolvePatch(jsonResponse({ ...settings, openNextUnreadConversation: true }));
      await savePromise;
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.example.test/api/v1/me/general-settings",
      expect.objectContaining({
        body: JSON.stringify({ openNextUnreadConversation: true }),
        credentials: "include",
        method: "PATCH"
      })
    );
    expect(findControl(renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp").props.checked).toBe(true);
  });

  it("preserves newer values when different setting patches finish out of order", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const firstPatch = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const secondPatch = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockReturnValueOnce(firstPatch)
      .mockReturnValueOnce(secondPatch);
    const { renderer } = await renderLoaded(fetchMock);
    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;

    await act(async () => {
      firstSave = findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.onChange({ target: { checked: false } });
      secondSave = findControl(renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp").props.onChange({ target: { checked: true } });
      await Promise.resolve();
    });

    await act(async () => {
      resolveSecond(jsonResponse({ ...settings, openNextUnreadConversation: true }));
      await secondSave;
      resolveFirst(jsonResponse({ ...settings, moveUnreadConversationsToTop: false }));
      await firstSave;
    });

    expect(findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.checked).toBe(false);
    expect(findControl(renderer.root, "Chuyển sang hội thoại chưa đọc kế tiếp").props.checked).toBe(true);
  });

  it("rolls consecutive failed saves for one setting back to the last confirmed value", async () => {
    const failedPatch = () => new Response(null, { status: 500 });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(failedPatch())
      .mockResolvedValueOnce(failedPatch());
    const { renderer } = await renderLoaded(fetchMock);
    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;

    await act(async () => {
      const control = findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách");
      firstSave = control.props.onChange({ target: { checked: false } });
      secondSave = control.props.onChange({ target: { checked: true } });
      await Promise.all([firstSave, secondSave]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.checked).toBe(true);
  });

  it("rolls a later failed save back to the previous server-confirmed value", async () => {
    const confirmed = { ...settings, moveUnreadConversationsToTop: false };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(jsonResponse(confirmed))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { renderer } = await renderLoaded(fetchMock);
    const control = findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách");

    await act(async () => {
      await control.props.onChange({ target: { checked: false } });
    });
    await act(async () => {
      await findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.onChange({ target: { checked: true } });
    });

    expect(findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.checked).toBe(false);
  });

  it("rolls back a failed optimistic save and exposes an error alert", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { renderer } = await renderLoaded(fetchMock);
    const control = findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách");

    await act(async () => {
      await control.props.onChange({ target: { checked: false } });
    });

    expect(findControl(renderer.root, "Đẩy hội thoại chưa đọc lên đầu danh sách").props.checked).toBe(true);
    expect(textContent(renderer.root.findByProps({ role: "alert" }))).toContain("Không thể lưu cài đặt");
  });

  it.each([
    ["denied", "Quyền thông báo đang bị chặn"],
    ["unavailable", "Trình duyệt không hỗ trợ thông báo"]
  ])("shows the accurate notification warning when permission is %s", async (permissionCase, warning) => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    if (permissionCase === "denied") {
      vi.stubGlobal("Notification", { permission: "default", requestPermission });
    } else {
      vi.stubGlobal("Notification", undefined);
    }
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(jsonResponse({ ...settings, browserNotificationsEnabled: true }));
    const { renderer } = await renderLoaded(fetchMock);

    await act(async () => {
      await findControl(renderer.root, "Thông báo khi có tin nhắn hoặc bình luận mới").props.onChange({ target: { checked: true } });
    });

    expect(textContent(renderer.root)).toContain(warning);
    expect(findControl(renderer.root, "Thông báo khi có tin nhắn hoặc bình luận mới").props.checked).toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(permissionCase === "denied" ? 1 : 0);
  });

  it("updates the notification toggle and starts saving before permission resolves", async () => {
    let resolvePermission!: (permission: NotificationPermission) => void;
    const requestPermission = vi.fn(() => new Promise<NotificationPermission>((resolve) => { resolvePermission = resolve; }));
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(settings))
      .mockResolvedValueOnce(jsonResponse({ ...settings, browserNotificationsEnabled: true }));
    const { renderer } = await renderLoaded(fetchMock);
    let savePromise!: Promise<void>;

    await act(async () => {
      savePromise = findControl(renderer.root, "Thông báo khi có tin nhắn hoặc bình luận mới").props.onChange({ target: { checked: true } });
      await Promise.resolve();
    });

    expect(findControl(renderer.root, "Thông báo khi có tin nhắn hoặc bình luận mới").props.checked).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePermission("granted");
      await savePromise;
    });
  });
});
