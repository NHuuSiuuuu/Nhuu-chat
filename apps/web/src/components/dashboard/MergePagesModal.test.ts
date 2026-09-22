import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { filterMergePages, selectAllMergePages, type MergePageOption } from "./MergePagesModal.js";

const pages: MergePageOption[] = [
  { id: "telegram_personal", name: "Telegram cá nhân", platform: "telegram" },
  { id: "zalo_personal", name: "Nguyễn Ngọc Hữu", platform: "zalo" },
  { id: "facebook:page-42", name: "Nhuu Page", platform: "facebook" }
];

describe("MergePagesModal helpers", () => {
  it("filters pages by name, username, and platform", () => {
    expect(filterMergePages(pages, "ngọc")).toEqual([pages[1]]);
    expect(filterMergePages(pages, "telegram")).toEqual([pages[0]]);
    expect(filterMergePages(pages, "facebook")).toEqual([pages[2]]);
    expect(filterMergePages(pages, "nhuu page")).toEqual([pages[2]]);
    expect(filterMergePages(pages, "missing")).toEqual([]);
  });

  it("keeps Facebook Page options selectable with a Facebook label", () => {
    const source = readFileSync(new URL("./MergePagesModal.tsx", import.meta.url), "utf8");

    expect(filterMergePages(pages, "facebook")).toEqual([pages[2]]);
    expect(pages[2].platform).toBe("facebook");
    expect(source).toContain('page.platform === "facebook" ? "Facebook"');
  });

  it("selects all visible pages without changing hidden selections", () => {
    expect(selectAllMergePages(pages, "ngọc", new Set(["telegram_personal"]))).toEqual(new Set(["telegram_personal", "zalo_personal"]));
  });
});
