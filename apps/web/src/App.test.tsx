import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App navigation", () => {
  it("routes the shared logo to Dashboard and the header conversation link to Inbox", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onLogoClick={() => navigate(\"dashboard\")}");
    expect(source).toContain("onNavigate={(item) => navigate(item === \"Hội thoại\" ? \"inbox\" : \"dashboard\")}");
    expect(source).toContain("window.history.pushState");
    expect(source).toContain("window.addEventListener(\"popstate\"");
    expect(source).toContain("/inbox");
    expect(source).toContain("/dashboard");
  });
});
