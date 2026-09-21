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

    expect(source).toContain('if (provider === "telegram") return <svg className="block shrink-0" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#29B6F6" />');
    expect(source).toContain('if (provider === "zalo") return <svg className="block shrink-0" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6" fill="#0068FF" />');
  });
});
