import { describe, expect, it } from "vitest";

import { brandLogoProviderIds, connectionProviders, dashboardNavItems, initialConnectionProvider, platformIconBoxSize } from "./dashboard-ui.js";
import { connectModalCloseDurationMs } from "./modal-ui.js";

describe("dashboard connection UI", () => {
  it("starts the connection modal on Facebook", () => {
    expect(initialConnectionProvider).toBe("facebook");
  });

  it("shows the approved provider options in the dashboard modal", () => {
    expect(connectionProviders.map((provider) => provider.id)).toEqual([
      "pending",
      "facebook",
      "zalo",
      "website",
      "telegram",
      "instagram",
      "threads",
      "tiktok",
      "whatsapp",
      "airbnb",
      "booking"
    ]);
  });

  it("defines the top navigation shown in the Hchat header", () => {
    expect(dashboardNavItems).toEqual([
      "Hộp thư",
      "Đơn hàng",
      "Bài viết",
      "Thống kê",
      "Cài đặt"
    ]);
  });

  it("provides a brand logo for every connection option", () => {
    expect(brandLogoProviderIds).toEqual(connectionProviders.map((provider) => provider.id));
  });

  it("keeps the modal mounted long enough to finish its closing animation", () => {
    expect(connectModalCloseDurationMs).toBe(300);
  });

  it("uses a fixed square box for every platform logo", () => {
    expect(platformIconBoxSize).toBe(32);
  });
});
