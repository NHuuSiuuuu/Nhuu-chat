import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tailwind entry", () => {
  it("uses the Vite plugin and Tailwind import", () => {
    const entry = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
    const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

    expect(entry).toContain('@import "tailwindcss"');
    expect(viteConfig).toContain('from "@tailwindcss/vite"');
    expect(viteConfig).toContain("tailwindcss()");
  });
});
