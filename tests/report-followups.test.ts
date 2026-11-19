/** R9 scheduled follow-ups: sealed J+14/J+28 dispatch through the same
 * white-label A4 pipeline, opt-in only, never summing across scopes. */
import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { ReportAccessService, type ReportInvitation } from "../src/report-access/service.js";
import { mountReportAccessApi } from "../src/report-access/router.js";
import { renderReportPdf } from "../src/report-access/export.js";
import { parseBrand } from "../src/report-access/brand.js";
import { followUpSuggestionFor } from "../src/impact/follow-ups.js";
import { parseFollowUpChoice, sealAddress, openAddress, followUpMailText, FOLLOWUP_REPORT_NOTE, dispatchDueFollowUps, type FollowUpMail } from "../src/report-access/follow-ups.js";
import { runDueJobs } from "../src/console/ops-scheduler.js";
import type { TenantStore } from "../src/tenants/store.js";
import type { FreeReport360 } from "../src/freeread/report360.js";

const report: FreeReport360 = {
  schemaVersion: 1, method: "geo-v2-public-evidence", scope: "single_public_url", sourceUrl: "https://example.com/", observedAt: "2026-11-16T13:00:00Z", httpStatus: 200,
  comparison: null, unmeasured: ["ai_citations"],
  pillars: [
    { id: "seo", coverage: "measured", score: null, observedChecks: 1, needsAttention: 0, observedCount: null, measurement: "html_seo_checks", missing: [] },
    { id: "geo", coverage: "measured", score: null, observedChecks: 10, needsAttention: 2, observedCount: null, measurement: "geo_v2_coverage", missing: [] },
    { id: "ai", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "page_readiness_only", missing: [] },
    { id: "crm", coverage: "not_measured", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "requires_authorised_property", missing: [] },
    { id: "social", coverage: "partial", score: null, observedChecks: null, needsAttention: 0, observedCount: null, measurement: "outbound_profile_links_on_page", missing: ["inbound_links"] },
  ], actions: [],
};
const fresh = { ...report, observedAt: "2026-12-05T09:00:00Z" };
const SECRET = "follow-up-test-secret-that-is-long-enough-xxxxxx";
const FIXED_NOW = Date.parse("2026-12-05T10:00:00Z");

const servers: Server[] = [];
const stores: ReportAccessService[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(done => server.close(() => done()))));
  stores.splice(0).forEach(store => store.close());
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

function newFileService(): { service: ReportAccessService; raw: Database.Database; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "gtm-followups-"));
  dirs.push(dir);
  const file = path.join(dir, "report-access.sqlite3");
  const service = new ReportAccessService({ dbPath: file, secret: SECRET, now: () => FIXED_NOW });
  stores.push(service);
  const raw = new Database(file);
  return { service, raw, file };
}

const drain = (service: ReportAccessService, deps: { reader?: () => Promise<{ observedAt: string; sourceUrl: string; blob: string }>; send?: (mail: FollowUpMail) => Promise<void>; now?: () => Date }) =>
  dispatchDueFollowUps({
    store: service,
    reader: deps.reader ?? (async () => ({ observedAt: fresh.observedAt, sourceUrl: report.sourceUrl, blob: JSON.stringify(fresh) })),
    send: deps.send ?? (async () => {}),
    renderPdf: (rep, language, opts) => renderReportPdf(rep as FreeReport360, language, { brand: opts?.brand ?? null }),
    suggestionFor: followUpSuggestionFor,
    reportNote: FOLLOWUP_REPORT_NOTE,
    now: deps.now ?? (() => new Date(FIXED_NOW)),
  });

