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
    const legacyRouteFiles = filesUnder("").filter((file) => file.endsWith(".routes.ts") && !file.startsWith("routes/"));
    expect(legacyRouteFiles).toEqual([]);
  });

  it("does not let route modules import models, services, or provider clients", () => {
    for (const file of filesUnder("routes").filter((path) => path.endsWith(".ts"))) {
      const source = readFileSync(join(apiRoot, file), "utf8");
      expect(source).not.toMatch(/from ["'][^"']*models\//);
      expect(source).not.toMatch(/from ["'][^"']*\.service\.js["']/);
      expect(source).not.toMatch(/from ["'][^"']*\.(?:client|provider)\.js["']/);
    }
  });

  it("does not let services import Express Request or Response", () => {
    for (const file of filesUnder("services").filter((path) => path.endsWith(".ts"))) {
      const source = readFileSync(join(apiRoot, file), "utf8");
      expect(source).not.toMatch(/import\s+(?:type\s+)?\{[^}]*\b(?:Request|Response)\b[^}]*\}\s+from\s+["']express["']/s);
    }
  });

  it("does not let services depend on HTTP schema modules", () => {
    for (const file of filesUnder("services").filter((path) => path.endsWith(".ts"))) {
      const source = readFileSync(join(apiRoot, file), "utf8");
      expect(source).not.toMatch(/from ["'][^"']*\/schemas\//);
    }
  });
});
