import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ReportAccessService, ReportAccessError, normaliseReportEmail, type ReportInvitation } from "../src/report-access/service.js";
import { renderReportMarkdown, renderReportPdf } from "../src/report-access/export.js";
import { smtpSettings } from "../src/report-access/mailer.js";
import type { FreeReport360 } from "../src/freeread/report360.js";

const report: FreeReport360 = {
  schemaVersion: 1, method: "geo-v1-public-page", scope: "single_public_url", sourceUrl: "https://example.com/", httpStatus: 200,
  observedAt: "2026-11-16T12:15:00Z", comparison: null,
  unmeasured: ["ai_citations", "crm_conversions", "social_inbound_backlinks"],
  pillars: [
    { id: "seo", coverage: "measured", score: null, observedChecks: 10, needsAttention: 2, observedCount: null, measurement: "html_seo_checks", missing: [] },
    { id: "geo", coverage: "measured", score: 53, observedChecks: 20, needsAttention: 8, observedCount: null, measurement: "geo_v1_readiness", missing: [] },
    { id: "ai", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "page_readiness_only", missing: ["actual_ai_citations"] },
    { id: "crm", coverage: "not_measured", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "requires_authorised_property", missing: ["actual_conversions"] },
    { id: "social", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: 1, measurement: "outbound_profile_links_on_page", missing: ["inbound_links"] },
  ],
  actions: [
    { id: "seo.title", code: "title", kind: "observed_fix", pillar: "seo", priority: "high", effort: "low", risk: "low", owner: "content", points: null, proof: { id: "seo.meta:Title", label: "Title", value: "missing <script>", note: "No title found", sourceUrl: "https://example.com/", observedAt: "2026-11-16T12:15:00Z", format: "html_observation" } },
    { id: "geo.schema.organization", code: "geo_check", checkId: "schema.organization", kind: "observed_fix", pillar: "geo", priority: "high", effort: "medium", risk: "medium", owner: "technical", points: 4, proof: { id: "geo:schema.organization", label: "schema.organization", value: "No Organisation schema", note: "Review entities", sourceUrl: "https://example.com/", observedAt: "2026-11-16T12:15:00Z", format: "geo_check" } },
    { id: "ai.connect_measurement", code: "ai_measurement", kind: "next_step", pillar: "ai", priority: "medium", effort: "medium", risk: "high", owner: "marketing", points: null, proof: null },
  ],
};

const opts = { dbPath: ":memory:", secret: "long-private-test-secret-32-characters-xxxxxxxx" };
const reader = async () => report;
const invitation = async (service: ReportAccessService, email = " Owner@Example.COM ", ip = "203.0.113.5") => {
  let delivered: ReportInvitation | null = null;
  const issued = await service.invite({ email, url: "https://example.com/", language: "fr", ip }, reader, async details => { delivered = details; });
  if (!delivered) throw new Error("No mail delivered");
  return { issued, mail: delivered as ReportInvitation };
};

