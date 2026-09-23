import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FacebookPublishingApiError } from "../../lib/facebook-publishing.api.js";
import * as connectModal from "./ConnectModal.js";

function facebookFlowSurface(flow: connectModal.FacebookOAuthFlow): string {
  const Content = connectModal.FacebookConnectContent;
  return renderToStaticMarkup(<Content flow={flow} loading={false} onManual={() => undefined} onSelectPage={() => undefined} onStart={() => undefined} onSelect={() => undefined} />);
}

type FacebookManualContentComponent = React.ComponentType<{
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onPageAccessTokenChange: (value: string) => void;
  onPageIdChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  pageAccessToken: string;
  pageId: string;
}>;

function facebookManualSurface(overrides: Partial<React.ComponentProps<FacebookManualContentComponent>> = {}): string {
  const candidate: unknown = (connectModal as unknown as Record<string, unknown>).FacebookManualConnectContent;
  expect(candidate).toBeTypeOf("function");
  const Content = candidate as FacebookManualContentComponent;
  return renderToStaticMarkup(<Content error={null} loading={false} onBack={() => undefined} onPageAccessTokenChange={() => undefined} onPageIdChange={() => undefined} onSubmit={() => undefined} pageAccessToken="" pageId="" {...overrides} />);
}

type SubmitFacebookManualConnection = (
  input: { pageId: string; pageAccessToken: string },
  onConnected: () => void
) => Promise<string | null>;

