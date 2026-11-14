/** Official GBP API only. Operator-mounted OAuth credentials never enter console state. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { validTenantId } from "../tenants/store.js";
import { updateState } from "./store.js";
const locationName = z.string().regex(/^locations\/[0-9]+$/);
const configSchema = z.object({ enabled:z.literal(true), writeEnabled:z.boolean().default(false), clientId:z.string().min(1), clientSecret:z.string().min(1), refreshToken:z.string().min(1), account:z.string().regex(/^accounts\/[0-9]+$/), locations:z.array(locationName).min(1).max(1000), requestsPerHour:z.number().int().min(1).max(10000).default(100) }).strict();
export type GbpConfig = z.infer<typeof configSchema>;
export function gbpConfig(tenant: string): GbpConfig {
  if(!validTenantId(tenant)||!process.env.GBP_CREDENTIALS_DIR)throw new Error("GBP_UNAVAILABLE");
  try { const file=path.join(process.env.GBP_CREDENTIALS_DIR,`${tenant}.json`);return configSchema.parse(JSON.parse(fs.readFileSync(file,"utf8"))); } catch { throw new Error("GBP_UNAVAILABLE"); }
}
export function gbpCapability(tenant:string) { try {const c=gbpConfig(tenant);return {state:"configured",writeEnabled:c.writeEnabled,locations:c.locations};}catch{return {state:"unavailable",writeEnabled:false,locations:[]};} }
export const changeSchema=z.object({ field:z.enum(["websiteUri","phoneNumbers.primaryPhone"]),value:z.string().min(1).max(2048) }).strict().superRefine((v,ctx)=>{
  if(v.field==="phoneNumbers.primaryPhone" ? !/^\+[1-9]\d{6,14}$/.test(v.value) : (()=>{try{const u=new URL(v.value);return u.protocol!=="https:"||!!u.username||!!u.password;}catch{return true;}})()) ctx.addIssue({code:"custom",message:"Invalid GBP change"});
});
export type GbpChange=z.infer<typeof changeSchema>;
export type GbpLocation={ name:string;title?:string;websiteUri?:string;phoneNumbers?:{primaryPhone?:string};languageCode?:string;regularHours?:{periods?:Array<{openDay?:string;closeDay?:string;openTime?:{hours?:number;minutes?:number};closeTime?:{hours?:number;minutes?:number}}>};metadata?:{placeId?:string} };
export interface GbpProvider { read(location:string):Promise<GbpLocation>; validate(location:string,change:GbpChange):Promise<void>; write(location:string,change:GbpChange):Promise<void>; reviews(location:string):Promise<{items:Array<{id:string;createdAt:string;replyExpected:boolean;replied:boolean}>;complete:boolean;responseHours:number}>; }
export function valueOf(location:GbpLocation,field:GbpChange["field"]) {return field==="websiteUri"?location.websiteUri??"":location.phoneNumbers?.primaryPhone??"";}
export function reserveRequest(tenant:string,limit:number,now=Date.now()) {
  updateState(tenant,s=>{ const period=Math.floor(now/3600000);if(s.gbpUsage?.period!==period)s.gbpUsage={period,count:0};if(s.gbpUsage.count>=limit)throw new Error("GBP_QUOTA");s.gbpUsage.count++; });
}
async function json(response:Response):Promise<Record<string,unknown>> {
  if(!response.ok)throw new Error(response.status===429?"GBP_QUOTA":response.status===401||response.status===403?"GBP_ACCESS":"GBP_REMOTE");
  if(!response.body)throw new Error("GBP_REMOTE");const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1024*1024){await reader.cancel();throw new Error("GBP_RESPONSE_LIMIT");}chunks.push(r.value);}
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"); }catch{throw new Error("GBP_REMOTE");}
}
export class GoogleBusinessProfile implements GbpProvider {
  constructor(private tenant:string,private fetcher:typeof fetch=fetch,private configuration=gbpConfig,private reserve=reserveRequest){}
  private async request(location:string,method:"GET"|"PATCH",suffix:string,body?:unknown,write=false,review=false,performance=false) {
    const c=this.configuration(this.tenant);locationName.parse(location);
    if(!c.locations.includes(location))throw new Error("GBP_ACCESS");if(write&&!c.writeEnabled)throw new Error("GBP_WRITE_DISABLED");
    this.reserve(this.tenant,c.requestsPerHour);
    let token:Record<string,unknown>;
    try { const tokenResponse=await this.fetcher("https://oauth2.googleapis.com/token",{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:c.refreshToken,grant_type:"refresh_token"})});
      if([400,401,403].includes(tokenResponse.status))throw new Error("GBP_ACCESS");token=await json(tokenResponse);
    }catch(e){if(e instanceof Error&&/^GBP_/.test(e.message))throw e;throw new Error("GBP_REMOTE");}
    if(typeof token.access_token!=="string")throw new Error("GBP_ACCESS");
    this.reserve(this.tenant,c.requestsPerHour);
    const base=performance?`https://businessprofileperformance.googleapis.com/v1/${location}`:review?`https://mybusiness.googleapis.com/v4/${c.account}/${location}`:`https://mybusinessbusinessinformation.googleapis.com/v1/${location}`;
    try {return await json(await this.fetcher(base+suffix,{method,redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})}));}
    catch(e){if(e instanceof Error&&/^GBP_/.test(e.message))throw e;throw new Error("GBP_UNCERTAIN");}
  }
  async read(location:string):Promise<GbpLocation> {
    const data=await this.request(location,"GET","?readMask=name,title,websiteUri,phoneNumbers,regularHours,languageCode,metadata");
    if(data.name!==location)throw new Error("GBP_IDENTITY");
    const time=z.object({hours:z.number().int().min(0).max(24).optional(),minutes:z.number().int().min(0).max(59).optional()});
    const parsed=z.object({name:locationName,title:z.string().max(1000).optional(),websiteUri:z.string().max(2048).optional(),phoneNumbers:z.object({primaryPhone:z.string().max(100).optional()}).optional(),languageCode:z.string().max(35).optional(),metadata:z.object({placeId:z.string().max(200).optional()}).optional(),regularHours:z.object({periods:z.array(z.object({openDay:z.string().optional(),closeDay:z.string().optional(),openTime:time.optional(),closeTime:time.optional()})).max(100).optional()}).optional()}).safeParse(data);
    if(!parsed.success)throw new Error("GBP_REMOTE");return parsed.data;
  }
  private patch(location:string,change:GbpChange,validate:boolean) {
    const c=changeSchema.parse(change),body=c.field==="websiteUri"?{websiteUri:c.value}:{phoneNumbers:{primaryPhone:c.value}};
    return this.request(location,"PATCH",`?updateMask=${encodeURIComponent(c.field)}&validateOnly=${validate}`,body,!validate);
  }
  async validate(location:string,change:GbpChange){await this.patch(location,change,true);}
  async write(location:string,change:GbpChange){await this.patch(location,change,false);}
  /** On-demand dashboard reads: never persisted, no reviewer names or comments returned. */
  async dashboardReviews(location:string) {
    return this.request(location,"GET","/reviews?pageSize=50&orderBy=updateTime%20desc",undefined,false,true);
  }
  async dashboardPerformance(location:string,query:URLSearchParams) {
    return this.request(location,"GET",`:fetchMultiDailyMetricsTimeSeries?${query}`,undefined,false,false,true);
  }
  async reviews(location:string) {
    const items:Array<{id:string;createdAt:string;replyExpected:boolean;replied:boolean}>=[];let token="";
    for(let i=0;i<10;i++){
      const data=await this.request(location,"GET",`/reviews?pageSize=50${token?`&pageToken=${encodeURIComponent(token)}`:""}`,undefined,false,true);
      const rows=z.array(z.object({reviewId:z.string(),createTime:z.string().datetime({offset:true}),reviewReply:z.object({comment:z.string().optional()}).optional()})).max(50).parse(data.reviews??[]);
      items.push(...rows.map(r=>({id:r.reviewId,createdAt:r.createTime,replyExpected:true,replied:!!r.reviewReply?.comment})));
      token=typeof data.nextPageToken==="string"?data.nextPageToken:"";if(!token)return {items,complete:true,responseHours:48};
    }return {items,complete:false,responseHours:48};
  }
}
