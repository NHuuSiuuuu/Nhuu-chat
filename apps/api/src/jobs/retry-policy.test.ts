import { describe, expect, it } from "vitest";
import { retryDelay } from "./retry-policy.js";
describe("retry policy", () => {
  it("uses immediate, one-second, four-second retries then stops", () => {
    expect([retryDelay(0), retryDelay(1), retryDelay(2), retryDelay(3)]).toEqual([0, 1000, 4000, null]);
  });
});
