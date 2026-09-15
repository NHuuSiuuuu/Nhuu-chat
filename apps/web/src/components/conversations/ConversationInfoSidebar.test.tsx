import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ConversationInfoSidebar", () => {
  it("defines the Vietnamese tabs and information empty states", () => {
    const source = readFileSync(new URL("./ConversationInfoSidebar.tsx", import.meta.url), "utf8");

    expect(source).toContain('useState<SidebarTab>("info")');
    expect(source).toContain("Thông tin");
    expect(source).toContain("Tạo đơn");
    expect(source).toContain("Bạn chưa có ghi chú nào");
    expect(source).toContain("Nhập ghi chú (Enter để gửi)");
    expect(source).toContain("Chưa có lịch sử đơn hàng");
    expect(source).toContain("+ Tạo đơn");
    expect(source).toContain("Chưa có thông tin khách hàng");
    expect(source).toContain("hasConversation");
  });

  it("keeps the desktop panel and mobile drawer responsive", () => {
    const source = readFileSync(new URL("./ConversationInfoSidebar.tsx", import.meta.url), "utf8");

    expect(source).toContain("min-[1000px]:flex");
    expect(source).toContain("min-[1000px]:hidden");
    expect(source).not.toContain("1180px");
    expect(source).toContain("fixed inset-y-0 right-0");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain('aria-label="Đóng thông tin hội thoại"');
  });
});
