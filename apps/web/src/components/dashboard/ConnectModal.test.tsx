import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
