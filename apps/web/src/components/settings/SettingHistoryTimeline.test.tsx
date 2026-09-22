import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SettingHistoryTimelineView,
  fetchSettingHistories,
  type SettingHistoryResponse
} from "./SettingHistoryTimeline.js";

const historyItem: SettingHistoryResponse = {
  id: "history-1",
  actorId: "actor-1",
  actorName: "Nguyễn An",
  actionType: "UPDATE_AI_SETTINGS",
  actionTitle: "Cập nhật cài đặt AI",
  changes: [{ fieldName: "modelTier", oldValue: "Thông minh nhất", newValue: "Cân bằng" }],
  versionHash: "abc123ef",
  createdAt: new Date(2026, 8, 22, 14, 5).toISOString()
};

const pagination = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false
};

function renderView(overrides: Partial<React.ComponentProps<typeof SettingHistoryTimelineView>> = {}) {
  return renderToStaticMarkup(<SettingHistoryTimelineView
    actionType=""
    error={null}
    isLoading={false}
    items={[historyItem]}
    onActionTypeChange={() => undefined}
    onPageChange={() => undefined}
    pagination={pagination}
    {...overrides}
  />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingHistoryTimeline", () => {
  it("requests the authenticated history API with the selected filter and pagination", async () => {
    const response = { items: [historyItem], pagination };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(fetchSettingHistories({
      actionType: "UPDATE_AI_SETTINGS",
      apiUrl: "https://api.example.test",
      page: 2,
      refresh: async () => null,
      token: "legacy-token"
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/setting-histories?page=2&pageSize=20&actionType=UPDATE_AI_SETTINGS",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("renders one shared Vietnamese timeline with filters, actor, time, hashes and old-to-new values", () => {
    const html = renderView();

    expect(html).toContain("Lịch sử hoạt động");
    expect(html).toContain("Tất cả");
    expect(html).toContain("Cài đặt AI");
    expect(html).toContain("Kết nối Facebook");
    expect(html).toContain("Nguyễn An");
    expect(html).toContain("14:05 • 22/09/2026");
    expect(html).toContain("Cập nhật cài đặt AI");
    expect(html).toContain("Phiên bản");
    expect(html).toContain("abc123ef");
    expect(html).toContain("Hiện tại");
    expect(html).toContain("Cũ");
    expect(html).toContain("Thông minh nhất");
    expect(html).toContain("→");
    expect(html).toContain("Mới");
    expect(html).toContain("Cân bằng");
  });

  it("does not render obsolete history categories or secret-like changes", () => {
    const html = renderView({
      items: [{
        ...historyItem,
        changes: [
          ...historyItem.changes,
          { fieldName: "pageAccessToken", oldValue: "old-secret", newValue: "new-secret" }
        ]
      }]
    });

    expect(html).not.toContain("Xóa bình luận");
    expect(html).not.toContain("Chặn khách hàng");
    expect(html).not.toContain("Chế độ xoay vòng");
    expect(html).not.toContain("old-secret");
    expect(html).not.toContain("new-secret");
  });

  it("renders loading, error and empty states", () => {
    expect(renderView({ isLoading: true, items: [] })).toContain("Đang tải lịch sử...");
    expect(renderView({ error: "Không thể tải lịch sử hoạt động", items: [] })).toContain('role="alert"');
    expect(renderView({ error: "Không thể tải lịch sử hoạt động", items: [] })).toContain("Không thể tải lịch sử hoạt động");
    expect(renderView({ items: [] })).toContain("Chưa có hoạt động nào");
  });

  it("renders bounded pagination controls and the 500-record retention note", () => {
    const html = renderView({
      pagination: { page: 2, pageSize: 20, total: 60, totalPages: 3, hasNextPage: true }
    });

    expect(html).toContain("Trang 2 / 3");
    expect(html).toContain('aria-label="Trang trước"');
    expect(html).toContain('aria-label="Trang sau"');
    expect(html).toContain("tối đa 500 bản ghi");
  });

  it("uses a desktop two-column and mobile single-column timeline layout", () => {
    const source = readFileSync(new URL("./SettingHistoryTimeline.tsx", import.meta.url), "utf8");

    expect(source).toContain("grid-cols-1");
    expect(source).toContain("lg:grid-cols-[minmax(0,7fr)_minmax(240px,3fr)]");
    expect(source).toContain("lg:sticky");
    expect(source).toContain("border-l");
  });
});
