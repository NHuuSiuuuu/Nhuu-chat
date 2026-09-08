import { afterEach, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase } from "./mongoose.js";

describe("mongoose database lifecycle", () => {
  afterEach(async () => {
    await disconnectDatabase();
  });

  it("rejects a malformed MongoDB URI before opening a connection", async () => {
    await expect(connectDatabase("not-a-mongodb-uri")).rejects.toThrow();
  });

  it("allows shutdown when no connection was opened", async () => {
    await expect(disconnectDatabase()).resolves.toBeUndefined();
  });
});
