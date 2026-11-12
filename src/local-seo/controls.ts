/** LOC policy v1: pure deterministic evaluation over dated, attributed evidence. */
import { z } from "zod";
import type { Site, Observation } from "./model.js";
import { compare, metrics } from "./model.js";
const text = z.string().max(2048), instant = z.string().datetime({ offset: true });
const pair = z.object({ expected: text, observed: text }).strict();
const hours = z.object({ day: z.number().int().min(0).max(6), start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) }).strict();
export const factsSchema = z.object({
  identity: z.object({ externalId: text, confirmed: z.boolean(), matches: z.number().int().min(0) }).strict().optional(),
  sync: z.object({ status: z.enum(["success","error","revoked"]), at: instant }).strict().optional(),
  collection: z.object({ lastSuccess: instant, cadenceHours: z.number().positive().max(8760) }).strict().optional(),
  name: pair.optional(), phone: pair.extend({ country: z.string().regex(/^[A-Z]{2}$/), exceptionUntil: instant.optional() }).strict().optional(),
  address: pair.extend({ normalizer: z.enum(["components-v1","unsupported"]), country: z.string().regex(/^[A-Z]{2}$/) }).strict().optional(),
  privacy: z.object({ privateAddress: z.boolean(), publicFields: z.array(text).max(100), forbiddenValues: z.array(text).max(20) }).strict().optional(),
  hours: z.object({ timezone: text, intervals: z.array(hours).max(100) }).strict().optional(),
  calendar: z.object({ approved: z.boolean(), requiredDates: z.array(z.string().date()).max(100), confirmedDates: z.array(z.string().date()).max(100) }).strict().optional(),
  url: pair.optional(),
  reviews: z.object({ complete: z.boolean(), responseHours: z.number().positive().max(8760), items: z.array(z.object({ id: text, createdAt: instant, replyExpected: z.boolean(), replied: z.boolean() }).strict()).max(1000) }).strict().optional(),
  indexing: z.object({ expected: z.boolean(), status: z.number().int().min(100).max(599), robotsAllowed: z.boolean(), noindex: z.boolean() }).strict().optional(),
  canonical: pair.optional(),
  hreflang: z.object({ expected: z.array(text).min(1).max(100), observed: z.array(z.object({ url: text, reciprocal: z.boolean(), status: z.number().int() }).strict()).max(100) }).strict().optional(),
  schema: z.object({ applicable: z.boolean(), identityConfirmed: z.boolean(), expected: text, observed: text }).strict().optional(),
  links: z.object({ expected: z.boolean(), coverageComplete: z.boolean(), inbound: z.number().int().min(0) }).strict().optional(),
  citations: z.array(z.object({ url: z.string().url(), at: instant, identityConfirmed: z.boolean(), expected: text, observed: text }).strict()).min(1).max(100).optional(),
  duplicates: z.object({ exactIds: z.array(text).max(1000), ambiguous: z.boolean() }).strict().optional(),
  workflows: z.array(z.object({ id: text, deadline: instant, status: z.enum(["queued","running","success","failed","revoked","unavailable"]) }).strict()).min(1).max(1000).optional(),
  verification: z.object({ expectedHash: text, observedHash: text.optional(), deadline: instant, readAt: instant.optional() }).strict().optional(),
  execution: z.object({ connector: text, reserved: z.boolean(), qualified: z.boolean() }).strict().optional(),
  publication: z.object({ language: text, approvedHash: text, currentHash: text, expiresAt: instant, rightsValid: z.boolean() }).strict().optional(),
  claims: z.object({ ai: z.boolean(), factual: z.array(z.object({ text, evidenceIds: z.array(text).max(20) }).strict()).max(100), accessibleEvidenceIds: z.array(text).max(1000) }).strict().optional(),
}).strict();
export type Facts = z.infer<typeof factsSchema>;
export const snapshotSchema = z.object({ siteId: z.string().max(80), observedAt: instant, facts: factsSchema }).strict().refine(x=>Date.parse(x.observedAt)<=Date.now()+60000,"Future evidence");
export type Snapshot = z.infer<typeof snapshotSchema> & { id: string; source: "declared" | "gbp" | "system"; author: string };
export type Finding = { id: string; policy: string; status: "pass" | "fail" | "unknown" | "not-applicable"; reason: string; evidence: string[]; provenance: string[] };
export const CONTROL_NAMES = ["Identity","GBP access","Freshness","Name","Phone","Public address","Private address","Opening hours","Special hours","Website URL","Review replies","Indexability","Canonical","Hreflang","Structured identity","Internal links","Citations","Duplicates","Visibility change","Workflow completion","Post-write verification","Free connector and quota","Publication approval","AI evidence"];
const normal = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
const url = (s: string) => { try { return new URL(s).href; } catch { return null; } };
export function evaluateControls(site: Site, snapshots: Snapshot[], ranks: Observation[], now = Date.now()): Finding[] {
  const results: Finding[] = []; const applicable = site.kind !== "web-only";
  const run = <K extends keyof Facts>(n: number, key: K, check: (v: NonNullable<Facts[K]>) => boolean | "unknown" | "not-applicable", applies = true, maxAge = 48*3600000) => {
    const f: Finding = { id: `LOC-${String(n).padStart(2,"0")}`, policy: "loc-v1", status:"unknown",reason:"missing-evidence",evidence:[],provenance:[] };
    if(!applies) { f.status="not-applicable";f.reason="web-only"; }
    else {
      const s = snapshots.filter(s=>s.siteId===site.id && s.facts[key]!==undefined).reverse().sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
      if(s) { f.evidence=[s.id];f.provenance=[s.source];
        if(now-Date.parse(s.observedAt)>maxAge || Date.parse(s.observedAt)>now) f.reason="stale-evidence";
        else { const v=check(s.facts[key] as NonNullable<Facts[K]>); f.status=typeof v==="boolean"?(v?"pass":"fail"):v;f.reason=f.status==="unknown"?"insufficient-evidence":f.status==="not-applicable"?"explicit-applicability":"evaluated"; }
      }
    } results.push(f);
  };
  run(1,"identity",v=>v.confirmed&&v.externalId&&v.matches===1?true:"unknown",applicable);
  run(2,"sync",v=>Date.parse(v.at)>now?"unknown":v.status==="success" && now-Date.parse(v.at)<=86400000,applicable);
  run(3,"collection",v=>Date.parse(v.lastSuccess)>now?"unknown":now-Date.parse(v.lastSuccess)<=v.cadenceHours*2*3600000);
  run(4,"name",v=>normal(v.expected)===normal(v.observed),applicable);
  run(5,"phone",v=>v.country!==site.country?"unknown":v.exceptionUntil&&Date.parse(v.exceptionUntil)>now?true:!/^\+[1-9]\d{6,14}$/.test(v.expected)||!/^\+[1-9]\d{6,14}$/.test(v.observed)?"unknown":v.expected===v.observed,applicable);
  run(6,"address",v=>v.country!==site.country||v.normalizer==="unsupported"?"unknown":normal(v.expected)===normal(v.observed),site.kind==="physical");
  run(7,"privacy",v=>!v.privateAddress?"not-applicable":v.forbiddenValues.length===0?"unknown":!v.forbiddenValues.some(x=>x.trim()&&v.publicFields.some(y=>normal(y).includes(normal(x)))),site.kind==="service-area");
  run(8,"hours",v=>{
    try { new Intl.DateTimeFormat("en",{timeZone:v.timezone}); } catch { return false; }
    if(v.timezone!==site.timezone||!v.intervals.length)return false;
    const sorted=[...v.intervals].sort((a,b)=>a.day-b.day||a.start-b.start);
    return sorted.every((x,i)=>x.end>x.start && (!i||x.day!==sorted[i-1].day||x.start>=sorted[i-1].end));
  },applicable);
  run(9,"calendar",v=>!v.approved?"unknown":v.requiredDates.filter(d=>Date.parse(d)>=now-86400000&&Date.parse(d)<=now+30*86400000).every(d=>v.confirmedDates.includes(d)),applicable);
  run(10,"url",v=>!url(v.expected)||!url(v.observed)?"unknown":url(v.expected)===url(v.observed),applicable);
  run(11,"reviews",v=>!v.complete?"unknown":v.items.every(r=>!r.replyExpected||r.replied||now-Date.parse(r.createdAt)<=v.responseHours*3600000),applicable);
  run(12,"indexing",v=>!v.expected?"not-applicable":v.status===200&&v.robotsAllowed&&!v.noindex);
  run(13,"canonical",v=>!url(v.expected)||!url(v.observed)?"unknown":url(v.expected)===url(v.observed));
  run(14,"hreflang",v=>v.expected.every(e=>v.observed.some(o=>url(e)&&url(o.url)===url(e)&&o.reciprocal&&o.status===200)));
  run(15,"schema",v=>!v.applicable?"not-applicable":!v.identityConfirmed?"unknown":normal(v.expected)===normal(v.observed),applicable);
  run(16,"links",v=>!v.expected?"not-applicable":v.inbound>0?true:v.coverageComplete?false:"unknown");
  run(17,"citations",v=>v.some(c=>!c.identityConfirmed||now-Date.parse(c.at)>48*3600000)?"unknown":v.every(c=>normal(c.expected)===normal(c.observed)),applicable);
  run(18,"duplicates",v=>new Set(v.exactIds).size!==v.exactIds.length?false:v.ambiguous?"unknown":true,applicable);
  const recent=ranks.filter(r=>r.siteId===site.id).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  const current=recent[0], previous=current&&recent.slice(1).find(r=>compare(r,current).comparable);
  const delta=previous&&current?compare(previous,current).deltaTop3:null;
  results.push({id:"LOC-19",policy:"loc-v1",status:!applicable?"not-applicable":!current||!previous||delta===null||now-Date.parse(current.observedAt)>48*3600000||metrics(current).coverage!<90||metrics(previous).coverage!<90?"unknown":delta<=-15?"fail":"pass",reason:!applicable?"web-only":delta===null?"non-comparable":"rank-change",evidence:current&&previous?[previous.id,current.id]:[],provenance:["declared"]});
  run(20,"workflows",v=>v.every(w=>Date.parse(w.deadline)>now||w.status==="success"));
  run(21,"verification",v=>!v.observedHash||!v.readAt?Date.parse(v.deadline)>now?"unknown":false:Date.parse(v.readAt)>now?"unknown":v.expectedHash===v.observedHash);
  run(22,"execution",v=>["gbp","gsc","verified-web","import","template"].includes(v.connector)&&v.qualified&&v.reserved);
  run(23,"publication",v=>site.languages.includes(v.language)&&v.approvedHash===v.currentHash&&Date.parse(v.expiresAt)>now&&v.rightsValid);
  run(24,"claims",v=>!v.ai?"not-applicable":v.factual.every(c=>c.evidenceIds.length>0&&c.evidenceIds.every(id=>v.accessibleEvidenceIds.includes(id))));
  return results.sort((a,b)=>a.id.localeCompare(b.id,"en"));
}
export function summarizeControls(findings: Finding[]) {
  const pass=findings.filter(f=>f.status==="pass").length,fail=findings.filter(f=>f.status==="fail").length,unknown=findings.filter(f=>f.status==="unknown").length;
  const evaluated=pass+fail,applicable=evaluated+unknown,coverage=applicable?100*evaluated/applicable:null;
  return { pass, fail, unknown, coverage, conformity:evaluated?100*pass/evaluated:null, reliable:coverage!==null&&coverage>=80 };
}