function submitFacebookManualConnection(): SubmitFacebookManualConnection {
  const candidate: unknown = (connectModal as unknown as Record<string, unknown>).submitFacebookManualConnection;
  expect(candidate).toBeTypeOf("function");
  return candidate as SubmitFacebookManualConnection;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("keeps Facebook OAuth available with a branded icon and a manual alternative", () => {
    const html = facebookFlowSurface({ status: "login" });

    expect(html).toContain("Đăng nhập bằng tài khoản Facebook");
    expect(html).toContain("Đăng nhập bằng Facebook");
    expect(html).toContain("Kết nối bằng Page ID + Access Token");
    expect(html).toContain("<svg");
    expect(html).toContain("#1877F2");
    expect(html).not.toContain(">f</span>");
  });

  it("renders accessible manual Page credentials with loading, error, and OAuth recovery states", () => {
    const form = facebookManualSurface({ error: "Token Facebook Page không hợp lệ hoặc đã hết hạn." });
    const loading = facebookManualSurface({ loading: true });

    expect(form).toContain('for="facebook-page-id"');
    expect(form).toContain('id="facebook-page-id"');
    expect(form).toContain('for="facebook-page-access-token"');
    expect(form).toContain('id="facebook-page-access-token"');
    expect(form).toContain('type="password"');
    expect(form).toContain('autoComplete="off"');
    expect(form).toContain('role="alert"');
    expect(form).toContain("Token Facebook Page không hợp lệ hoặc đã hết hạn.");
    expect(form).toContain("Quay lại đăng nhập Facebook");
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Đang kết nối Facebook Page...");
    expect(loading).toContain("disabled");
  });

  it("submits manual Page credentials through the existing API and notifies on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "connection-1",
      pageId: "page-1",
      pageName: "Page One",
      status: "connected"
    }), { status: 201 }));
    const onConnected = vi.fn();

    await expect(submitFacebookManualConnection()({ pageId: "page-1", pageAccessToken: "secret-token" }, onConnected)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/facebook-page/connection"), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ pageId: "page-1", pageAccessToken: "secret-token" })
    }));
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("surfaces the safe API error and does not notify when manual connection fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "FACEBOOK_PAGE_TOKEN_INVALID", message: "unsafe provider detail" }
    }), { status: 422 }));
    const onConnected = vi.fn();

    await expect(submitFacebookManualConnection()({ pageId: "page-1", pageAccessToken: "expired-token" }, onConnected)).resolves.toBe("Token Facebook Page không hợp lệ hoặc đã hết hạn.");
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("replaces the Page picker with an explicit success state after selection", () => {
    const selecting: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "selection-token",
      pages: [{ id: "page-1", name: "Page One", canMessage: true, canPublish: true }],
      selectedPageId: "page-1",
      error: null
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
      pages: [{ id: "page-1", name: "Stale Page", canMessage: true, canPublish: true }],
      selectedPageId: "page-1",
      error: null
    };

    const restart = connectModal.facebookOAuthFlowReducer(selecting, { type: "restart", error: "Phiên chọn Page đã hết hạn." });
    const html = facebookFlowSurface(restart);

    expect(restart).toEqual({ status: "restart", error: "Phiên chọn Page đã hết hạn." });
    expect(html).toContain("Phiên chọn Page đã hết hạn.");
    expect(html).toContain("Đăng nhập lại bằng Facebook");
    expect(html).not.toContain("Stale Page");
    expect(html).not.toContain("Chọn Facebook Page");
  });

  it("keeps the selected Page and picker visible after a retryable selection failure", () => {
    const selecting: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "selection-token",
      pages: [{ id: "page-1", name: "Page One", canMessage: true, canPublish: true }],
      selectedPageId: "page-1",
      error: null
    };

    const retryable = connectModal.facebookOAuthFlowReducer(selecting, {
      type: "selection-error",
      error: "Không thể kết nối Facebook Page"
    });
    const html = facebookFlowSurface(retryable);

    expect(retryable).toEqual({ ...selecting, error: "Không thể kết nối Facebook Page" });
    expect(html).toContain("Chọn Facebook Page");
    expect(html).toContain("Page One");
    expect(html).toContain("Không thể kết nối Facebook Page");
    expect(html).toContain("Kết nối Page này");
  });

  it("clears a selecting error when retrying or choosing another Page", () => {
    const failed: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "selection-token",
      pages: [
        { id: "page-1", name: "Page One", canMessage: true, canPublish: true },
        { id: "page-2", name: "Page Two", canMessage: true, canPublish: true }
      ],
      selectedPageId: "page-1",
      error: "Facebook tạm thời không phản hồi."
    };

    expect(connectModal.facebookOAuthFlowReducer(failed, { type: "selection-error", error: null })).toEqual({ ...failed, error: null });
    expect(connectModal.facebookOAuthFlowReducer(failed, { type: "select-page", pageId: "page-2" })).toEqual({
      ...failed,
      selectedPageId: "page-2",
      error: null
    });
  });

  it("restarts only when the OAuth Page selection has expired", () => {
    expect(connectModal.facebookOAuthSelectionFailure(new FacebookPublishingApiError(
      "FACEBOOK_OAUTH_SELECTION_INVALID",
      "Danh sách Page đã hết hạn. Hãy đăng nhập Facebook lại.",
      400
    ))).toEqual({ restart: true, error: "Danh sách Page đã hết hạn. Hãy đăng nhập Facebook lại." });

    expect(connectModal.facebookOAuthSelectionFailure(new FacebookPublishingApiError(
      "FACEBOOK_OAUTH_PAGE_NOT_PUBLISHABLE",
      "Tài khoản Facebook không có quyền đăng bài trên Page này.",
      400
    ))).toEqual({ restart: false, error: "Tài khoản Facebook không có quyền đăng bài trên Page này." });
    expect(connectModal.facebookOAuthSelectionFailure(new TypeError("Failed to fetch"))).toEqual({
      restart: false,
      error: "Không thể kết nối Facebook Page"
    });
  });

  it("explains when OAuth returns no messaging-capable Pages and offers login recovery", () => {
    const noPublishablePages: connectModal.FacebookOAuthFlow = {
      status: "selecting",
      selection: "selection-token",
      pages: [{ id: "page-1", name: "Read-only Page", canMessage: false, canPublish: false }],
      selectedPageId: "",
      error: null
    };

    const html = facebookFlowSurface(noPublishablePages);

    expect(html).toContain("Không tìm thấy Facebook Page có quyền nhắn tin");
    expect(html).toContain("Đăng nhập lại bằng Facebook");
    expect(html).not.toContain("Kết nối Page này");
  });

  it("selects messaging-capable Pages independently from publishing capability", () => {
    const html = facebookFlowSurface({ status: "selecting", selection: "selection", selectedPageId: "messenger-only", error: null, pages: [
      { id: "messenger-only", name: "Messenger only", canMessage: true, canPublish: false },
      { id: "publish-only", name: "Publish only", canMessage: false, canPublish: true }
    ] });
    expect(html).toMatch(/<input type="radio" name="facebook-page" checked="" value="messenger-only"/);
    expect(html).toContain("Có quyền nhắn tin");
    expect(html).toContain("Có quyền đăng bài");
    expect(html).toMatch(/<input type="radio" disabled="" name="facebook-page" value="publish-only"/);
  });

  it("shows a Messenger-specific safe localized error when no Page can message", () => {
    const html = facebookFlowSurface({ status: "selecting", selection: "selection", selectedPageId: "", error: null, pages: [{ id: "publish-only", name: "Publish only", canMessage: false, canPublish: true }] });
    expect(html).toContain("Không tìm thấy Facebook Page có quyền nhắn tin");
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
