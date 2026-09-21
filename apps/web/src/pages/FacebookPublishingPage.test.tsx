import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FacebookPublishingPage.tsx", import.meta.url), "utf8");

describe("FacebookPublishingPage", () => {
  it("keeps the Page token password-only and out of browser storage", () => {
    expect(source).toContain('type="password"');
    expect(source).toContain("pageAccessToken");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("supports text and one-image preview with object URL cleanup", () => {
    expect(source).toContain("URL.createObjectURL");
    expect(source).toContain("URL.revokeObjectURL");
    expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(source).toContain("image");
    expect(source).toContain("Xem trước");
  });

  it("renders mutually exclusive publish modes and Vietnam timezone", () => {
    expect(source).toContain('name="publish-mode"');
    expect(source).toContain('value="now"');
    expect(source).toContain('value="draft"');
    expect(source).toContain('value="scheduled"');
    expect(source).toContain("Asia/Ho_Chi_Minh");
  });

  it("maps list status actions to retry and cancel APIs", () => {
    expect(source).toContain("retryFacebookPost");
    expect(source).toContain("cancelFacebookPost");
    expect(source).toContain('status === "failed"');
    expect(source).toContain('status === "scheduled"');
    expect(source).toContain("setInterval");
    expect(source).toContain("lastErrorCode");
    expect(source).not.toContain("<pre>{JSON.stringify");
  });
});
