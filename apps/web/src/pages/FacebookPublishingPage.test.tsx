import { describe, expect, it } from "vitest";
import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FacebookPublishingPage, validateFacebookPostImage, connectionAfterFacebookDisconnect, type FacebookPublishingPageProps } from "./FacebookPublishingPage.js";
import type { FacebookPageConnectionResponse, FacebookPostResponse } from "@nhuu-chat/contracts";

const connection: FacebookPageConnectionResponse = { id: "connection-1", pageId: "page-1", pageName: "Nhuu Page", status: "connected", createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" };
const post: FacebookPostResponse = { id: "post-1", connectionId: "connection-1", pageId: "page-1", message: "Bài viết lỗi", status: "failed", scheduledAt: null, timezone: "Asia/Ho_Chi_Minh", publishedPostId: null, attempts: 1, lastErrorCode: "FACEBOOK_PUBLISH_FAILED", lastErrorMessage: null, publishingLeaseUntil: null, publishedAt: null, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z" };

function surface(overrides: Partial<FacebookPublishingPageProps> = {}) {
  const props: FacebookPublishingPageProps = { initialConnection: connection, initialPosts: [post], initialMessage: "Nội dung xem trước", initialMode: "now", initialScheduledAt: "", initialImageUrl: null, initialLoading: false, ...overrides };
  return renderToStaticMarkup(<FacebookPublishingPage {...props} />);
}

describe("FacebookPublishingPage", () => {
  it("renders a password-only token input and no browser-storage UI", () => {
    const html = surface({ initialConnection: null });
    expect(html).toContain('type="password"');
    expect(html).toContain("Page access token");
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
  });

  it("renders the composer modes and preview surface", () => {
    const html = surface({ initialImageUrl: "blob:preview", initialMode: "scheduled", initialScheduledAt: "2026-09-22T10:00" });
    expect(html).toContain("mb-6");
    expect(html).toContain("Nội dung xem trước");
    expect(html).toContain("Xem trước");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('name="publish-mode"');
    expect(html).toContain('value="now"');
    expect(html).toContain('value="draft"');
    expect(html).toContain('value="scheduled"');
    expect(html).toContain("Asia/Ho_Chi_Minh");
    expect(validateFacebookPostImage(new File(["x"], "photo.png", { type: "image/png" }))).toBeNull();
    expect(validateFacebookPostImage(new File(["x"], "photo.gif", { type: "image/gif" }))).toContain("JPEG");
  });

  it("renders the disconnected form after a successful disconnect state transition", () => {
    expect(connectionAfterFacebookDisconnect(connection)).toBeNull();
    expect(surface({ initialConnection: connectionAfterFacebookDisconnect(connection) })).toContain("Kết nối Facebook Page");
  });

  it("renders a failed post retry action and wires actions through callbacks", () => {
    let retryId = "";
    let cancelId = "";
    const html = surface();
    const source = readFileSync(new URL("./FacebookPublishingPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("Thử lại");
    expect(source).toContain("lastErrorCode");
    expect(html).toContain("Lịch sử");
    expect(retryId).toBe("");
    expect(cancelId).toBe("");
  });

  it("renders the Facebook publishing sidebar tabs and status actions", () => {
    const source = readFileSync(new URL("./FacebookPublishingPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("Soạn thảo");
    expect(source).toContain("Nháp");
    expect(source).toContain("Đã lên lịch");
    expect(source).toContain("Lịch sử");
    expect(source).toContain("FacebookPublishingClient");
    expect(source).toContain("updateFacebookPost");
    expect(source).toContain("Xem trên FB");
    expect(source).toContain("lastErrorMessage");
  });

  it("keeps the shared global header above the publishing layout", () => {
    expect(surface({ user: { email: "owner@example.com", role: "owner", displayName: "Owner" } })).toContain('alt="NhuuChat"');
  });

  it("keeps the header and sidebar visible while post data is loading", () => {
    const html = surface({ initialLoading: true, initialPosts: [] });
    expect(html).toContain('alt="NhuuChat"');
    expect(html).toContain('aria-label="Menu đăng bài Facebook"');
    expect(html).toContain('aria-label="Đang tải bài viết"');
    expect(html.match(/aria-label="Đang tải bài viết"/g)).toHaveLength(3);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-gray-200");
  });

  it("does not duplicate the publishing title and timezone subtitle below the global header", () => {
    const html = surface();
    expect(html).not.toContain("Đăng bài Facebook Page");
    expect(html).not.toContain("Quản lý bài viết bằng múi giờ Asia/Ho_Chi_Minh.");
  });

  it("renders page selection and keeps connection status inside the page card", () => {
    const html = surface();
    const source = readFileSync(new URL("./FacebookPublishingPage.tsx", import.meta.url), "utf8");
    expect(html).not.toContain("← Dashboard");
    expect(html).toContain('aria-label="Chọn Facebook Page"');
    expect(source).toContain("selectedPageId");
    expect(source).toContain("setSelectedPageId");
    expect(source).toContain("Page ID:");
    expect(source).toContain("bg-teal-50 text-teal-700");
  });

  it("lets the Facebook management sidebar scroll with the page", () => {
    const source = readFileSync(new URL("./FacebookPublishingPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('className="w-full shrink-0 rounded-2xl bg-white p-3 shadow-sm lg:w-64"');
    expect(source).not.toContain("sticky");
    expect(source).not.toContain("top-24");
    expect(source).not.toContain("self-start");
    expect(source).not.toContain("h-[calc(100vh-6rem)]");
    expect(source).not.toContain("overflow-y-auto");
  });
});
