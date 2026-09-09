import * as React from "react";
import { describe, expect, it } from "vitest";
import { DashboardTopbar } from "./DashboardTopbar.js";

function collectText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return "";
  return collectText(node.props.children);
}

describe("DashboardTopbar", () => {
  it("keeps the shared brand, navigation, and owner identity", () => {
    const element = DashboardTopbar();

    expect(element.props.className).toContain("bg-[#4e5d9a]");
    expect(element.props.className).toContain("min-h-16");
    expect(element.props.className).not.toContain("-mx-");
    expect(element.props.className).not.toContain("mb-");
    expect(collectText(element)).toContain("NhuuChat");
    expect(collectText(element)).toContain("nhuusiuu");
    expect(collectText(element)).toContain("OWNER");
    expect(collectText(element)).toContain("Hội thoại");
  });
});
