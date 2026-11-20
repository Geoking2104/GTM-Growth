import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against UTF-8 text that was decoded as Windows-1252 and saved again
 * ("Ã©" for "é", "â€™" for "’", "Â«" for "«"). A run of two or more
 * Windows-1252 high characters that re-decodes as valid UTF-8 is mojibake.
 */
const root = path.resolve(import.meta.dirname, "..");
const scanned = ["src", "site", "deploy/kayroslab-vps/keycloak", "scripts", "docs", "skills", "tests"];
const allow = new Set(["scripts/qa-gbp-dashboard.mjs", "tests/no-mojibake.test.ts"]);
const binary = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|apk|mp4|webm|gz|tgz)$/i;

const cp1252 = new TextDecoder("windows-1252");
const toByte = new Map<string, number>();
for (let b = 0x80; b <= 0xff; b++) toByte.set(cp1252.decode(Uint8Array.of(b)), b);
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

export function findMojibake(text: string): string[] {
  const hits: string[] = [];
  let run = "";
  const flush = () => {
    if (run.length >= 2) {
      try {
        const fixed = strictUtf8.decode(Uint8Array.from([...run].map((c) => toByte.get(c)!)));
        if (fixed !== run) hits.push(`${run} → ${fixed}`);
      } catch { /* not a UTF-8 sequence: legitimate accents */ }
    }
    run = "";
  };
  for (const char of text) { if (toByte.has(char)) run += char; else flush(); }
  flush();
  return hits;
}

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (!binary.test(name)) yield full;
  }
}

describe("source encoding", () => {
  it("detects double-encoded French accents", () => {
    expect(findMojibake("SÃ©lectionnez")).toHaveLength(1);
    expect(findMojibake("Lâ€™URL Â« test Â»")).toHaveLength(3);
    expect(findMojibake("Sélectionnez « l’URL » — déjà")).toEqual([]);
  });

  it("contains no mojibake in source, site, themes, scripts, docs or tests", () => {
    const problems: string[] = [];
    for (const dir of scanned) {
      const abs = path.join(root, dir);
      try { statSync(abs); } catch { continue; }
      for (const file of files(abs)) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        if (allow.has(rel)) continue;
        for (const hit of findMojibake(readFileSync(file, "utf8"))) problems.push(`${rel}: ${hit}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
