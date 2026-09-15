import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DashboardTopbar.tsx", import.meta.url), "utf8");

describe("DashboardTopbar fixed layout", () => {
  it("stays fixed above page content", () => {
    expect(source).toContain("fixed top-0");
    expect(source).toContain("z-50");
  });
});
