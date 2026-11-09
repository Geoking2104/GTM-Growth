import { describe, expect, it } from "vitest";
import { runGeoAudit } from "../src/geo/audit.js";
import { collectAutomaticV2 } from "../src/geo/score/v2/automatic.js";
import type { Fetcher, FetchResult } from "../src/geo/http.js";

const html = `<html lang="en"><head><title>Acme</title>
<meta name="description" content="Acme helps teams measure AI visibility.">
<link rel="canonical" href="https://acme.test/">
<meta property="og:title" content="Acme">
<meta property="og:description" content="Acme AI metrics">
<meta property="og:image" content="https://acme.test/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://acme.test/"}</script>
</head><body><h1>Acme</h1><h2>Docs</h2><p>Helpful service documentation.</p></body></html>`;
const llms = "# Acme\n> Summary\n## Docs\n[Docs](https://acme.test/docs)\n";
const fetcher: Fetcher = async (url): Promise<FetchResult> => {
  const isRobots = url.endsWith("/robots.txt");
  const isLlms = url.endsWith("/llms.txt");
  const ok = isRobots || isLlms || url === "https://acme.test/";
  return { url, status: ok ? 200 : 404, ok,
    headers: { "content-type": "text/plain" },
    body: isRobots ? "User-agent: *\nAllow: /\n" : isLlms ? llms : ok ? html : "not found" };
};

describe("automatic v2 HTTP collectors", () => {
  it("measures explicitly proven controls and leaves rendering unmeasured", async () => {
    const audit = await runGeoAudit({ url: "https://acme.test/", fetcher });
    const result = await collectAutomaticV2(audit);
    expect(result.gridVersion).toBe("v2.0.0");
    expect(result.status).toBe("incomplete");
    expect(result.score).toBeNull();
    expect(result.applicableMaximum).toBeGreaterThan(0);
    expect(result.byCategory.rendering.unknown).toBe(12);
    expect(result.byCategory.meta.applicable).toBe(10);
    expect(result.byCategory.meta.earned).toBe(10);
    expect(result.unmeasuredControls).toContain("P01");
    expect(result.unmeasuredControls).toContain("B04");
    expect(result.controls.find(control => control.controlId === "D01")).toMatchObject({ status: "measured", earned: 0 });
    expect(result.controls.find(control => control.controlId === "R04")).toMatchObject({ status: "measured", earned: 0 });
    expect(result.controls).toHaveLength(42);
    expect(result.observationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.controls.find(control => control.controlId === "J06")).toMatchObject({
      status: "measured", earned: 2, proof: { url: "https://acme.test/" },
    });
    expect(result.controls.find(control => control.controlId === "P01")).toMatchObject({
      status: "unknown", earned: null, proof: null,
    });
  });

  it("awards the last 4 llms points only above 1000 words", async () => {
    const audit = await runGeoAudit({ url: "https://acme.test/", fetcher });
    audit.details.llms.wordCount = 1000;
    const atThreshold = await collectAutomaticV2(audit);
    audit.details.llms.wordCount = 1001;
    const aboveThreshold = await collectAutomaticV2(audit);
    expect(aboveThreshold.byCategory.llms.earned - atThreshold.byCategory.llms.earned).toBe(4);
  });

  it("only credits sitemap declaration when parsed XML is verified", async () => {
    const audit = await runGeoAudit({ url: "https://acme.test/", fetcher });
    audit.details.robots.sitemaps = ["https://acme.test/sitemap.xml"];
    const good = await collectAutomaticV2(audit, [], {
      sitemap: { url: "https://acme.test/sitemap.xml", valid: true },
    });
    expect(good.controls.find(control => control.controlId === "R04")).toMatchObject({
      status: "measured", earned: 2,
    });
    const invalid = await collectAutomaticV2(audit, [], {
      sitemap: { url: "https://acme.test/sitemap.xml", valid: false },
    });
    expect(invalid.controls.find(control => control.controlId === "R04")?.earned).toBe(0);
    const unchecked = await collectAutomaticV2(audit);
    expect(unchecked.controls.find(control => control.controlId === "R04")?.status).toBe("unknown");
  });

  it("does not turn unavailable AI endpoint responses into discovery failures", async () => {
    const audit = await runGeoAudit({ url: "https://acme.test/", fetcher });
    audit.details.ai_discovery.endpointStatus.summary = 0;
    const result = await collectAutomaticV2(audit);
    expect(result.controls.find(control => control.controlId === "D01")).toMatchObject({
      status: "unknown", earned: null,
    });
  });

  it("keeps missing HTTP measurements unknown instead of zero", async () => {
    const audit = await runGeoAudit({ url: "https://acme.test/", fetcher });
    audit.details.robots.status = 0;
    const result = await collectAutomaticV2(audit);
    expect(result.byCategory.robots.unknown).toBeGreaterThanOrEqual(7);
    expect(result.score).toBeNull();
  });
});
