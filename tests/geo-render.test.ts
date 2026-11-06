import { describe, expect, it } from "vitest";
import { compareRenderSnapshots } from "../src/geo/render/diff.js";

describe("render snapshot comparison", () => {
  it("identifies client-only, hybrid and server-rendered content deterministically", () => {
    const rendered = `<body><h1>Title</h1><p>${"word ".repeat(100)}</p></body>`;
    const spa = "<body><div id='root'></div></body>";
    expect(compareRenderSnapshots(spa, rendered).verdict).toBe("client-only");
    expect(compareRenderSnapshots(spa, rendered).diff?.renderedToRawTextRatio).toBeNull();
    expect(compareRenderSnapshots(rendered, rendered).diff?.renderedToRawTextRatio).toBe(1);
    expect(compareRenderSnapshots(`<body>${"word ".repeat(50)}</body>`, rendered).verdict).toBe("hybrid");
    expect(compareRenderSnapshots(rendered, rendered).verdict).toBe("ssr");
    expect(compareRenderSnapshots(spa, rendered)).toEqual(compareRenderSnapshots(spa, rendered));
  });
  it("reports additions, including repeated links and injected structured data", () => {
    const raw = '<body><a href="/a">A</a></body>';
    const rendered = '<body><h2>New</h2><a href="/a">A</a><a href="/a">A</a><img src="x"><script type="application/ld+json">{}</script></body>';
    const diff = compareRenderSnapshots(raw, rendered).diff!;
    expect(diff.headingsAdded).toEqual(["h2: New"]);
    expect(diff.linksAdded).toEqual(["/a"]);
    expect(diff.imagesAdded).toEqual(["x"]);
    expect(diff.jsonLdAdded).toBe(1);
  });
  it("does not infer visibility when rendered text is empty", () => {
    expect(compareRenderSnapshots("<body></body>", "<body></body>").verdict).toBe("not-measured");
  });
});
