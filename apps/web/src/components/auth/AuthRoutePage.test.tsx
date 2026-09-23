import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { AuthRoutePage } from "./AuthRoutePage.js";

describe("AuthRoutePage", () => {
  it("renders the landing header with the standalone auth form", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    const onNavigateAuth = vi.fn();
    act(() => {
      renderer = TestRenderer.create(
        <AuthRoutePage route="register" onNavigateAuth={onNavigateAuth} onAuthenticated={vi.fn()} />
      );
    });

    expect(renderer.root.findByProps({ "aria-label": "NhuuChat - về đầu trang" }).props.href).toBe("/");
    expect(JSON.stringify(renderer.toJSON())).toContain("Tạo tài khoản mới");
    const loginButton = renderer.root.findAllByType("button").find(button => button.props["aria-label"] === "Đăng nhập");
    act(() => loginButton?.props.onClick());
    expect(onNavigateAuth).toHaveBeenCalledWith("login");
  });
});
