import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mountReportAccessApi } from "../src/report-access/router.js";
import { ReportAccessService, type ReportInvitation } from "../src/report-access/service.js";
import type { FreeReport360 } from "../src/freeread/report360.js";

const report: FreeReport360 = {
  schemaVersion: 1, method: "geo-v2-public-evidence", scope: "single_public_url", sourceUrl: "https://example.org/", observedAt: "2026-11-16T13:00:00Z", httpStatus: 200,
  comparison: null, unmeasured: ["ai_citations"],
  pillars: [
    { id: "seo", coverage: "measured", score: null, observedChecks: 1, needsAttention: 0, observedCount: null, measurement: "html_seo_checks", missing: [] },
    { id: "geo", coverage: "measured", score: 80, observedChecks: 10, needsAttention: 2, observedCount: null, measurement: "geo_v1_readiness", missing: [] },
    { id: "ai", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "page_readiness_only", missing: [] },
    { id: "crm", coverage: "not_measured", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "requires_authorised_property", missing: [] },
    { id: "social", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: 0, measurement: "outbound_profile_links_on_page", missing: ["inbound_links"] },
  ], actions: [],
};

const servers: Server[] = [];
const stores: ReportAccessService[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(done => server.close(() => done()))));
  stores.splice(0).forEach(store => store.close());
});

describe("email-gated report routes", () => {
  it("rejects cross-origin changes and unverified HTML/PDF/MD reads, then serves only a verified session", async () => {
    let sent: ReportInvitation | undefined;
    const service = new ReportAccessService({ dbPath: ":memory:", secret: "another-test-secret-that-is-long-enough-xxxx" });
    stores.push(service);
    const app = express(); app.use(express.json());
    mountReportAccessApi(app, { service, send: async data => { sent = data; }, reader: async () => report, publicOrigin: "http://localhost",
      validateUrl: async () => ({ ok: true, url: "https://example.com/" }) });
    const server = app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
    const base = `http://127.0.0.1:${address.port}/api/report-access`;
    const status = await fetch(`${base}/status`); expect(await status.json()).toMatchObject({ enabled: true });

    const forbidden = await fetch(`${base}/invite`, { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.org/", email: "reader@example.org", language: "fr" }) });
    expect(forbidden.status).toBe(403);
    const before = await fetch(`${base}/report?id=wrong`); expect(before.status).toBe(401);

    // Production uses checkTarget's DNS/IP protections; this test injects a public URL verdict.
    const invite = await fetch(`${base}/invite`, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com/", email: "reader@example.org", language: "fr" }) });
    expect(invite.status).toBe(201);
    const data = await invite.json() as { id: string };
    expect(data.id).toBe(sent?.id);
    const evidence = { source: 'Provider', observedAt: report.observedAt, excerpt: 'Specific authorised excerpt', citations: ['https://source.example/proof'] };
    service.shareVisibilityEvidence({ id: data.id, email: 'reader@example.org', page: report.sourceUrl, tenantId: 'acme', pinId: 'pin', evidence });
    const protectedHtml = await fetch(`${base}/report?id=${data.id}`);
    expect(protectedHtml.status).toBe(401);
    expect(await protectedHtml.text()).not.toContain(evidence.excerpt);
    const protectedRead = await fetch(`${base}/download?id=${data.id}&format=md`);
    expect(protectedRead.status).toBe(401);

    const verified = await fetch(`${base}/verify`, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, email: "reader@example.org", code: sent!.code }) });
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get("set-cookie")?.split(";")[0] || "";
    expect(cookie).toContain("gtm_report_session=");
    expect(verified.headers.get("set-cookie")).toContain("HttpOnly");
    const html = await fetch(`${base}/report?id=${data.id}`, { headers: { Cookie: cookie } });
    expect(html.status).toBe(200);
    expect(await html.json()).toMatchObject({ report360: { sourceUrl: report.sourceUrl }, visibilityEvidence: [evidence] });
    expect(html.headers.get('cache-control')).toContain('no-store');
    const md = await fetch(`${base}/download?id=${data.id}&format=md`, { headers: { Cookie: cookie } });
    expect(md.status).toBe(200);
    expect(md.headers.get("content-disposition")).toContain(".md");
    const markdown = await md.text();
    expect(markdown).toContain("Rapport gratuit");
    expect(markdown).not.toContain(evidence.excerpt);
    const pdf = await fetch(`${base}/download?id=${data.id}&format=pdf`, { headers: { Cookie: cookie } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
