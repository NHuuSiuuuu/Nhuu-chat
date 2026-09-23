import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx|jsx)$/.test(entry.name) && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find((property): property is ts.JsxAttribute =>
    ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name
  );
}

function classExpression(source: string, element: ts.JsxOpeningLikeElement): string {
  const className = attribute(element, "className")?.initializer;
  if (!className) return "";
  if (ts.isStringLiteral(className) || ts.isNoSubstitutionTemplateLiteral(className)) return className.text;
  return ts.isJsxExpression(className) && className.expression
    ? source.slice(className.expression.getStart(), className.expression.getEnd())
    : "";
}

describe("interactive cursor affordances", () => {
  it("gives every clickable native control an explicit pointer cursor", () => {
    const missing: string[] = [];

    for (const path of sourceFiles(join(process.cwd(), "apps/web/src"))) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const inspect = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
          const tag = node.tagName.text;
          const clickable = tag === "button" || (tag === "a" && Boolean(attribute(node, "href"))) ||
            (["div", "span", "li", "svg"].includes(tag) && Boolean(attribute(node, "onClick")));
          const classes = classExpression(source, node);
          if (clickable && !classes.includes("cursor-pointer")) {
            const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            missing.push(`${path}:${line} <${tag}>`);
          }
          if (clickable && attribute(node, "disabled") && !/(?:disabled:cursor-(?:not-allowed|wait))/.test(classes)) {
            const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            missing.push(`${path}:${line} <${tag}> disabled cursor`);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(file);
    }

    expect(missing).toEqual([]);
  });

  it("adds hover feedback to clickable non-semantic elements", () => {
    const missing: string[] = [];

    for (const path of sourceFiles(join(process.cwd(), "apps/web/src"))) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const inspect = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
          const tag = node.tagName.text;
          if (["div", "span", "li", "svg"].includes(tag) && attribute(node, "onClick")) {
            const classes = classExpression(source, node);
            if (!classes.includes("cursor-pointer") || !classes.includes("hover:") || !classes.includes("transition")) {
              const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
              missing.push(`${path}:${line} <${tag}>`);
            }
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(file);
    }

    expect(missing).toEqual([]);
  });

  it("gives enabled controls and links hover feedback while leaving dismiss backdrops neutral", () => {
    const missing: string[] = [];

    for (const path of sourceFiles(join(process.cwd(), "apps/web/src"))) {
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const inspect = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
          const tag = node.tagName.text;
          const interactive = tag === "button" || (tag === "a" && Boolean(attribute(node, "href")));
          const classes = classExpression(source, node);
          if (interactive && !attribute(node, "disabled") && !classes.includes("fixed inset-0") && !classes.includes("hover:")) {
            const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            missing.push(`${path}:${line} <${tag}>`);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(file);
    }

    expect(missing).toEqual([]);
  });

  it("keeps password visibility, auth tabs, and conversation rows visibly interactive", () => {
    const auth = readFileSync(join(process.cwd(), "apps/web/src/components/auth/AuthPage.tsx"), "utf8");
    const conversationList = readFileSync(join(process.cwd(), "apps/web/src/components/conversations/ConversationList.tsx"), "utf8");
    const authTabs = auth.slice(auth.indexOf('<nav aria-label="Chuyển trang xác thực"'), auth.indexOf("</nav>"));

    expect(auth).toMatch(/aria-label=\{visible \? "Ẩn mật khẩu" : "Hiện mật khẩu"\}[^\n]*cursor-pointer[^\n]*hover:text-slate-700/);
    expect(authTabs.match(/<a href="\/(?:login|register)"[^\n]*cursor-pointer/g)).toHaveLength(2);
    expect(conversationList).toContain("hover:bg-slate-100");
  });
});
