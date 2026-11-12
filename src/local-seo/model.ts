import { createHash } from "node:crypto";
import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const language = z.string().max(35).refine(v => { try { return Intl.getCanonicalLocales(v).length === 1; } catch { return false; } });
export const siteSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), name: text, brand: text,
  country: z.string().regex(/^[A-Z]{2}$/), languages: z.array(language).min(1).max(20),
  timezone: z.string().max(80).refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }),
  kind: z.enum(["physical", "service-area", "web-only"]), page: z.string().url().max(2048),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  // Private addresses are deliberately not accepted or stored by this module.
}).strict();
export type Site = z.infer<typeof siteSchema>;
const point = z.object({ id: text, latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), status: z.enum(["found", "not-found", "error", "unresolved"]), rank: z.number().int().positive().optional() }).strict();
export const observationSchema = z.object({
  siteId: text, source: text, method: text, observedAt: z.string().datetime({ offset: true }),
  language: language.optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(),
  surface: z.enum(["maps", "local-pack", "organic"]), query: text,
  device: z.enum(["desktop", "mobile"]).optional(), depth: z.number().int().min(1).max(1000),
  identity: text.optional(), points: z.array(point).min(1).max(1000),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.points.map(p => p.id)).size !== v.points.length) ctx.addIssue({ code: "custom", message: "Duplicate point" });
  if (Date.parse(v.observedAt) > Date.now() + 60000) ctx.addIssue({ code: "custom", message: "Future observation" });
  for (const p of v.points) if (p.status === "found" ? !p.rank || p.rank > v.depth : p.rank !== undefined) ctx.addIssue({ code: "custom", message: "Invalid rank for collection status" });
});
export type Observation = z.infer<typeof observationSchema> & { id: string; author: string; importedAt: string; hash: string };
export type Action = { id: string; siteId: string; title: string; content: string; language: string; owner: string; due: string; evidence: string[]; author: string; version: number; status: "draft" | "submitted" | "approved" | "rejected" | "manual-pending"; approval?: { author: string; hash: string; at: string }; };
export type LocalState = { sites: Site[]; grants: Record<string, string[]>; observations: Observation[]; actions: Action[]; audit: Array<{ at: string; actor: string; event: string; target: string }> };
export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function metrics(o: Pick<Observation, "points" | "depth" | "identity">) {
  const valid = o.identity ? o.points.filter(p => p.status === "found" || p.status === "not-found") : [];
  const ranks = valid.filter(p => p.status === "found").map(p => p.rank!).sort((a,b) => a-b);
  const n = valid.length, r = ranks.length;
  return { planned: o.points.length, valid: n, found: r, coverage: o.points.length ? 100*n/o.points.length : null,
    presence: n ? 100*r/n : null, top3: n ? 100*ranks.filter(r => r <= 3).length/n : null,
    median: r ? (ranks[Math.floor((r-1)/2)] + ranks[Math.floor(r/2)])/2 : null,
    visibility: n ? 100*ranks.reduce((sum,r) => sum + Math.max(0,(o.depth+1-r)/o.depth),0)/n : null };
}
export function series(o: z.infer<typeof observationSchema>) {
  if (!o.language || !o.country || !o.device || !o.identity || (o.surface === "maps" && o.points.some(p => p.latitude === undefined || p.longitude === undefined))) return null;
  return hash([o.siteId,o.source,o.method,o.language,o.country,o.surface,o.query,o.device,o.depth,o.identity,
    [...o.points].sort((a,b) => a.id.localeCompare(b.id, "en")).map(p => [p.id,p.latitude,p.longitude])]);
}
export function compare(a: Observation, b: Observation) {
  const comparable = series(a) !== null && series(a) === series(b) && Date.parse(b.observedAt) > Date.parse(a.observedAt);
  const x = metrics(a), y = metrics(b);
  return { comparable, deltaTop3: comparable && x.top3 !== null && y.top3 !== null ? y.top3 - x.top3 : null };
}
export function approvalHash(a: Action) { return hash([a.siteId, a.title, a.content, a.language, a.owner, a.due, a.evidence, a.version]); }
