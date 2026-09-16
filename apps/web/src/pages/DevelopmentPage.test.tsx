import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { developmentPathForSection, developmentSectionFromPath } from "./DevelopmentPage.js";

describe("DevelopmentPage", () => {
  it("maps unfinished header tabs to stable routes", () => {
    expect(developmentPathForSection("Đơn hàng")).toBe("/orders");
    expect(developmentPathForSection("Bài viết")).toBe("/posts");
    expect(developmentPathForSection("Thống kê")).toBe("/analytics");
    expect(developmentSectionFromPath("/orders")).toBe("Đơn hàng");
    expect(developmentSectionFromPath("/posts")).toBe("Bài viết");
    expect(developmentSectionFromPath("/analytics")).toBe("Thống kê");
  });

  it("shows the development message for the selected header tab", () => {
    expect(developmentSectionFromPath("/unknown")).toBe("Đơn hàng");
  });

  it("imports React for the configured JSX runtime", () => {
    const source = readFileSync(new URL("./DevelopmentPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import * as React from "react";');
  });
});
