import * as React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { LandingHeader } from "./LandingHeader.js";
import { LandingPage } from "./LandingPage.js";

describe("LandingPage", () => {
  function renderLanding({ onLogout = vi.fn(), ...props }: Omit<React.ComponentProps<typeof LandingPage>, "onLogout"> & { onLogout?: () => void }) {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<LandingPage {...props} onLogout={onLogout} />);
    });
    return renderer;
  }

  it("renders the hero, primary landing sections, and stable navigation anchors", () => {
    const renderer = renderLanding(
      {
        user: null,
        onDashboard: vi.fn(),
        onLogin: vi.fn(),
        onRegister: vi.fn(),
      },
    );

    const source = renderer.root;
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Quản lý tin nhắn đa kênh");
    expect(rendered).toContain("AI Chatbot");
    expect(source.findByProps({ id: "tinh-nang" })).toBeTruthy();
    expect(source.findByProps({ id: "kenh-tich-hop" })).toBeTruthy();
    expect(rendered).toContain("Facebook Messenger");
    expect(rendered).toContain("Chăm sóc khách hàng từ Fanpage");
    expect(rendered).toContain("Zalo OA");
    expect(rendered).toContain("Tương tác với khách hàng trên Zalo");
    expect(rendered).toContain("Zalo Personal");
    expect(rendered).toContain("Quản lý tin nhắn Zalo cá nhân");
    expect(rendered).toContain("Instagram");
    expect(rendered).toContain("Trả lời DM và comment tự động");
    expect(rendered).toContain("WhatsApp");
    expect(rendered).toContain("Kết nối khách hàng quốc tế");
    expect(rendered).toContain("Telegram");
    expect(rendered).toContain("Quản lý group và tin nhắn");
    expect(rendered).toContain("Website Webchat");
    expect(rendered).toContain("Livechat trực tiếp trên website");
    expect(rendered).toContain("Google Business");
    expect(rendered).toContain("Tin nhắn từ Google Maps & Search");
    expect(source.findByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg" })).toBeTruthy();
    expect(source.findAllByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/9/91/Icon_of_Zalo.svg" })).toHaveLength(2);
    expect(source.findByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg" })).toBeTruthy();
    expect(source.findByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" })).toBeTruthy();
    expect(source.findByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" })).toBeTruthy();
    expect(source.findByProps({ src: "https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" })).toBeTruthy();
    expect(source.findAllByProps({ alt: "Website Webchat" })).toHaveLength(1);
    expect(source.findByProps({ id: "bang-gia" })).toBeTruthy();
    expect(source.findByProps({ id: "faq" })).toBeTruthy();
    expect(rendered).toContain("Câu hỏi thường gặp");
    expect(rendered).toContain("Hộp thư");
    expect(rendered).toContain("Bắt đầu dùng thử");
    expect(rendered).toContain("AI Auto-Reply Active • Khách VIP 100%");
    expect(rendered).toContain("Tăng 300% hiệu suất");
    expect(rendered).toContain("Tự động chốt đơn Zalo & FB");
    expect(source.findByProps({ "data-testid": "landing-badge-ai" }).props.animate).toEqual({ y: [-8, 8, -8] });
    expect(source.findByProps({ "data-testid": "landing-badge-ai" }).props.className).toContain("-top-5");
    expect(source.findByProps({ "data-testid": "landing-badge-performance" }).props.transition.delay).toBe(1);
    expect(source.findByProps({ "data-testid": "landing-badge-performance" }).props.className).toContain("-bottom-5");
    expect(source.findAllByProps({ src: "/nhuu-logo-landing.svg" })).toHaveLength(2);
    expect(source.findByProps({ src: "/nhuu-logo.svg" })).toBeTruthy();
  });

  it("uses the blue transparent logo variant for the landing brand", () => {
    const logo = readFileSync(new URL("../../../public/nhuu-logo-landing.svg", import.meta.url), "utf8");

    expect(logo).toContain('fill="#1264e8"');
    expect(logo).toContain('stroke="#1264e8"');
    expect(logo).toContain("M60 43c-20 0-36 15-36 34");
    expect(logo).toContain("M53 82c5 5 11 5 16 0");
    expect(logo).toContain('x="108"');
    expect(logo).toContain('<circle cx="61" cy="76" r="21" fill="#fff"/>');
    expect(logo).not.toContain('stroke="#fff"');
    expect(logo).not.toContain("<rect");
  });

  it("keeps landing typography below the heaviest font weights", () => {
    const source = readFileSync(new URL("./LandingPage.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("font-black");
    expect(source).not.toContain("font-extrabold");
    expect(source).not.toContain("font-bold");
  });

  it("uses the expanded desktop scale while keeping responsive base sizes", () => {
    const source = readFileSync(new URL("./LandingPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("text-5xl font-semibold leading-[1.08]");
    expect(source).toContain("md:text-7xl");
    expect(source).toContain("text-4xl font-semibold tracking-tight md:text-5xl");
    expect(source).toContain("h-16 w-16");
    expect(source).toContain("text-xl font-semibold text-slate-800");
    expect(source).toContain("text-lg font-normal leading-8");
    expect(source).toContain("max-w-6xl");
    expect(source).toContain("gap-8");
  });

  it("calls login and register callbacks from the public header", () => {
    const onLogin = vi.fn();
    const onRegister = vi.fn();
    const renderer = renderLanding({ user: null, onDashboard: vi.fn(), onLogin, onRegister });

    act(() => {
      renderer.root.findByProps({ "aria-label": "Đăng nhập" }).props.onClick();
      renderer.root.findByProps({ "aria-label": "Đăng ký" }).props.onClick();
    });

    expect(onLogin).toHaveBeenCalledOnce();
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it("exposes an accessible dashboard button for an authenticated user", () => {
    const onDashboard = vi.fn();
    const renderer = renderLanding(
      {
        user: { email: "admin@example.com", role: "admin" },
        onDashboard: onDashboard,
        onLogin: vi.fn(),
        onRegister: vi.fn(),
      },
    );

    const userButton = renderer.root.findByProps({ "aria-label": "Mở Dashboard cho admin@example.com" });
    act(() => userButton.props.onClick());

    expect(onDashboard).toHaveBeenCalledOnce();
  });

  it("uses transparent styling for the fixed header at the top of the page", () => {
    const renderer = renderLanding({ user: null, onDashboard: vi.fn(), onLogin: vi.fn(), onRegister: vi.fn() });
    const header = renderer.root.findByType("header");
    const navigation = renderer.root.findByProps({ "aria-label": "Điều hướng chính" });

    expect(header.props.className).toContain("w-full fixed top-0 left-0 z-50 bg-transparent py-5 px-6 md:px-12 flex justify-between items-center");
    expect(header.props.className).toContain("transition-all duration-300 ease-in-out");
    expect(header.props.className).not.toContain("border");
    expect(navigation.props.className).toContain("hidden md:flex gap-8 text-sm font-medium text-slate-600");
    for (const label of ["Sản phẩm", "Tích hợp", "Bảng giá", "Tài nguyên"]) {
      const link = renderer.root.findAllByType("a").find((candidate) => candidate.children.includes(label));
      expect(link?.props.className).toContain("hover:text-slate-900");
    }
  });

  it("uses an opaque compact header after scrolling more than 10 pixels", () => {
    const scrollWindow = new EventTarget();
    Object.defineProperty(scrollWindow, "scrollY", { configurable: true, value: 0 });
    vi.stubGlobal("window", scrollWindow);
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<LandingHeader user={null} landingLinks={[]} mobileMenuOpen={false} onMobileMenuToggle={vi.fn()} onDashboard={vi.fn()} onLogin={vi.fn()} onRegister={vi.fn()} onLogout={vi.fn()} onMobileLinkClick={vi.fn()} />);
    });

    try {
      Object.defineProperty(scrollWindow, "scrollY", { configurable: true, value: 11 });
      act(() => scrollWindow.dispatchEvent(new Event("scroll")));

      const header = renderer.root.findByType("header");
      expect(header.props.className).toContain("w-full fixed top-0 left-0 z-50 bg-white/95 backdrop-blur-md shadow-md py-3 px-6 md:px-12 flex justify-between items-center");
      expect(header.props.className).not.toContain("bg-transparent");
      expect(header.props.className).not.toContain("py-5");
    } finally {
      act(() => renderer.unmount());
      vi.unstubAllGlobals();
    }
  });

  it("lets an authenticated user log out from the landing header", () => {
    const onLogout = vi.fn();
    const renderer = renderLanding({
      user: { email: "admin@example.com", role: "admin" },
      onDashboard: vi.fn(),
      onLogin: vi.fn(),
      onRegister: vi.fn(),
      onLogout,
    });

    const logoutButton = renderer.root.findByProps({ "aria-label": "Đăng xuất" });
    const email = renderer.root.findAllByType("span").find((candidate) => candidate.children.includes("admin@example.com"));

    expect(email?.props.className).not.toContain("hidden");
    expect(logoutButton.props.className).not.toContain("hidden");
    act(() => logoutButton.props.onClick());

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("opens and closes the FAQ answer while updating aria-expanded", () => {
    const renderer = renderLanding({ user: null, onDashboard: vi.fn(), onLogin: vi.fn(), onRegister: vi.fn() });
    const faqButton = renderer.root.findAllByProps({ "aria-expanded": true })[0];
    const answer = "Gói dịch vụ được thiết kế linh hoạt theo số lượng kênh và quy mô đội ngũ của anh.";

    expect(JSON.stringify(renderer.toJSON())).toContain(answer);
    act(() => faqButton.props.onClick());
    expect(faqButton.props["aria-expanded"]).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(answer);
    act(() => faqButton.props.onClick());
    expect(faqButton.props["aria-expanded"]).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain(answer);
  });

  it("provides an accessible mobile navigation toggle for the landing anchors", () => {
    const renderer = renderLanding({ user: null, onDashboard: vi.fn(), onLogin: vi.fn(), onRegister: vi.fn() });
    const menuButton = renderer.root.findByProps({ "aria-label": "Mở menu điều hướng" });

    expect(menuButton.props["aria-expanded"]).toBe(false);
    act(() => menuButton.props.onClick());
    expect(menuButton.props["aria-expanded"]).toBe(true);
    expect(renderer.root.findByProps({ id: "mobile-navigation" })).toBeTruthy();
    act(() => menuButton.props.onClick());
    expect(menuButton.props["aria-expanded"]).toBe(false);
  });
});
