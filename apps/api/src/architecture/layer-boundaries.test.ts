import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src");
const filesUnder = (directory: string): string[] =>
  readdirSync(join(apiRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

describe("API layer boundaries", () => {
  it("keeps HTTP routes in the global routes directory", () => {
    const routeFiles = filesUnder("routes").filter((file) => file.endsWith(".ts"));
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const feature of ["auth", "conversations", "messages", "customers", "knowledge", "channels/telegram", "channels/telegram-personal"]) {
      expect(filesUnder(feature).some((file) => file.endsWith(".routes.ts"))).toBe(false);
    }
  });

  it("does not let route modules import models or services", () => {
    for (const file of filesUnder("routes").filter((path) => path.endsWith(".ts"))) {
      const source = readFileSync(join(apiRoot, file), "utf8");
      expect(source).not.toMatch(/from ["'][^"']*models\//);
      expect(source).not.toMatch(/from ["'][^"']*\.service\.js["']/);
    }
  });
});
