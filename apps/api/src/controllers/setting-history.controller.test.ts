import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  listSettingHistories: vi.fn()
}));

vi.mock("../services/setting-history.service.js", () => serviceMocks);

import { getSettingHistories } from "./setting-history.controller.js";

function responseRecorder() {
  const state: { body?: unknown } = {};
  const response = {
    json(body: unknown) {
      state.body = body;
      return response;
    }
  };
  return { response, state };
}

describe("setting history controller", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists only the authenticated user's filtered and paginated history", async () => {
    const expected = {
      items: [{
        id: "history-1",
        actionType: "CONNECT_FACEBOOK_PAGE",
        actionTitle: "Kết nối Facebook Page",
        changes: [{ fieldName: "pageName", oldValue: "Trang cũ", newValue: "Trang mới" }],
        versionHash: "a1b2c3d4",
        createdAt: "2026-09-22T08:30:00.000Z"
      }],
      pagination: {
        page: 2,
        pageSize: 50,
        total: 51,
        totalPages: 2,
        hasNextPage: false
      }
    };
    serviceMocks.listSettingHistories.mockResolvedValue(expected);
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getSettingHistories({
      auth: { id: "user-1" },
      query: {
        page: "2",
        pageSize: "100",
        actionType: "CONNECT_FACEBOOK_PAGE",
        userId: "user-2"
      }
    } as never, response as never, next);

    expect(serviceMocks.listSettingHistories).toHaveBeenCalledWith({
      userId: "user-1",
      page: 2,
      pageSize: 50,
      actionType: "CONNECT_FACEBOOK_PAGE"
    });
    expect(state.body).toEqual(expected);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unsupported action type with INVALID_REQUEST", async () => {
    const { response, state } = responseRecorder();
    const next = vi.fn();

    await getSettingHistories({
      auth: { id: "user-1" },
      query: { actionType: "DELETE_COMMENT" }
    } as never, response as never, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 400,
      code: "INVALID_REQUEST"
    });
    expect(state.body).toBeUndefined();
    expect(serviceMocks.listSettingHistories).not.toHaveBeenCalled();
  });
});
