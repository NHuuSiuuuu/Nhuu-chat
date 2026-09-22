import { describe, expect, it } from "vitest";

import { settingHistoryListQuerySchema } from "./setting-history.schemas.js";

describe("setting history schemas", () => {
  it("defaults to the first page with 20 items", () => {
    expect(settingHistoryListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20
    });
  });

  it("parses pagination and clamps page size at 50", () => {
    expect(settingHistoryListQuerySchema.parse({
      page: "2",
      pageSize: "100",
      actionType: "CONNECT_FACEBOOK_PAGE"
    })).toEqual({
      page: 2,
      pageSize: 50,
      actionType: "CONNECT_FACEBOOK_PAGE"
    });
  });

  it("rejects unsupported action types", () => {
    expect(settingHistoryListQuerySchema.safeParse({
      actionType: "DELETE_COMMENT"
    }).success).toBe(false);
  });
});
