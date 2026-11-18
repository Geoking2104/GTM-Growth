import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { parseBrand, readableOn, brandSlug } from "../src/report-access/brand.js";
import { renderReportMarkdown, renderReportPdf } from "../src/report-access/export.js";
import { ReportAccessService, type ReportInvitation } from "../src/report-access/service.js";
import { mountReportAccessApi } from "../src/report-access/router.js";
import type { FreeReport360 } from "../src/freeread/report360.js";

const report: FreeReport360 = {
  schemaVersion: 1, method: "geo-v2-public-evidence", scope: "single_public_url", sourceUrl: "https://example.org/", observedAt: "2026-11-16T13:00:00Z", httpStatus: 200,
  comparison: null, unmeasured: ["ai_citations"],
  pillars: [
    { id: "seo", coverage: "measured", score: null, observedChecks: 1, needsAttention: 0, observedCount: null, measurement: "html_seo_checks", missing: [] },
    { id: "geo", coverage: "measured", score: null, observedChecks: 10, needsAttention: 2, observedCount: null, measurement: "geo_v2_coverage", missing: [] },
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

describe("white-label client branding", () => {
  it("validates one bounded brand per invitation and rejects everything else", () => {
    expect(parseBrand({ name: "Agence Belle Rive" })).toEqual({ name: "Agence Belle Rive", tagline: null, accentColor: null });
    expect(parseBrand({ name: "  Studio  Némo ", tagline: " Référencement LLM ", accentColor: "#6935DC" })).toEqual({ name: "Studio Némo", tagline: "Référencement LLM", accentColor: "#6935dc" });
    expect(parseBrand({ name: "KayrosLAB" })).not.toBeNull();
    expect(parseBrand(null)).toBeNull();
    expect(parseBrand("KayrosLAB")).toBeNull();
    expect(parseBrand([{ name: "KayrosLAB" }])).toBeNull();
    expect(parseBrand({})).toBeNull();
    expect(parseBrand({ name: 42 })).toBeNull();
    expect(parseBrand({ name: "A" })).toBeNull();
    expect(parseBrand({ name: "x".repeat(61) })).toBeNull();
    expect(parseBrand({ name: "<script>alert(1)</script>" })).toBeNull();
    expect(parseBrand({ name: "https://attacker.example" })).toBeNull();
    expect(parseBrand({ name: "KayrosLAB", accentColor: "6935dc" })).toBeNull();
    expect(parseBrand({ name: "KayrosLAB", accentColor: "#12345" })).toBeNull();
    expect(parseBrand({ name: "KayrosLAB", tagline: 5 })).toBeNull();
    expect(parseBrand({ name: "KayrosLAB", evil: true })).toBeNull();
  });

  it("picks readable ink on the brand band and slugs the download filename", () => {
    expect(readableOn("#281649")).toBe("#FFFFFF");
    expect(readableOn("#F6F2FF")).toBe("#262144");
    expect(brandSlug("Agence Belle Rive")).toBe("agence-belle-rive");
    expect(brandSlug("Studio Némo & Co")).toBe("studio-nemo-co");
    expect(brandSlug("###")).toBe("marque");
  });

  it("renders the branded markdown and PDF from exactly one snapshot, refusing aggregated metrics", async () => {
    const brand = parseBrand({ name: "Agence Belle Rive", tagline: "Semantics first", accentColor: "#123456" });
    if (!brand) throw new Error("expected a brand");
    const markdown = renderReportMarkdown(report, "fr", { brand });
    expect(markdown).toContain("# Agence Belle Rive - Rapport gratuit 360°");
    expect(markdown).toContain("> Semantics first");
    expect(markdown).not.toContain("GTM Growth");
    expect(renderReportMarkdown(report, "fr")).toContain("# GTM Growth - Rapport gratuit 360°");
    const pdf = await renderReportPdf(report, "en", { brand });
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const house = await renderReportPdf(report, "en");
    expect(house.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    // Without metric summing: an export refuses a second snapshot or client.
    expect(() => renderReportMarkdown([report, report] as never, "fr", { brand })).toThrow();
    await expect(renderReportPdf([report] as never, "fr", { brand })).rejects.toThrow();
  });

  it("serves a branded client report through the verified invitation flow and rejects invalid brands", async () => {
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
    const headers = { Origin: "http://localhost", "Content-Type": "application/json" };

    const invalid = await fetch(`${base}/invite`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com/", email: "client@example.org", language: "fr", brand: { name: "<b>Bad</b>" } }) });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_brand" });

    const invite = await fetch(`${base}/invite`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com/", email: "client@example.org", language: "fr", brand: { name: "Agence Belle Rive", tagline: "Semantics first" } }) });
    expect(invite.status).toBe(201);
    if (!sent) throw new Error("invitation never sent");
    const verify = await fetch(`${base}/verify`, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ id: sent.id, email: "client@example.org", code: sent.code }) });
    expect(verify.status).toBe(200);
    const cookie = verify.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toContain("gtm_report_session=");

    const authorised = await fetch(`${base}/report?id=${sent.id}`, { headers: { Cookie: cookie } });
    const payload = await authorised.json() as { brand: { name: string } | null };
    expect(authorised.status).toBe(200);
    expect(payload.brand).toMatchObject({ name: "Agence Belle Rive" });

    const download = await fetch(`${base}/download?id=${sent.id}&format=md`, { headers: { Cookie: cookie } });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain(`filename="agence-belle-rive-rapport-360-fr.md"`);
    const markdown = await download.text();
    expect(markdown).toContain("# Agence Belle Rive - Rapport gratuit 360°");
    expect(markdown).not.toContain("GTM Growth");

    const pdf = await fetch(`${base}/download?id=${sent.id}&format=pdf`, { headers: { Cookie: cookie } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-disposition")).toContain(`filename="agence-belle-rive-rapport-360-fr.pdf"`);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
