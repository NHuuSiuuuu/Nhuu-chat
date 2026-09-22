import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SettingHistoryTimelineView,
  fetchSettingHistories,
  type SettingHistoryListResponse,
  type SettingHistoryResponse,
  SettingHistoryTimeline
} from "./SettingHistoryTimeline.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "children" in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return "";
}

function renderView(overrides: Partial<React.ComponentProps<typeof SettingHistoryTimelineView>> = {}) {
  return renderToStaticMarkup(<SettingHistoryTimelineView
    error={null}
    isLoading={false}
    items={[historyItem]}
    onPageChange={() => undefined}
    pagination={pagination}
    {...overrides}
  />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingHistoryTimeline", () => {
  it("mounts, loads page one and advances pagination without applying a client filter", async () => {
    const response = (page: number): SettingHistoryListResponse => ({
      items: [{ ...historyItem, id: `history-${page}` }],
      pagination: { page, pageSize: 20, total: 21, totalPages: 2, hasNextPage: page === 1 }
    });
    const firstRequest = deferred<Response>();
    const secondRequest = deferred<Response>();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SettingHistoryTimeline apiUrl="https://api.example.test" refresh={async () => null} token="session-token" />);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.example.test/api/v1/setting-histories?page=1&pageSize=20", expect.objectContaining({ credentials: "include" }));

    await act(async () => {
      firstRequest.resolve(new Response(JSON.stringify(response(1)), { status: 200 }));
      await firstRequest.promise;
    });
    expect(textContent(renderer!.root)).toContain("Nguyễn An");

    await act(async () => {
      const nextButton = renderer!.root.findByProps({ "aria-label": "Trang sau" });
      nextButton.props.onClick();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.example.test/api/v1/setting-histories?page=2&pageSize=20", expect.objectContaining({ credentials: "include" }));

    await act(async () => {
      secondRequest.resolve(new Response(JSON.stringify(response(2)), { status: 200 }));
      await secondRequest.promise;
    });

    expect(textContent(renderer!.root)).toContain("Trang 2 / 2");
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("mounts an API rejection into the visible error state", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SettingHistoryTimeline apiUrl="https://api.example.test" refresh={async () => null} token="session-token" />);
      await Promise.resolve();
    });

    expect(textContent(renderer!.root.findByProps({ role: "alert" }))).toContain("Không thể tải lịch sử hoạt động");
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("requests the authenticated history API with pagination and no filter", async () => {
    const response = { items: [historyItem], pagination };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(fetchSettingHistories({
      apiUrl: "https://api.example.test",
      page: 2,
      refresh: async () => null,
      token: "legacy-token"
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/setting-histories?page=2&pageSize=20",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("renders one shared Vietnamese timeline with actor, time, hashes and old-to-new values", () => {
    const html = renderView();

    expect(html).toContain("Lịch sử hoạt động");
    expect(html).not.toContain("Lọc lịch sử hoạt động");
    expect(html).not.toContain("Kết nối Facebook</button>");
    expect(html).toContain("Nguyễn An");
    expect(html).toContain("14:05 • 22/09/2026");
    expect(html).toContain("Cập nhật cài đặt AI");
    expect(html).toContain("Phiên bản");
    expect(html).toContain("abc123ef");
    expect(html).not.toContain("Hiện tại");
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

  it("renders a connect event without claiming it is the current connection", () => {
    const html = renderView({
      items: [{
        ...historyItem,
        actionType: "CONNECT_FACEBOOK_PAGE",
        actionTitle: "Kết nối Facebook Page",
        changes: [{ fieldName: "status", oldValue: "(không có)", newValue: "connected" }]
      }]
    });

    expect(html).toContain("connected");
    expect(html).toContain("Kết nối Facebook Page");
    expect(html).not.toContain("Hiện tại");
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
