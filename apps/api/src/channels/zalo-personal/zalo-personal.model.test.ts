import { describe, expect, it } from "vitest";

import { ZaloPersonalSessionModel } from "./zalo-personal.model.js";

describe("Zalo personal session model", () => {
  it("hides encrypted credentials from the default session projection", () => {
    expect(ZaloPersonalSessionModel.schema.path("encryptedCredentials").options.select).toBe(false);
    expect(ZaloPersonalSessionModel.schema.path("ownerId").options.unique).toBe(true);
  });
});
