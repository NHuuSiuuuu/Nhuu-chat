import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";

import { ResetPasswordPage } from "./ResetPasswordPage.js";

describe("ResetPasswordPage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderPage(search: string, onNavigateLogin = vi.fn(), onResetSuccess = vi.fn()) {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location: { search }, history: { replaceState }, setTimeout: globalThis.setTimeout });
    let renderer!: ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ResetPasswordPage onNavigateLogin={onNavigateLogin} onResetSuccess={onResetSuccess} />); });
    return { renderer, onNavigateLogin, onResetSuccess, replaceState };
  }

  it("does not submit when the confirmation does not match", async () => {
    const { renderer } = renderPage("?token=reset-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const [password, confirmation] = renderer.root.findAllByType("input");
    act(() => password.props.onChange({ target: { value: "new-password-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "different-password" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("Mật khẩu xác nhận không khớp");
  });

  it("submits a valid reset, removes the token from the current history entry, then opens login", async () => {
    vi.useFakeTimers();
    const { renderer, onResetSuccess, replaceState } = renderPage("?token=reset-token", vi.fn());
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    const [password, confirmation] = renderer.root.findAllByType("input");
    act(() => password.props.onChange({ target: { value: "new-password-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "new-password-123" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/reset-password"), expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ token: "reset-token", password: "new-password-123" })
    }));
    expect(replaceState).toHaveBeenCalledWith({}, "", "/reset-password");
    expect(JSON.stringify(renderer.toJSON())).toContain("Mật khẩu đã được cập nhật. Đang chuyển tới trang đăng nhập...");
    expect(onResetSuccess).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(onResetSuccess).toHaveBeenCalledOnce();
  });

  it("shows the same invalid-link message when reset API rejects the token", async () => {
    const { renderer, onNavigateLogin } = renderPage("?token=expired-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const [password, confirmation] = renderer.root.findAllByType("input");
    act(() => password.props.onChange({ target: { value: "new-password-123" } }));
    act(() => confirmation.props.onChange({ target: { value: "new-password-123" } }));

    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));

    expect(JSON.stringify(renderer.toJSON())).toContain("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
    expect(onNavigateLogin).not.toHaveBeenCalled();
  });
});
