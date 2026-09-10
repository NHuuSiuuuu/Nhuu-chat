import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App navigation", () => {
  it("routes the shared logo to Dashboard and the header conversation link to Inbox", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => setPage(\"dashboard\")}");
    expect(source).toContain("onNavigate={(item) => setPage(item === \"Hội thoại\" ? \"inbox\" : \"dashboard\")}");
  });
});
