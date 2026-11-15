/** Human-supervised GBP field updates. Dispatch is recorded before network I/O; never replay a write. */
import { randomUUID } from "node:crypto";
import { hash, type LocalState } from "./model.js";
import { readState, updateState } from "./store.js";
import { changeSchema, GoogleBusinessProfile, valueOf, type GbpChange, type GbpProvider } from "./gbp.js";
import { addSnapshot,bindingFingerprint,log,siteBinding } from "./operations.js";
export type Publication={id:string;siteId:string;location:string;language:string;change:GbpChange;before:string;author:string;createdAt:string;scopeHash:string;digest:string;status:"draft"|"approved"|"preflight"|"writing"|"accepted"|"verified"|"conflict"|"uncertain"|"failed"|"cancelled";approval?:{actor:string;at:string;expiresAt:string;digest:string};lease?:string;leaseUntil?:number;dispatchedAt?:string;verifiedAt?:string;error?:string;};
export const publicationDigest=(p:Pick<Publication,"siteId"|"location"|"language"|"change"|"before"|"scopeHash">)=>hash([p.siteId,p.location,p.language,p.change,p.before,p.scopeHash]);
function get(s:LocalState,id:string){const p=s.publications?.find(x=>x.id===id);if(!p)throw new Error("LOCAL_ACCESS");return p;}
function assertCurrent(s:LocalState,p:Publication){const {site,binding}=siteBinding(s,p.siteId);if(p.scopeHash!==bindingFingerprint(s,p.siteId)||binding.location!==p.location||!site.languages.includes(p.language)||p.digest!==publicationDigest(p))throw new Error("LOCAL_CHANGED");}
export async function preparePublication(tenant:string,siteId:string,language:string,raw:unknown,actor:string,provider:GbpProvider=new GoogleBusinessProfile(tenant)) {
  const s=readState(tenant),{site,binding}=siteBinding(s,siteId),change=changeSchema.parse(raw),scopeHash=bindingFingerprint(s,siteId);
  if(!site.languages.includes(language))throw new Error("LOCAL_LANGUAGE");
  const before=valueOf(await provider.read(binding.location),change.field);if(before===change.value)throw new Error("GBP_NO_CHANGE");
  await provider.validate(binding.location,change);
  return updateState(tenant,state=>{if(scopeHash!==bindingFingerprint(state,siteId))throw new Error("LOCAL_CHANGED");
    const entries=state.publications??=[];if(entries.length>=1000)throw new Error("LOCAL_CAPACITY");
    const p:Publication={id:randomUUID(),siteId,location:binding.location,language,change,before,author:actor,createdAt:new Date().toISOString(),scopeHash,digest:"",status:"draft"};p.digest=publicationDigest(p);entries.push(p);log(state,actor,"publication-preview",siteId);return p;
  });
}
export function approvePublication(tenant:string,id:string,digest:string,actor:string,now=Date.now()) {
  return updateState(tenant,s=>{const p=get(s,id);assertCurrent(s,p);if(p.status!=="draft"||p.author===actor||p.digest!==digest)throw new Error("LOCAL_TRANSITION");
    p.approval={actor,at:new Date(now).toISOString(),expiresAt:new Date(now+30*60000).toISOString(),digest:p.digest};p.status="approved";log(s,actor,"publication-approved",p.siteId);return p;
  });
}
export function cancelPublication(tenant:string,id:string,actor:string) {return updateState(tenant,s=>{const p=get(s,id);if(!["draft","approved"].includes(p.status))throw new Error("LOCAL_TRANSITION");p.status="cancelled";delete p.approval;log(s,actor,"publication-cancelled",p.siteId);return p;});}
export async function executePublication(tenant:string,id:string,digest:string,actor:string,provider:GbpProvider=new GoogleBusinessProfile(tenant)) {
  if(process.env.LOCAL_SEO_PUBLISH_ENABLED!=="true")throw new Error("GBP_WRITE_DISABLED");
  const lease=randomUUID();
  const publication=updateState(tenant,s=>{
    const p=get(s,id);assertCurrent(s,p);
    if(p.digest!==digest||!p.approval||p.approval.actor!==actor||p.approval.digest!==p.digest||Date.parse(p.approval.expiresAt)<=Date.now())throw new Error("LOCAL_TRANSITION");
    if(p.status!=="approved")throw new Error("GBP_ALREADY_DISPATCHED");
    if(s.publications?.some(other=>other.id!==p.id&&other.location===p.location&&["preflight","writing","accepted","uncertain"].includes(other.status)))throw new Error("GBP_TARGET_BUSY");
    p.status="preflight";p.lease=lease;p.leaseUntil=Date.now()+180000;log(s,actor,"publication-preflight",p.siteId);return structuredClone(p);
  });
  let dispatched=false;
  try {
    const live=await provider.read(publication.location);
    if(valueOf(live,publication.change.field)!==publication.before) {
      return updateState(tenant,s=>{const p=get(s,id);if(p.lease!==lease)throw new Error("LOCAL_CHANGED");p.status="conflict";log(s,actor,"publication-conflict",p.siteId);return p;});
    }
    await provider.validate(publication.location,publication.change);
    updateState(tenant,s=>{const p=get(s,id);assertCurrent(s,p);
      if(p.lease!==lease||p.status!=="preflight"||Date.parse(p.approval!.expiresAt)<=Date.now()||Date.now()>p.leaseUntil!)throw new Error("LOCAL_CHANGED");
      p.status="writing";p.dispatchedAt=new Date().toISOString();log(s,actor,"publication-dispatched",p.siteId);
    });
    dispatched=true;await provider.write(publication.location,publication.change);
    updateState(tenant,s=>{const p=get(s,id);if(p.lease!==lease)throw new Error("LOCAL_CHANGED");p.status="accepted";log(s,actor,"publication-accepted",p.siteId);});
    return await verifyPublication(tenant,id,actor,provider);
  } catch(e) {
    return updateState(tenant,s=>{const p=get(s,id);if(p.lease===lease){p.status=dispatched?"uncertain":"failed";p.error=e instanceof Error&&/^(GBP_|LOCAL_)/.test(e.message)?e.message:"GBP_UNCERTAIN";log(s,actor,`publication-${p.status}`,p.siteId);}return p;});
  }
}
export async function verifyPublication(tenant:string,id:string,actor:string,provider:GbpProvider=new GoogleBusinessProfile(tenant)) {
  const p=get(readState(tenant),id);assertCurrent(readState(tenant),p);
  if(p.status==="preflight"&&(p.leaseUntil??0)<=Date.now())return updateState(tenant,s=>{const current=get(s,id);if(current.status!=="preflight"||current.dispatchedAt)throw new Error("LOCAL_CHANGED");current.status="failed";current.error="GBP_NOT_DISPATCHED";log(s,actor,"publication-preflight-expired",current.siteId);return current;});
  if(!["writing","accepted","uncertain","verified","conflict"].includes(p.status)||(p.status==="writing"&&(p.leaseUntil??0)>Date.now()))throw new Error("LOCAL_TRANSITION");
  const observed=valueOf(await provider.read(p.location),p.change.field);
  return updateState(tenant,s=>{const current=get(s,id);assertCurrent(s,current);const at=new Date().toISOString();
    current.status=observed===p.change.value?"verified":observed===p.before?"uncertain":"conflict";
    if(current.status==="verified")current.verifiedAt=at;
    addSnapshot(s,{siteId:p.siteId,observedAt:at,source:"system",author:actor,facts:{verification:{expectedHash:hash(p.change.value),observedHash:hash(observed),deadline:new Date(Date.parse(p.dispatchedAt??at)+86400000).toISOString(),readAt:at}}});
    log(s,actor,`publication-${current.status}`,p.siteId);return current;
  });
}
