import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import * as connectModal from "./ConnectModal.js";

function facebookFlowSurface(flow: connectModal.FacebookOAuthFlow): string {
  const Content = connectModal.FacebookConnectContent;
  return renderToStaticMarkup(<Content flow={flow} loading={false} onSelectPage={() => undefined} onStart={() => undefined} onSelect={() => undefined} />);
}

describe("ConnectModal Tailwind migration", () => {
  it("removes handwritten modal stylesheet imports", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/ConnectModal(V2)?\.css/);
    expect(source).toContain('role="dialog"');
    expect(source).toContain("grid");
  });

  it("renders an explicit failed QR state with its error", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain('qr?.status === "failed"');
    expect(source).toContain("qr.error");
    expect(source).toContain("onClick={onStart}");
    expect(source).toContain('(error ?? qr.error) && <p className="text-xs text-rose-600" role="alert">{error ?? qr.error}</p>');
    expect(source).toContain("max-h-[calc(100vh-2rem)]");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("KeyboardEvent");
    expect(source).not.toContain("autoFocus");
    expect(source).toContain("closeButtonRef");
    expect(source).toContain("error ?? qr.error");
    expect(source).toContain("event.key !== \"Tab\"");
    expect(source).toContain("!dialogRef.current?.contains(document.activeElement)");
    expect(source).toContain("openerRef.current?.focus()");
  });

  it("connects Zalo through the personal QR API and polls its status", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain('"/api/v1/channels/zalo-personal/qr"');
    expect(source).toContain("/api/v1/channels/zalo-personal/qr/${zaloQr.id}");
    expect(source).toContain('if (item.id === "zalo") void startZalo()');
    expect(source).toContain('if (item.id === "telegram") void startTelegram()');
    expect(source).toContain('zaloQr.status !== "waiting_qr"');
    expect(source).toContain("zaloQr?.id, zaloQr?.status");
    expect(source).toContain("qr?.id, qr?.status");
    expect(source).toContain("data:image/png;base64,");
    expect(source).toContain('qr?.status === "connected"');
    expect(source).toContain('qr?.status === "expired"');
    expect(source).toContain('qr?.status === "error"');
    expect(source).toContain("Mã QR đăng nhập Zalo");
  });

  it("supports opening directly on a selected personal connection provider", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain("initialProvider");
    expect(source).toContain("initialProvider === \"telegram\"");
    expect(source).toContain("initialProvider === \"zalo\"");
  });

  it("offers Facebook OAuth and keeps manual Page credentials outside this modal flow", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain("Đăng nhập bằng tài khoản Facebook");
    expect(source).toContain("listFacebookOAuthPages");
    expect(source).toContain("selectFacebookOAuthPage");
    expect(source).toContain("Luồng nhập Page ID và Page Access Token thủ công vẫn được giữ nguyên");
    expect(source).not.toMatch(/Page ID\s*<input/);
    expect(source).not.toMatch(/Page access token\s*<input/);
    expect(source).not.toContain("pageAccessToken");
  });

  it("replaces the Page picker with an explicit success state after selection", () => {
    const selecting: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "selection-token",
      pages: [{ id: "page-1", name: "Page One", canPublish: true }],
      selectedPageId: "page-1"
    };

    const connected = connectModal.facebookOAuthFlowReducer(selecting, { type: "connected" });
    const html = facebookFlowSurface(connected);

    expect(connected).toEqual({ status: "connected" });
    expect(html).toContain("Đã kết nối Facebook Page thành công");
    expect(html).not.toContain("Page One");
    expect(html).not.toContain("Chọn Facebook Page");
  });

  it("runs the selection success transition and notifies the dashboard", () => {
    const dispatch = vi.fn();
    const onConnected = vi.fn();

    connectModal.completeFacebookOAuthSelection(dispatch, onConnected);

    expect(dispatch).toHaveBeenCalledWith({ type: "connected" });
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("turns an OAuth callback error query into the restart action used by the modal", () => {
    expect(connectModal.facebookOAuthCallbackAction("?facebook_oauth=error&code=FACEBOOK_OAUTH_STATE_INVALID")).toEqual({
      type: "restart",
      error: "Không thể đăng nhập Facebook. Hãy thử lại."
    });
  });

  it("clears an expired selection and offers Facebook login again", () => {
    const selecting: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "expired-selection-token",
      pages: [{ id: "page-1", name: "Stale Page", canPublish: true }],
      selectedPageId: "page-1"
    };

    const restart = connectModal.facebookOAuthFlowReducer(selecting, { type: "restart", error: "Phiên chọn Page đã hết hạn." });
    const html = facebookFlowSurface(restart);

    expect(restart).toEqual({ status: "restart", error: "Phiên chọn Page đã hết hạn." });
    expect(html).toContain("Phiên chọn Page đã hết hạn.");
    expect(html).toContain("Đăng nhập lại bằng Facebook");
    expect(html).not.toContain("Stale Page");
    expect(html).not.toContain("Chọn Facebook Page");
  });

  it("uses the refreshed connection menu treatment", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain('provider={item.id} menu size={36}');
    expect(source).toContain("items-center gap-3 rounded-xl");
    expect(source).toContain("hover:bg-gray-100");
    expect(source).toContain("font-semibold text-gray-900");
    expect(source).toContain("bg-yellow-100/80 text-yellow-700 text-[10px] font-medium px-2 py-0.5 rounded-full");
  });

  it("uses square Zalo and Telegram brand tiles in the menu", () => {
    const source = readFileSync(new URL("./PlatformIcon.tsx", import.meta.url), "utf8");
    const menuSource = source.slice(source.indexOf("if (menu)"), source.indexOf("if (plain)"));

    expect(menuSource).toContain('provider === "telegram"');
    expect(menuSource).toContain('fill="#29B6F6"');
    expect(menuSource).toContain('provider === "zalo"');
    expect(menuSource).toContain('stroke="#0068FF"');
    expect(menuSource).toContain('fontSize="5.2"');
    expect(menuSource).toContain(">Zalo</text>");
  });

  it("keeps the connection modal above the app shell with centered animated styling", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).toContain("fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4");
    expect(source).toContain("transition-all duration-300 ease-out");
    expect(source).toContain("scale-95");
    expect(source).toContain("scale-100");
    expect(source).toContain("bg-white rounded-2xl shadow-xl overflow-hidden");
  });

  it("uses a custom animated QR loader without a dashed placeholder", () => {
    const source = readFileSync(new URL("./ConnectModal.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("border-dashed");
    expect(source).toContain("function QrLoadingState");
    expect(source).toContain('<animate attributeName="y"');
    expect(source).toContain('<QrLoadingState platform="Telegram" loading={loading} />');
    expect(source).toContain('<QrLoadingState platform="Zalo" loading={loading} />');
  });
});
