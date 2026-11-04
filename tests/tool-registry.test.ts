import { describe, expect, it } from "vitest";
import { handleToolCall, tools } from "../src/tools/index.js";

const REQUIRED = [
  "indexnow_keygen",
  "indexnow_verify",
  "indexnow_submit",
  "indexnow_readiness",
  "indexnow_explain",
  "analysis_board",
];

describe("tool registry", () => {
  it("exposes every IndexNow and board tool over MCP", () => {
    const names = tools.map((tool) => tool.name);
    for (const name of REQUIRED) {
      expect(names, `${name} must be registered in src/tools/index.ts`).toContain(name);
    }
  });

  it("has no duplicate tool names", () => {
    const names = tools.map((tool) => tool.name);
    const seen = new Set();
    const duplicates = names.filter((name) => (seen.has(name) ? true : !seen.add(name)));
    expect(duplicates).toEqual([]);
  });

  it("describes every tool", () => {
    for (const tool of tools) {
      expect(tool.description.trim().length, `${tool.name} needs a description`).toBeGreaterThan(10);
      expect(tool.schema, `${tool.name} needs a schema`).toBeTruthy();
    }
  });

  it("refuses a submission without confirm=true, through the real dispatcher", async () => {
    const result = await handleToolCall("indexnow_submit", {
      host: "example.com",
      key: "abcd1234efgh5678",
      urls: ["https://example.com/a"],
    });
    const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
    expect(payload.submitted).toBe(false);
    expect(String(payload.reason)).toContain("confirm=true");
  });
});