describe("scheduled J+14/J+28 follow-ups", () => {
  it("seals the recipient address and rejects every tampering", () => {
    const sealed = sealAddress(SECRET, "client@example.org");
    expect(sealed).not.toContain("client@example.org");
    expect(openAddress(SECRET, sealed)).toBe("client@example.org");
    expect(openAddress("another-secret-that-is-long-enough-xxxxxxxxxx", sealed)).toBeNull();
    const tampered = JSON.parse(sealed) as { n: string; c: string; t: string };
    tampered.c = Buffer.from("client@evil.example").toString("base64");
    expect(openAddress(SECRET, JSON.stringify(tampered))).toBeNull();
    expect(() => sealAddress("short", "client@example.org")).toThrow();
    expect(() => sealAddress(SECRET, "")).toThrow();
  });

  it("accepts only the explicit auto or none choices", () => {
    expect(parseFollowUpChoice(undefined)).toBe("none");
    expect(parseFollowUpChoice(null)).toBe("none");
    expect(parseFollowUpChoice("none")).toBe("none");
    expect(parseFollowUpChoice("auto")).toBe("auto");
    expect(parseFollowUpChoice("always")).toBeNull();
    expect(parseFollowUpChoice(1)).toBeNull();
  });

  it("writes brand-aware bilingual follow-up mail without any summed metric", () => {
    const brand = parseBrand({ name: "Agence Belle Rive" })!;
    const suggestion = followUpSuggestionFor("J14");
    const fr = followUpMailText("fr", brand, "J14", "2026-11-16T13:00:00Z", "2026-12-05T09:00:00Z", report.sourceUrl, suggestion.fr, FOLLOWUP_REPORT_NOTE);
    const en = followUpMailText("en", null, "J28", "2026-11-16T13:00:00Z", "2026-12-05T09:00:00Z", report.sourceUrl, suggestion.en, FOLLOWUP_REPORT_NOTE);
    expect(fr.subject).toBe("Agence Belle Rive - suivi J+14 de votre rapport 360°");
    expect(en.subject).toBe("GTM Growth - J+28 follow-up on your 360° report");
    expect(fr.text).toContain(suggestion.fr);
    expect(en.text).toContain(suggestion.en);
    expect(fr.text).toContain(FOLLOWUP_REPORT_NOTE.fr);
    expect(en.text).toContain(FOLLOWUP_REPORT_NOTE.en);
    expect(fr.text).not.toMatch(/somme des notes?:\s*\d/i);
    expect(en.text).not.toMatch(/total score/i);
  });

  it("plans both milestones with the address sealed at rest and stays off by default", async () => {
    const { service, raw } = newFileService();
    let sent: ReportInvitation | undefined;
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", brand: parseBrand({ name: "Agence Belle Rive" }), followUp: "auto" }, async () => report, async data => { sent = data; });
    let rows = raw.prepare("SELECT * FROM follow_ups ORDER BY milestone").all() as Array<{ email_sealed: string; milestone: string; status: string; due_at: number; observed_at: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.milestone)).toEqual(["J14", "J28"]);
    expect(rows.every(r => openAddress(SECRET, r.email_sealed) === "client@example.org")).toBe(true);
    expect(rows.every(r => r.status === "pending")).toBe(true);
    expect(rows.every(r => !r.email_sealed.includes("client@example.org"))).toBe(true);
    expect(new Date(rows[0].due_at).toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(new Date(rows[1].due_at).toISOString()).toBe("2026-12-14T00:00:00.000Z");
    // A repeated identical invitation never doubles the plan (per recipient, page, milestone).
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", followUp: "auto" }, async () => report, async () => {});
    rows = raw.prepare("SELECT * FROM follow_ups").all() as typeof rows;
    expect(rows).toHaveLength(2);
    // Default invitations schedule nothing at all.
    await service.invite({ email: "other@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4" }, async () => report, async () => {});
    expect((raw.prepare("SELECT COUNT(*) AS c FROM follow_ups").get() as { c: number }).c).toBe(2);
    // J+28 is not due at the fixed now; only the J+14 pair is returned decrypted.
    const due = service.dueFollowUps(FIXED_NOW, 10);
    expect(due.map(d => d.milestone)).toEqual(["J14"]);
    expect(due[0].email).toBe("client@example.org");
    expect(due[0].brand?.name).toBe("Agence Belle Rive");
  });

  it("rejects an unknown follow-up choice at the service boundary", async () => {
    const { service } = newFileService();
    await expect(service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", followUp: "always" } as never, async () => report, async () => {})).rejects.toMatchObject({ code: "invalid_follow_up" });
  });

  it("dispatches the due J+14 with one branded PDF from the same pipeline, keeping J+28 pending", async () => {
    const { service, raw } = newFileService();
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", brand: parseBrand({ name: "Agence Belle Rive", accentColor: "#123456" }), followUp: "auto" }, async () => report, async () => {});
    const mails: FollowUpMail[] = [];
    const result = await drain(service, { send: async mail => { mails.push(mail); } });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mails).toHaveLength(1);
    const mail = mails[0];
    expect(mail.to).toBe("client@example.org");
    expect(mail.milestone).toBe("J14");
    expect(mail.brand?.name).toBe("Agence Belle Rive");
    expect(mail.observedAt).toBe("2026-11-16T13:00:00Z");
    expect(mail.measuredAt).toBe("2026-12-05T09:00:00Z");
    expect(mail.filename).toBe("agence-belle-rive-rapport-360-suivi-j14-fr.pdf");
    expect(mail.pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(mail.suggestion.fr).toContain("même URL");
    // No summed metric travels with a scheduled report.
    const inspectable = JSON.stringify({ ...mail, pdf: null });
    expect(inspectable).not.toMatch(/"total[A-Za-z_]*":/i);
    expect(inspectable).not.toMatch(/"sum(?!mary)[A-Za-z_]*":/i);
    const rows = raw.prepare("SELECT milestone, status, sent_at, fresh_payload FROM follow_ups ORDER BY milestone").all() as Array<{ milestone: string; status: string; sent_at: number | null; fresh_payload: string | null }>;
    expect(rows[0]).toMatchObject({ milestone: "J14", status: "sent" });
    expect(rows[0].sent_at).not.toBeNull();
    expect(JSON.parse(rows[0].fresh_payload ?? "{}").observedAt).toBe("2026-12-05T09:00:00Z");
    expect(rows[1]).toMatchObject({ milestone: "J28", status: "pending" });
    // Nothing new is due until the J+28 date.
    const again = await drain(service, {});
    expect(again.sent).toBe(0);
  });

  it("retries a failing dispatch then fails permanently, bounded by three attempts", async () => {
    const { service, raw } = newFileService();
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "en", ip: "1.2.3.4", followUp: "auto" }, async () => report, async () => {});
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await drain(service, { send: async () => { throw new Error("smtp down"); } });
      expect(r.failed).toBe(1);
      const row = raw.prepare("SELECT status, attempts FROM follow_ups WHERE milestone='J14'").get() as { status: string; attempts: number };
      expect(row).toMatchObject({ status: "pending", attempts: attempt });
    }
    const third = await drain(service, { send: async () => { throw new Error("smtp down"); } });
    expect(third.failed).toBe(1);
    const terminal = raw.prepare("SELECT status, attempts, error FROM follow_ups WHERE milestone='J14'").get() as { status: string; attempts: number; error: string };
    expect(terminal).toMatchObject({ status: "failed", attempts: 3 });
    expect(terminal.error).toContain("smtp down");
    // A permanent failure is not dispatched again.
    const after = await drain(service, {});
    expect(after.sent + after.failed).toBe(0);
  });

  it("refuses a re-measured snapshot from another page", async () => {
    const { service, raw } = newFileService();
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", followUp: "auto" }, async () => report, async () => {});
    const result = await drain(service, { reader: async () => ({ observedAt: "2026-12-05T09:00:00Z", sourceUrl: "https://other.example.org/", blob: JSON.stringify({ ...fresh, sourceUrl: "https://other.example.org/" }) }) });
    expect(result.failed).toBe(1);
    expect(result.details[0].status).toBe("failed:scope_mismatch");
    const row = raw.prepare("SELECT status, error FROM follow_ups WHERE milestone='J14'").get() as { status: string; error: string };
    expect(row.error).toBe("scope_mismatch");
  });

  it("surfaces the scheduled plan through the verified invitation flow only", async () => {
    const service = new ReportAccessService({ dbPath: ":memory:", secret: SECRET });
    stores.push(service);
    let sent: ReportInvitation | undefined;
    const app = express(); app.use(express.json());
    mountReportAccessApi(app, { service, send: async data => { sent = data; }, reader: async () => report, publicOrigin: "http://localhost", validateUrl: async () => ({ ok: true, url: "https://example.com/" }) });
    const server = app.listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/report-access`;
    const headers = { Origin: "http://localhost", "Content-Type": "application/json" };

    const invalid = await fetch(`${base}/invite`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com/", email: "client@example.org", language: "fr", followUp: "always" }) });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_follow_up" });

    const invite = await fetch(`${base}/invite`, { method: "POST", headers, body: JSON.stringify({ url: "https://example.com/", email: "client@example.org", language: "fr", brand: { name: "Agence Belle Rive" }, followUp: "auto" }) });
    expect(invite.status).toBe(201);
    const unauthorised = await fetch(`${base}/follow-ups?id=${sent!.id}`);
    expect(unauthorised.status).toBe(401);
    expect(await unauthorised.json()).toMatchObject({ error: "verification_required" });

    const verify = await fetch(`${base}/verify`, { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ id: sent!.id, email: "client@example.org", code: sent!.code }) });
    expect(verify.status).toBe(200);
    const cookie = verify.headers.get("set-cookie")?.split(";")[0] ?? "";
    const plan = await fetch(`${base}/follow-ups?id=${sent!.id}`, { headers: { Cookie: cookie } });
    expect(plan.status).toBe(200);
    const payload = await plan.json() as { followUps: Array<{ milestone: string; dueAt: string; status: string }> };
    expect(payload.followUps).toHaveLength(2);
    expect(payload.followUps[0]).toMatchObject({ milestone: "J14", status: "pending" });
    expect(payload.followUps[1]).toMatchObject({ milestone: "J28", status: "pending" });
    // The plan exposes milestones and dates only; never the recipient address.
    expect(JSON.stringify(payload)).not.toContain("@");
  });

  it("drains scheduled follow-ups from the ops scheduler pass", async () => {
    const { service } = newFileService();
    await service.invite({ email: "client@example.org", url: report.sourceUrl, language: "fr", ip: "1.2.3.4", brand: parseBrand({ name: "Studio Némo" }), followUp: "auto" }, async () => report, async () => {});
    const mails: FollowUpMail[] = [];
    const result = await runDueJobs({
      tenantStore: { list: () => [] } as unknown as TenantStore,
      now: () => new Date(FIXED_NOW),
      reportFollowUps: { store: service, sender: async mail => { mails.push(mail); }, reader: async () => ({ observedAt: fresh.observedAt, sourceUrl: report.sourceUrl, blob: JSON.stringify(fresh) }) },
    });
    expect(mails).toHaveLength(1);
    expect(mails[0].filename).toBe("studio-nemo-rapport-360-suivi-j14-fr.pdf");
    const entry = result.details.find(d => d.job === "report-follow-ups");
    expect(entry?.status).toBe("sent:1/failed:0");
    // Without the operator opt-in and injected runtime, the pass stays inert.
    delete process.env.REPORT_FOLLOW_UPS_ENABLED;
    const idle = await runDueJobs({ tenantStore: { list: () => [] } as unknown as TenantStore, now: () => new Date(FIXED_NOW) });
    expect(idle.details.find(d => d.job === "report-follow-ups")).toBeUndefined();
  });
});
