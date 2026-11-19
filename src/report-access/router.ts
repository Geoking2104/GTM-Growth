import type { Express, Request, Response } from "express";
import { checkTarget, publicClientIp } from "../http/public-api.js";
import type { AuditStore } from "../audit-jobs/store.js";
import { runFreeRead } from "../freeread/index.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { renderReportMarkdown, renderReportPdf } from "./export.js";
import { ReportAccessService, ReportAccessError, type MailSender, type ReportReader, type ReportLanguage } from "./service.js";
import { parseBrand, brandSlug } from "./brand.js";
import { parseFollowUpChoice } from "./follow-ups.js";
import { createSmtpSender, smtpSettings } from "./mailer.js";

const COOKIE = "gtm_report_session";
const MAX_JSON_LENGTH = 2_048;

export interface ReportAccessDependencies {
  service?: ReportAccessService;
  send?: MailSender;
  reader?: ReportReader;
  publicOrigin?: string;
  validateUrl?: typeof checkTarget;
  audits?: AuditStore;
}

function cookieToken(req: Request): string | null {
  for (const part of (req.headers.cookie || "").split(";")) {
    const pair = part.trim();
    if (pair.startsWith(`${COOKIE}=`)) return pair.slice(COOKIE.length + 1);
  }
  return null;
}
function apiError(res: Response, error: unknown): Response {
  if (error instanceof ReportAccessError) return res.status(error.status).json({ error: error.code });
  // Do not expose raw mail, database, target URL or dependency failures.
  return res.status(502).json({ error: "report_unavailable" });
}

export function mountReportAccessApi(app: Express, deps: ReportAccessDependencies = {}): void {
  const settings = smtpSettings();
  const configured = process.env.REPORT_ACCESS_ENABLED === "true" && (process.env.REPORT_ACCESS_SECRET || "").length >= 32 && Boolean(settings);
  const service = deps.service ?? (configured ? new ReportAccessService({
    dbPath: process.env.REPORT_ACCESS_DB_PATH || "data/report-access.sqlite3",
    secret: process.env.REPORT_ACCESS_SECRET!,
  }) : null);
  const sender = deps.send ?? (configured && settings ? createSmtpSender(settings) : null);
  const reader = deps.reader ?? (async (url: string) => {
    const result = await runFreeRead({ url, timeoutMs: 12_000, fetcher: fetchPublicPage });
    if (result.httpStatus < 200 || result.httpStatus >= 400) throw new ReportAccessError(502, "report_unavailable");
    return result.report360;
  });
  const origin = deps.publicOrigin || settings?.publicOrigin || "https://gtm.kayroslab.com";
  const available = Boolean(service && sender);

  app.use("/api/report-access", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.get("/api/report-access/status", (_req, res) => res.json({ enabled: available }));

  const sameOrigin = (req: Request, res: Response): boolean => {
    const from = req.get("Origin");
    if (from && from !== origin) { res.status(403).json({ error: "origin_not_allowed" }); return false; }
    return true;
  };

  app.post("/api/report-access/invite", async (req, res) => {
    if (!available || !service || !sender) return res.status(503).json({ error: "mail_not_configured" });
    if (!sameOrigin(req, res)) return;
    if (JSON.stringify(req.body || {}).length > MAX_JSON_LENGTH) return res.status(413).json({ error: "payload_too_large" });
    const body = req.body || {};
    if (typeof body.url !== "string" || typeof body.email !== "string" || !["fr", "en"].includes(body.language)) return res.status(400).json({ error: "invalid_request" });
    const brand = body.brand == null ? null : parseBrand(body.brand);
    if (body.brand != null && !brand) return res.status(400).json({ error: "invalid_brand" });
    const followUp = parseFollowUpChoice(body.followUp);
    if (followUp === null) return res.status(400).json({ error: "invalid_follow_up" });
    const checked = await (deps.validateUrl ?? checkTarget)(body.url);
    if (!checked.ok || !checked.url) return res.status(400).json({ error: "invalid_url" });
    try {
      const snapshotReader: ReportReader = body.auditId !== undefined ? async () => {
        if (!deps.audits) throw new ReportAccessError(503, "audit_jobs_disabled");
        const job = await deps.audits.authorised(body.auditId, body.auditToken);
        if (job.status !== "completed" || !job.result) throw new ReportAccessError(409, "audit_not_ready");
        return job.result.report360;
      } : reader;
      const result = await service.invite({ email: body.email, url: checked.url, language: body.language as ReportLanguage,
        ip: publicClientIp(req), requestKey: req.get("Idempotency-Key"), snapshotId: typeof body.auditId === "string" ? body.auditId : undefined, brand, followUp }, snapshotReader, sender);
      return res.status(201).json({ ok: true, id: result.id, expiresIn: result.expiresIn });
    } catch (error) { return apiError(res, error); }
  });

  app.post("/api/report-access/verify", (req, res) => {
    if (!available || !service) return res.status(503).json({ error: "mail_not_configured" });
    if (!sameOrigin(req, res)) return;
    if (JSON.stringify(req.body || {}).length > MAX_JSON_LENGTH) return res.status(413).json({ error: "payload_too_large" });
    try {
      const result = service.verify(req.body || {});
      res.cookie(COOKIE, result.token, {
        httpOnly: true, secure: origin.startsWith("https:"), sameSite: "strict", path: "/api/report-access",
        maxAge: result.expiresIn * 1000,
      });
      return res.json({ ok: true, expiresIn: result.expiresIn });
    } catch (error) { return apiError(res, error); }
  });

  const authorised = (req: Request, res: Response) => {
    if (!available || !service) { res.status(503).json({ error: "mail_not_configured" }); return null; }
    try { return service.authorisedReport(req.query.id, cookieToken(req)); }
    catch (error) { apiError(res, error); return null; }
  };
  app.get("/api/report-access/report", (req, res) => {
    const result = authorised(req, res);
    if (result) res.json({ report360: result.report, language: result.language, brand: result.brand });
  });
  // J+14/J+28 scheduled plan for a verified session: milestones and dispatch
  // state only; the recipient address itself never leaves the store.
  app.get("/api/report-access/follow-ups", (req, res) => {
    if (!available || !service) return res.status(503).json({ error: "mail_not_configured" });
    if (!sameOrigin(req, res)) return;
    try { return res.json(service.authorisedFollowUps(req.query.id, cookieToken(req))); }
    catch (error) { return apiError(res, error); }
  });
  app.get("/api/report-access/download", async (req, res) => {
    const result = authorised(req, res);
    if (!result) return;
    const format = req.query.format;
    if (format !== "md" && format !== "pdf") return res.status(400).json({ error: "invalid_format" });
    const name = result.brand ? `${brandSlug(result.brand.name)}-rapport-360-${result.language}` : `gtm-growth-report-360-${result.language}`;
    res.setHeader("Content-Disposition", `attachment; filename="${name}.${format}"`);
    if (format === "md") {
      res.type("text/markdown; charset=utf-8").send(renderReportMarkdown(result.report, result.language, { brand: result.brand }));
    } else {
      try { res.type("application/pdf").send(await renderReportPdf(result.report, result.language, { brand: result.brand })); }
      catch { if (!res.headersSent) res.status(500).json({ error: "export_unavailable" }); }
    }
  });
}