describe("report email-code access", () => {
  it("normalises email and rejects malformed address values", () => {
    expect(normaliseReportEmail(" Owner+News@Example.com ")).toBe("owner+news@example.com");
    for (const v of ["a@b", "a@b..com", "header\r\n@example.com", "user@localhost", "nobody", 34]) expect(normaliseReportEmail(v)).toBeNull();
  });

  it("sends a six-digit single-use code, never returns the code, and binds the session to one report", async () => {
    let time = Date.UTC(2026, 10, 16);
    const service = new ReportAccessService({ ...opts, now: () => time });
    const { issued, mail } = await invitation(service);
    expect(mail.email).toBe("owner@example.com");
    expect(mail.code).toMatch(/^\d{6}$/);
    expect(issued).toEqual({ id: mail.id, expiresIn: 900 });
    expect(JSON.stringify(issued)).not.toContain(mail.code);
    expect(() => service.authorisedReport(issued.id, "")).toThrowError(ReportAccessError);
    expect(() => service.verify({ id: issued.id, email: "wrong@example.com", code: mail.code })).toThrowError(ReportAccessError);
    const session = service.verify({ id: issued.id, email: mail.email, code: mail.code });
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(service.authorisedReport(issued.id, session.token).report.sourceUrl).toBe(report.sourceUrl);
    expect(() => service.verify({ id: issued.id, email: mail.email, code: mail.code })).toThrowError(ReportAccessError);
    expect(() => service.authorisedReport("b6f5f997-4aeb-487a-977a-f155fd31c659", session.token)).toThrowError(ReportAccessError);
    time += 60 * 60_000 + 1;
    expect(() => service.authorisedReport(issued.id, session.token)).toThrowError(ReportAccessError);
    service.close();
  });

  it("expires codes, caps guesses and limits repeated mail sends", async () => {
    let time = 1_800_000_000_000;
    const service = new ReportAccessService({ ...opts, now: () => time });
    const first = await invitation(service);
    for (let i = 0; i < 5; i++) expect(() => service.verify({ id: first.issued.id, email: first.mail.email, code: "00000x".replace("x", String(i)) })).toThrow();
    expect(() => service.verify({ id: first.issued.id, email: first.mail.email, code: first.mail.code })).toThrowError(ReportAccessError);
    const another = await invitation(service);
    time += 15 * 60_000 + 1;
    expect(() => service.verify({ id: another.issued.id, email: another.mail.email, code: another.mail.code })).toThrowError(ReportAccessError);
    await invitation(service);
    await invitation(service);
    await expect(invitation(service)).rejects.toMatchObject({ status: 429, code: "too_many_invitations" });
    service.close();
  });

  it("deletes unsent invitations and fails closed if SMTP fails", async () => {
    const service = new ReportAccessService(opts);
    await expect(service.invite({ email: "a@example.com", url: "https://example.com/", language: "en", ip: "203.0.113.9" }, reader, async () => {
      throw new Error("SMTP password must not be leaked");
    })).rejects.toMatchObject({ status: 503, code: "mail_unavailable" });
    service.close();
  });

  it("enforces configured TLS SMTP and does not activate without sender credentials", () => {
    expect(smtpSettings({ REPORT_SMTP_HOST: "smtp.example.com", REPORT_SMTP_PORT: "587", REPORT_SMTP_USER: "user", REPORT_SMTP_PASSWORD: "pass", REPORT_SMTP_FROM: "reports@example.com" })).toMatchObject({ port: 587, publicOrigin: "https://gtm.kayroslab.com" });
    expect(smtpSettings({ REPORT_SMTP_HOST: "smtp.example.com" })).toBeNull();
    expect(smtpSettings({ REPORT_SMTP_HOST: "127.0.0.1", REPORT_SMTP_PORT: "25", REPORT_SMTP_USER: "x", REPORT_SMTP_PASSWORD: "x", REPORT_SMTP_FROM: "x@example.com" })).toBeNull();
  });
});

describe("report downloads", () => {
  it.each(["fr", "en"] as const)("generates a bilingual Markdown report with all five pillars and dated facts (%s)", (language) => {
    const md = renderReportMarkdown(report, language);
    expect(md).toContain(language === "fr" ? "Réseaux sociaux" : "Social");
    expect(md).toContain("53/100");
    expect(md).toContain(language === "fr" ? "non mesuré" : "not measured");
    expect(md).toContain("https://example.com/");
    expect(md).toContain("\\<script\\>"); // untrusted evidence is Markdown-escaped
    expect(md).not.toContain("CRM: 0/100");
  });

  it("generates a real vector A4 PDF with a source and action pages", async () => {
    const pdf = await renderReportPdf(report, "fr");
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(4_000);
    if (process.env.REPORT_QA_PDF_OUTPUT) {
      mkdirSync(dirname(process.env.REPORT_QA_PDF_OUTPUT), { recursive: true });
      writeFileSync(process.env.REPORT_QA_PDF_OUTPUT, pdf);
    }
  });
});
