import * as React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeneralSettingsContract } from "@nhuu-chat/contracts";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const defaults: GeneralSettingsContract = {
  browserNotificationsEnabled: true, notificationSound: "default", moveUnreadConversationsToTop: true, openNextUnreadConversation: false,
  themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium"
};
function response(body: GeneralSettingsContract): Response { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
function find(root: ReactTestInstance, label: string): ReactTestInstance { return root.find((node) => node.props["aria-label"] === label); }
function text(value: unknown): string { if (typeof value === "string") return value; if (Array.isArray(value)) return value.map(text).join(""); if (value && typeof value === "object" && "children" in value) return text((value as { children: unknown }).children); return ""; }
async function render(fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(defaults))) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AppearanceSettingsPanel apiUrl="https://api.example.test" token="cookie-session" />); await Promise.resolve(); });
  return { renderer, fetchMock };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppearanceSettingsPanel", () => {
  it("shows all appearance controls and a live preview", async () => {
    const { renderer } = await render();
    expect(text(renderer.root)).toContain("Giao diện");
    expect(find(renderer.root, "Chế độ màu: Tối")).toBeTruthy();
    expect(find(renderer.root, "Chế độ màu: Theo thiết bị")).toBeTruthy();
    expect(find(renderer.root, "Màu nhấn: Tím")).toBeTruthy();
    expect(find(renderer.root, "Mật độ giao diện: Gọn")).toBeTruthy();
    expect(find(renderer.root, "Cỡ chữ tin nhắn: Lớn")).toBeTruthy();
    expect(text(renderer.root)).toContain("Tin nhắn xem trước");
  });

  it("renders the conversation preview as static content instead of an inactive button", async () => {
    const { renderer } = await render();
    const previewName = renderer.root.find((node) => node.type === "strong" && text(node.props.children) === "An Nguyễn");

    expect(previewName.parent?.parent?.type).toBe("div");
  });

  it("applies and saves a selection immediately and restores defaults", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(defaults));
    const { renderer } = await render(fetchMock);
    await act(async () => { find(renderer.root, "Chế độ màu: Tối").props.onClick(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.example.test/api/v1/me/general-settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ themeMode: "dark" }) }));

    await act(async () => { find(renderer.root, "Khôi phục mặc định").props.onClick(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.example.test/api/v1/me/general-settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ themeMode: "light", accentColor: "blue", interfaceDensity: "comfortable", messageFontSize: "medium" }) }));
  });

  it("reverts an optimistic selection and reports an API failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(defaults)).mockRejectedValueOnce(new Error("offline"));
    const { renderer } = await render(fetchMock);
    await act(async () => { find(renderer.root, "Chế độ màu: Tối").props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(find(renderer.root, "Chế độ màu: Tối").props["aria-pressed"]).toBe(false);
    expect(text(renderer.root)).toContain("Không thể lưu cài đặt giao diện");
  });
});
