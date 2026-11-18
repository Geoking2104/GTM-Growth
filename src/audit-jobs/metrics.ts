import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "@prometheus-io/client";
export const auditRegistry = new Registry();
collectDefaultMetrics({ register: auditRegistry, prefix: "gtm_growth_" });
export const auditAttempts = new Counter({ name: "gtm_growth_audit_attempts_total", help: "Public audit execution attempts, including retries", labelNames: ["status"], registers: [auditRegistry] });
export const auditCompleted = new Counter({ name: "gtm_growth_audits_completed_total", help: "Successfully committed public audit results", registers: [auditRegistry] });
export const auditDuration = new Histogram({ name: "gtm_growth_audit_duration_seconds", help: "Execution time per audit attempt", labelNames: ["status"], buckets: [1, 5, 10, 20, 40, 80, 120], registers: [auditRegistry] });
export const auditWait = new Histogram({ name: "gtm_growth_audit_wait_seconds", help: "Time from admission to first execution", buckets: [1, 5, 10, 30, 60, 120, 300], registers: [auditRegistry] });
export const auditJobs = new Gauge({ name: "gtm_growth_audit_jobs", help: "Unexpired jobs in the PostgreSQL ledger", labelNames: ["status"], registers: [auditRegistry] });
export const auditHttp = new Histogram({ name: "gtm_growth_audit_http_duration_seconds", help: "Audit and report HTTP latency", labelNames: ["route", "status"], buckets: [0.05, 0.1, 0.5, 1, 5, 15, 30, 120], registers: [auditRegistry] });
