/** Private Node-RED polling bridge. Worker tokens resolve one tenant and allowed commands server-side. */
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Router } from "express";
import { TenantStore,validTenantId } from "../tenants/store.js";
import { readState,updateState } from "./store.js";
import { synchronize,findingsFor,log } from "./operations.js";
import { verifyPublication } from "./publication.js";
import { type GbpProvider,GoogleBusinessProfile } from "./gbp.js";
export const workflows=["WF-02","WF-03","WF-07","WF-09","WF-10"] as const;
const workerSchema=z.record(z.string().regex(/^[a-f0-9]{64}$/),z.object({tenant:z.string().refine(validTenantId),workflows:z.array(z.enum(workflows)).min(1)}).strict());
export async function runJob(tenant:string,allowed:readonly string[],provider:GbpProvider=new GoogleBusinessProfile(tenant),active:()=>boolean=()=>new TenantStore().get(tenant)?.status==="active") {
  if(!active())throw new Error("LOCAL_ACCESS");const now=Date.now(),lease=randomUUID();
  const job=updateState(tenant,s=>{
    for(const j of s.jobs??[])if(j.status==="running"&&(j.leaseUntil??0)<=now&&j.attempt>=3){j.status="failed";j.error="GBP_RETRY_EXHAUSTED";}
    if(s.jobs?.some(j=>j.status==="running"&&(j.leaseUntil??0)>now))return null;
    const next=s.jobs?.find(j=>allowed.includes(j.workflow)&&((j.status==="queued"&&(j.leaseUntil??0)<=now)||(j.status==="running"&&(j.leaseUntil??0)<=now))&&j.attempt<3);
    if(!next)return null;
    if(next.scopeVersion!==(s.scopeVersion??0)||!s.sites.some(x=>x.id===next.siteId)){next.status="revoked";log(s,"worker","job-revoked",next.siteId);return null;}
    next.status="running";next.attempt++;next.lease=lease;next.leaseUntil=now+600000;return structuredClone(next);
  });
  if(!job)return {status:"idle"};
  const valid=()=>active() && (readState(tenant).scopeVersion??0)===job.scopeVersion;
  try {
    if(!valid())throw new Error("LOCAL_ACCESS");
    if(job.workflow==="WF-02"||job.workflow==="WF-03")await synchronize(tenant,job.siteId,"worker",provider,job.workflow==="WF-03");
    else if(job.workflow==="WF-09") {
      const pending=readState(tenant).publications?.filter(p=>p.siteId===job.siteId&&(["accepted","uncertain"].includes(p.status)||(["writing","preflight"].includes(p.status)&&(p.leaseUntil??0)<Date.now())))??[];
      for(const p of pending){if(!valid())throw new Error("LOCAL_ACCESS");await verifyPublication(tenant,p.id,"worker",provider);}
    } else {
      const s=readState(tenant),site=s.sites.find(x=>x.id===job.siteId)!;const report=findingsFor(s,site);
      updateState(tenant,current=>{if((current.scopeVersion??0)!==job.scopeVersion)throw new Error("LOCAL_CHANGED");current.controlReports??={};current.controlReports[job.siteId]=report;});
    }
    if(!valid())throw new Error("LOCAL_ACCESS");
    return updateState(tenant,s=>{const j=s.jobs!.find(j=>j.id===job.id)!;if(j.lease!==lease)throw new Error("LOCAL_CHANGED");j.status="success";j.finishedAt=new Date().toISOString();log(s,"worker","job-success",j.siteId);return {jobId:j.id,status:j.status};});
  }catch(e){
    const code=e instanceof Error&&/^(GBP_|LOCAL_)/.test(e.message)?e.message:"GBP_REMOTE";
    return updateState(tenant,s=>{const j=s.jobs!.find(j=>j.id===job.id)!;if(j.lease!==lease)return {jobId:j.id,status:j.status};
      const revoked=["LOCAL_ACCESS","LOCAL_CHANGED","GBP_ACCESS","GBP_UNAVAILABLE","GBP_UNBOUND"].includes(code);
      j.status=revoked?"revoked":j.attempt<3?"queued":"failed";j.error=code;j.leaseUntil=Date.now()+(code==="GBP_QUOTA"?3600000:60000);log(s,"worker",`job-${j.status}`,j.siteId);return {jobId:j.id,status:j.status,error:code};});
  }
}
export function localWorkerRouter(execute:typeof runJob=runJob) {
  const router=Router();
  router.post("/tick",async(req,res)=>{
    try {
      const file=process.env.LOCAL_SEO_WORKERS_FILE;if(!file)return res.status(503).json({error:"WORKER_UNAVAILABLE"});
      const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];if(!token)return res.status(401).json({error:"LOCAL_ACCESS"});
      const configs=workerSchema.parse(JSON.parse(fs.readFileSync(file,"utf8"))),worker=configs[createHash("sha256").update(token).digest("hex")];
      if(!worker)return res.status(403).json({error:"LOCAL_ACCESS"});
      const input=z.object({workflow:z.enum(workflows)}).strict().parse(req.body);
      if(!worker.workflows.includes(input.workflow))return res.status(403).json({error:"LOCAL_ACCESS"});
      return res.json(await execute(worker.tenant,[input.workflow]));
    }catch(e){return res.status(e instanceof z.ZodError?400:503).json({error:e instanceof z.ZodError?"LOCAL_INVALID":"WORKER_UNAVAILABLE"});}
  });return router;
}
