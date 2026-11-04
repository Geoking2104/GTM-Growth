import { describe, expect, it } from "vitest";
import { listResources, measurePageWeight } from "../src/console/weight.js";

const html = `<html><head><link rel="stylesheet" href="/a.css"><script src="https://cdn.x.com/b.js"></script></head><body><img src="c.png"><img src="data:image/png;base64,AA"></body></html>`;

describe("page weight", () => {
  it("lists referenced resources", () => {
    const r = listResources(html, "https://ex.com/page/");
    expect(r.map((x) => x.url)).toEqual(["https://cdn.x.com/b.js", "https://ex.com/page/c.png", "https://ex.com/a.css"]);
  });
  it("sums sizes by type", async () => {
    const res = await measurePageWeight("https://ex.com/", { fetchHtml: async (u) => ({ body: html, url: u }), probe: async (u) => (u.endsWith(".png") ? null : 1000) });
    expect(res.byType.script.bytes).toBe(1000);
    expect(res.unknown).toBe(1);
    expect(res.totalBytes).toBe(2000 + Buffer.byteLength(html));
  });
});
