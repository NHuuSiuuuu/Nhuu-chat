import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProfilePage.tsx", import.meta.url), "utf8");

describe("ProfilePage", () => {
  it("renders the Vietnamese personal information and password cards", () => {
    expect(source).toContain("Hồ sơ của tôi");
    expect(source).toContain("Thông tin cá nhân");
    expect(source).toContain("Đổi mật khẩu");
    expect(source).toContain("Tên hiển thị");
    expect(source).toContain("Chưa hỗ trợ đổi email.");
    expect(source).toContain("Đổi xong sẽ đăng xuất khỏi mọi thiết bị khác, chỉ giữ phiên đang dùng.");
  });

  it("loads and updates profile data through the profile API", () => {
    expect(source).toContain("fetchCurrentUser");
    expect(source).toContain("/api/v1/me");
    expect(source).toContain("Lưu thay đổi");
    expect(source).toContain("Đổi mật khẩu");
    expect(source).toContain("newPassword !== confirmPassword");
  });

  it("provides an avatar change affordance and accessible form controls", () => {
    expect(source).toContain("Đổi ảnh đại diện");
    expect(source).toContain("aria-label=\"Đổi ảnh đại diện\"");
    expect(source).toContain('name="camera"');
    expect(source).toContain("disabled");
    expect(source).toContain("type=\"password\"");
  });

  it("normalizes an API response that uses name instead of displayName", () => {
    expect(source).toContain("normalizeCurrentUser");
    expect(source).toContain("currentUser.name");
  });

  it("imports React for the configured JSX runtime", () => {
    expect(source).toContain('import * as React from "react";');
  });
});
