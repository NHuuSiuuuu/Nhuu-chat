import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { toast } from "sonner";
import { AuthPage } from "./AuthPage.js";
import { AuthRoutePage } from "./AuthRoutePage.js";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("AuthPage presentation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  function renderAuth(initialMode: "login" | "register" = "login", onNavigateAuth = vi.fn()) {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthPage initialMode={initialMode} onAuthenticated={vi.fn()} onNavigateAuth={onNavigateAuth} />);
    });
    return renderer;
  }

  it("provides the login design and opens the forgot-password presentation without sending a request", () => {
    const onNavigateAuth = vi.fn();
    const renderer = renderAuth("login", onNavigateAuth);
    expect(JSON.stringify(renderer.toJSON())).toContain("Chào mừng quay lại");

    const forgotLink = renderer.root.findAllByType("a").find(link => link.children.join("").includes("Quên mật khẩu?"));
    expect(forgotLink?.props.href).toBe("/forgot-password");
    act(() => forgotLink?.props.onClick({ preventDefault: vi.fn() }));
    expect(onNavigateAuth).toHaveBeenCalledWith("forgot-password");
    const registerTab = renderer.root.findAllByType("a").find(link => link.props.href === "/register");
    act(() => registerTab?.props.onClick({ preventDefault: vi.fn() }));
    expect(onNavigateAuth).toHaveBeenCalledWith("register");
  });

  it("shows the brand logo in the routed authentication header", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthRoutePage route="login" onNavigateAuth={vi.fn()} onAuthenticated={vi.fn()} />);
    });

    expect(renderer.root.findAllByProps({ src: "/nhuu-logo-landing.svg" })).toHaveLength(2);
  });

  it("submits a forgot-password request and shows a generic confirmation", async () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthPage initialView="forgot-password" onAuthenticated={vi.fn()} />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Quên mật khẩu?");
    expect(JSON.stringify(renderer.toJSON())).toContain("Nếu email đã đăng ký, bạn sẽ nhận liên kết đặt lại mật khẩu");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ message: "If an account exists for this email, you will receive a password reset link." }) });
    vi.stubGlobal("fetch", fetchMock);
    act(() => renderer.root.findByType("input").props.onChange({ target: { value: "member@example.com" } }));
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/forgot-password"), expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email: "member@example.com" })
    }));
    expect(JSON.stringify(renderer.toJSON())).toContain("Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.");
  });

  it("keeps registration field validation and the existing authentication API contract", async () => {
    const onAuthenticated = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuthPage initialMode="register" onAuthenticated={onAuthenticated} />);
    });
    const inputs = renderer.root.findAllByType("input");
    expect(inputs.map(input => [input.props.name, input.props.type, input.props.minLength])).toEqual([
      ["auth-name", "text", undefined],
      ["auth-email", "email", undefined],
      ["auth-password", "password", 8],
      ["auth-password-confirm", "password", 8]
    ]);
    expect(renderer.root.findAllByType("a").some(link => link.props.href === "/login")).toBe(true);
    expect(renderer.root.findAllByType("a").some(link => link.props.href === "/register")).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: "user-1", email: "test@example.com", role: "admin" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const [name, email, password, confirmation] = renderer.root.findAllByType("input");
    act(() => name.props.onChange({ target: { value: "Test User" } }));
    act(() => email.props.onChange({ target: { value: "test@example.com" } }));
    act(() => password.props.onChange({ target: { value: "secret-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "secret-123" } }));
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/register"), expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "secret-123" })
    }));
    expect(onAuthenticated).toHaveBeenCalledWith({ user: { id: "user-1", email: "test@example.com", role: "admin" } });
  });

  it.each([
    ["login", "", "", "secret-123", "Vui lòng nhập địa chỉ Email!"],
    ["login", "", "member@example.com", "", "Vui lòng nhập Mật khẩu!"],
    ["register", "", "member@example.com", "secret-123", "Vui lòng nhập Họ và tên!"],
    ["login", "", "not-an-email", "secret-123", "Email không đúng định dạng!"],
    ["register", "Test User", "member@example.com", "short", "Mật khẩu phải có ít nhất 8 ký tự!"]
  ] as const)("shows the requested validation toast for invalid %s input", async (mode, name, email, password, message) => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<AuthPage initialMode={mode} onAuthenticated={vi.fn()} />); });
    const inputs = renderer.root.findAllByType("input");
    if (mode === "register") act(() => inputs[0].props.onChange({ target: { value: name } }));
    const emailInput = inputs.find(input => input.props.name === "auth-email");
    const passwordInput = inputs.find(input => input.props.name === "auth-password");
    if (emailInput) act(() => emailInput.props.onChange({ target: { value: email } }));
    if (passwordInput) act(() => passwordInput.props.onChange({ target: { value: password } }));
    const confirmationInput = inputs.find(input => input.props.name === "auth-password-confirm");
    if (confirmationInput) act(() => confirmationInput.props.onChange({ target: { value: password } }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(toast.error).toHaveBeenCalledWith(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a Vietnamese toast and inline password error for invalid login credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } })
    });
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<AuthPage onAuthenticated={vi.fn()} />); });
    const [email, password] = renderer.root.findAllByType("input");
    act(() => email.props.onChange({ target: { value: "member@example.com" } }));
    act(() => password.props.onChange({ target: { value: "secret-123" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(toast.error).toHaveBeenCalledWith("Email hoặc mật khẩu không chính xác!");
    expect(JSON.stringify(renderer.toJSON())).toContain("Email hoặc mật khẩu không chính xác!");
    expect(renderer.root.findByProps({ id: "auth-password-error" }).props.className).toContain("text-red-500 text-sm mt-1");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/login"), expect.any(Object));
  });

  it.each([
    ["DUPLICATE_RESOURCE", "Resource already exists", "Email này đã được đăng ký!"],
    ["SERVER_ERROR", "Internal Server Error", "Không thể đăng ký lúc này. Vui lòng thử lại!"]
  ])("localizes registration API error %s", async (code, backendMessage, expectedMessage) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code, message: backendMessage } }) });
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<AuthPage initialMode="register" onAuthenticated={vi.fn()} />); });
    const [name, email, password, confirmation] = renderer.root.findAllByType("input");
    act(() => name.props.onChange({ target: { value: "Test User" } }));
    act(() => email.props.onChange({ target: { value: "member@example.com" } }));
    act(() => password.props.onChange({ target: { value: "secret-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "secret-123" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(toast.error).toHaveBeenCalledWith(expectedMessage);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(backendMessage);
  });

  it("shows login success toast before invoking the redirect callback", async () => {
    const onAuthenticated = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: "user-1", email: "member@example.com", role: "agent" } }) });
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<AuthPage onAuthenticated={onAuthenticated} />); });
    const [email, password] = renderer.root.findAllByType("input");
    act(() => email.props.onChange({ target: { value: "member@example.com" } }));
    act(() => password.props.onChange({ target: { value: "secret-123" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(toast.success).toHaveBeenCalledWith("Đăng nhập thành công!");
    expect(vi.mocked(toast.success).mock.invocationCallOrder[0]).toBeLessThan(onAuthenticated.mock.invocationCallOrder[0]);
  });

  it("rejects mismatched registration passwords before calling the API", async () => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<AuthPage initialMode="register" onAuthenticated={vi.fn()} />); });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const [name, email, password, confirmation] = renderer.root.findAllByType("input");
    act(() => name.props.onChange({ target: { value: "Test User" } }));
    act(() => email.props.onChange({ target: { value: "member@example.com" } }));
    act(() => password.props.onChange({ target: { value: "secret-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "different-123" } }));
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("Mật khẩu xác nhận không khớp");
  });
});
