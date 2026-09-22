import * as React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { LandingPage } from "./LandingPage.js";

describe("LandingPage", () => {
  function renderLanding(props: React.ComponentProps<typeof LandingPage>) {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<LandingPage {...props} />);
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
    expect(source.findByProps({ id: "bang-gia" })).toBeTruthy();
    expect(source.findByProps({ id: "faq" })).toBeTruthy();
    expect(rendered).toContain("Câu hỏi thường gặp");
    expect(rendered).toContain("Hộp thư");
    expect(rendered).toContain("Bắt đầu dùng thử");
    expect(source.findAllByProps({ src: "/nhuu-logo-landing.svg" })).toHaveLength(2);
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
