import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const block = (css: string, selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
const token = (css: string, name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

describe("shared brand identity", () => {
  it("gives the French and English console the same brand tokens", () => {
    const css = read("site/brand.css");
    const en = block(css, 'html[lang="en"]'), consolePage = block(css, "body.console-page");
    for (const name of ["--brand", "--brand-2", "--brand-soft", "--night-accent"]) expect(token(consolePage, name), name).toBe(token(en, name));
    expect(token(consolePage, "--brand")).toBe("#7c3aed");
  });

  it("uses the rocket logo on every public HTML page", () => {
    const pages: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = path.join(dir, name); if (statSync(full).isDirectory()) walk(full); else if (name.endsWith(".html")) pages.push(full); } };
    walk(path.join(root, "site"));
    const legacy = pages.filter((file) => /assets\/logo(-64|-128)?\.png/.test(readFileSync(file, "utf8"))).map((file) => path.relative(root, file));
    expect(legacy).toEqual([]);
    expect(read("site/404.html")).toContain("/fr/assets/logo-rocket.png");
    expect(read("site/reports/opendpe.html")).toContain("../fr/assets/logo-rocket.png");
  });
});
