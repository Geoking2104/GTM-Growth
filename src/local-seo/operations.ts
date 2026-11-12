import { randomUUID } from "node:crypto";
import { hash, type LocalState, type Site } from "./model.js";
import { readState,updateState } from "./store.js";
import { factsSchema, type Snapshot, type Facts, evaluateControls, summarizeControls } from "./controls.js";
import { GoogleBusinessProfile, type GbpProvider } from "./gbp.js";
export type Binding={siteId:string;location:string;confirmedBy:string;confirmedAt:string};
export type LocalJob={id:string;siteId:string;workflow:"WF-02"|"WF-03"|"WF-07"|"WF-09"|"WF-10";scopeVersion:number;status:"queued"|"running"|"success"|"failed"|"revoked";attempt:number;createdAt:string;leaseUntil?:number;lease?:string;error?:string;finishedAt?:string;};
export function log(s:LocalState,actor:string,event:string,target:string) { if(s.audit.length>=50000)throw new Error("LOCAL_CAPACITY");s.audit.push({at:new Date().toISOString(),actor,event,target}); }
export function addSnapshot(s:LocalState,input:Omit<Snapshot,"id">) {const entries=s.snapshots??=[];if(entries.length>=5000)throw new Error("LOCAL_CAPACITY");const snapshot={...input,facts:factsSchema.parse(input.facts),id:randomUUID()};entries.push(snapshot);return snapshot;}
export function siteBinding(s:LocalState,siteId:string) {const site=s.sites.find(x=>x.id===siteId),binding=s.bindings?.[siteId];if(!site||!binding||site.kind==="web-only")throw new Error("GBP_UNBOUND");return {site,binding};}
const days=["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"];
export async function synchronize(tenant:string,siteId:string,actor:string,provider:GbpProvider=new GoogleBusinessProfile(tenant),reviews=false) {
  const old=readState(tenant),{site,binding}=siteBinding(old,siteId),scopeVersion=old.scopeVersion??0;
  let data;
  try { data=await provider.read(binding.location); }
  catch(error) {
    updateState(tenant,s=>{if((s.scopeVersion??0)===scopeVersion){const at=new Date().toISOString();addSnapshot(s,{siteId,observedAt:at,source:"gbp",author:actor,facts:{sync:{status:error instanceof Error&&error.message==="GBP_ACCESS"?"revoked":"error",at}}});log(s,actor,"gbp-read-failed",siteId);}});
    throw error;
  }
  const at=new Date().toISOString();
  const facts:Facts={identity:{externalId:binding.location,confirmed:true,matches:Object.values(old.bindings??{}).filter(x=>x.location===binding.location).length},sync:{status:"success",at},collection:{lastSuccess:at,cadenceHours:24},name:{expected:site.name,observed:data.title??""},url:{expected:site.page,observed:data.websiteUri??""}};
  if(site.phone&&data.phoneNumbers?.primaryPhone)facts.phone={expected:site.phone,observed:data.phoneNumbers.primaryPhone,country:site.country};
  if(data.regularHours?.periods?.length){const intervals:Array<{day:number;start:number;end:number}>=[];let valid=true;
    for(const p of data.regularHours.periods){const day=days.indexOf(p.openDay??""),endDay=days.indexOf(p.closeDay??""),start=(p.openTime?.hours??0)*60+(p.openTime?.minutes??0),end=(p.closeTime?.hours??0)*60+(p.closeTime?.minutes??0);
      if(day<0||endDay<0){valid=false;break;}if(day===endDay)intervals.push({day,start,end});else if(endDay===(day+1)%7){intervals.push({day,start,end:1440});if(end>0)intervals.push({day:endDay,start:0,end});}else {valid=false;break;}}
    if(valid)facts.hours={timezone:site.timezone,intervals};
  }
  let reviewError:unknown;
  if(reviews) {try{facts.reviews=await provider.reviews(binding.location);}catch(e){facts.reviews={items:[],complete:false,responseHours:48};reviewError=e;}}

  const saved=updateState(tenant,s=>{if((s.scopeVersion??0)!==scopeVersion||s.bindings?.[siteId]?.location!==binding.location)throw new Error("LOCAL_CHANGED");const snapshot=addSnapshot(s,{siteId,observedAt:at,facts,source:"gbp",author:actor});log(s,actor,"gbp-sync",siteId);return snapshot;});
  if(reviewError)throw reviewError;return saved;
}
export function findingsFor(s:LocalState,site:Site,now=Date.now()) {const findings=evaluateControls(site,s.snapshots??[],s.observations,now);return {siteId:site.id,findings,summary:summarizeControls(findings),evaluatedAt:new Date(now).toISOString()};}
export function enqueue(s:LocalState,siteId:string,workflow:LocalJob["workflow"],actor:string) {
  const jobs=s.jobs??=[];const existing=jobs.find(j=>j.siteId===siteId&&j.workflow===workflow&&["queued","running"].includes(j.status));if(existing)return existing;
  if(jobs.length>=5000)throw new Error("LOCAL_CAPACITY");const j:LocalJob={id:randomUUID(),siteId,workflow,scopeVersion:s.scopeVersion??0,status:"queued",attempt:0,createdAt:new Date().toISOString()};jobs.push(j);log(s,actor,"job-created",siteId);return j;
}
export const bindingFingerprint=(s:LocalState,siteId:string)=>hash([s.scopeVersion??0,s.sites.find(x=>x.id===siteId),s.bindings?.[siteId]]);
