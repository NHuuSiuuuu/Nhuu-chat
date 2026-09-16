import { describe, expect, it } from "vitest";

import { zaloPersonalStatus, zaloPersonalStatusSchema } from "./zalo-personal.schemas.js";

describe("Zalo personal status schema", () => {
  it("rejects a status payload containing credentials", () => {
    expect(() => zaloPersonalStatusSchema.parse({ status: "connected", cookie: "secret" })).toThrow();
  });

  it("accepts the public status values", () => {
    expect(zaloPersonalStatus).toEqual(["disconnected", "waiting_qr", "connected", "expired", "error"]);
  });
});
