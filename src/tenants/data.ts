/** Per-tenant data access: leads and generated reports are always filtered by tenant. */

import fs from "node:fs";
import path from "node:path";
import { readLeads, type Lead } from "../leads/store.js";
import { tenantOwnsUrl, validTenantId, type Tenant } from "./store.js";

const reportsRoot = () => process.env.REPORTS_PATH ?? "data/reports";

/** Leads whose website belongs to the tenant's domains. */
export function tenantLeads(tenant: Tenant, file = process.env.LEADS_PATH ?? "data/leads.jsonl", limit = 500): Lead[] {
  return readLeads(file, 10_000).filter((lead) => lead.website && tenantOwnsUrl(tenant, lead.website)).slice(-limit);
}

function tenantDir(tenantId: string): string {
  if (!validTenantId(tenantId)) throw new Error("tenant invalide");
  return path.join(reportsRoot(), tenantId);
}

export function saveTenantReport(tenantId: string, url: string, pdf: Buffer): string {
  const dir = tenantDir(tenantId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, "-")}_${new URL(url).hostname}.pdf`;
  fs.writeFileSync(path.join(dir, name), pdf, { mode: 0o600 });
  return name;
}

export function listTenantReports(tenantId: string): { file: string; bytes: number; createdAt: string }[] {
  const dir = tenantDir(tenantId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((file) => { const st = fs.statSync(path.join(dir, file)); return { file, bytes: st.size, createdAt: st.mtime.toISOString() }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readTenantReport(tenantId: string, file: string): Buffer {
  if (!/^[\w.-]+\.pdf$/.test(file) || file.includes("..")) throw new Error("fichier invalide");
  return fs.readFileSync(path.join(tenantDir(tenantId), file));
}
