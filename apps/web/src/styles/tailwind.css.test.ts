import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("appearance theme tokens", () => {
  it("uses a dark accent surface in dark mode instead of the light-mode tint", () => {
    const styles = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");

    expect(styles).toMatch(/html\[data-theme="dark"\]\s*\{[^}]*--accent-soft:\s*color-mix\(in srgb, var\(--accent-color\) 22%, #1e293b\);/s);
  });
});
