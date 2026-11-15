import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";import path from "node:path";import {tmpdir} from "node:os";
import {GoogleBusinessProfile,reserveRequest,gbpConfig,type GbpConfig,type GbpProvider} from "../src/local-seo/gbp.js";
import {readState,updateState,closeLocalStores} from "../src/local-seo/store.js";
import {enqueue,synchronize} from "../src/local-seo/operations.js";
import {runJob,localWorkerRouter} from "../src/local-seo/worker.js";
import {createHash} from "node:crypto";
import express from "express";
let dir:string;
const config:GbpConfig={enabled:true,writeEnabled:false,clientId:"client",clientSecret:"secret",refreshToken:"refresh",account:"accounts/1",locations:["locations/1"],requestsPerHour:100};
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"local-worker-"));vi.stubEnv("LOCAL_SEO_PATH",path.join(dir,"db.sqlite3"));});
afterEach(()=>{closeLocalStores();rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
function seed(){updateState("acme",s=>{s.sites=[{id:"one",name:"One",brand:"Brand",country:"BE",languages:["fr-BE"],timezone:"Europe/Brussels",kind:"physical",page:"https://example.com"}];s.bindings={one:{siteId:"one",location:"locations/1",confirmedBy:"a",confirmedAt:new Date().toISOString()}};});}
const provider=():GbpProvider=>({read:vi.fn(async()=>({name:"locations/1",title:"One",websiteUri:"https://example.com"})),validate:vi.fn(async()=>{}),write:vi.fn(async()=>{}),reviews:vi.fn(async()=>({items:[],responseHours:48,complete:true}))});
describe("official GBP transport",()=>{
 it("uses exact Google hosts, readMask and validateOnly; never leaks tokens into records",async()=>{
  const fetcher=vi.fn(async(u:URL|Request|string)=>String(u).includes("oauth2")?response({access_token:"access-secret"}):response({name:"locations/1",title:"One"}));
  const api=new GoogleBusinessProfile("acme",fetcher as typeof fetch,()=>config);
  await api.read("locations/1");await api.validate("locations/1",{field:"websiteUri",value:"https://example.com"});
  expect(String(fetcher.mock.calls[1][0])).toContain("mybusinessbusinessinformation.googleapis.com/v1/locations/1?readMask=");
  expect(String(fetcher.mock.calls[3][0])).toContain("validateOnly=true");expect(JSON.stringify(readState("acme"))).not.toContain("access-secret");
  await expect(api.write("locations/1",{field:"websiteUri",value:"https://example.com"})).rejects.toThrow("GBP_WRITE_DISABLED");
  await expect(api.read("locations/2")).rejects.toThrow("GBP_ACCESS");expect(fetcher).toHaveBeenCalledTimes(4);
 });
 it("fails closed without per-tenant credentials and atomically reserves quota",()=>{
  vi.stubEnv("GBP_CREDENTIALS_DIR",dir);expect(()=>gbpConfig("acme")).toThrow("GBP_UNAVAILABLE");
  writeFileSync(path.join(dir,"acme.json"),JSON.stringify(config));expect(gbpConfig("acme").locations).toEqual(["locations/1"]);expect(()=>gbpConfig("other")).toThrow();
  reserveRequest("acme",1);expect(()=>reserveRequest("acme",1)).toThrow("GBP_QUOTA");expect(readState("acme").gbpUsage?.count).toBe(1);
 });
 it("classifies 429 and never retries writes automatically",async()=>{
  const fetcher=vi.fn(async(u:URL|Request|string)=>String(u).includes("oauth2")?response({access_token:"token"}):response({},429));
  const api=new GoogleBusinessProfile("acme",fetcher as typeof fetch,()=>({...config,writeEnabled:true}));await expect(api.write("locations/1",{field:"phoneNumbers.primaryPhone",value:"+3225550101"})).rejects.toThrow("GBP_QUOTA");expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
describe("durable Node-RED work",()=>{
 it("survives restart, deduplicates enqueue and does not execute another tenant's work",async()=>{
  seed();updateState("acme",s=>{enqueue(s,"one","WF-02","admin");enqueue(s,"one","WF-02","admin");});expect(readState("acme").jobs).toHaveLength(1);closeLocalStores();
  const api=provider();expect(await runJob("other",["WF-02"],api,()=>true)).toEqual({status:"idle"});expect(api.read).not.toHaveBeenCalled();
  expect((await runJob("acme",["WF-02"],api,()=>true)).status).toBe("success");expect(readState("acme").snapshots![0].source).toBe("gbp");expect(api.write).not.toHaveBeenCalled();
 });
 it("revokes queued work after a local scope change and preserves other successes",async()=>{
  seed();updateState("acme",s=>{enqueue(s,"one","WF-07","a");});await runJob("acme",["WF-07"],provider(),()=>true);
  updateState("acme",s=>{enqueue(s,"one","WF-02","a");s.scopeVersion=1;});await runJob("acme",["WF-02"],provider(),()=>true);
  expect(readState("acme").jobs!.map(j=>j.status)).toEqual(["success","revoked"]);
 });
 it("retries quota errors with bounds, records revoked GBP access as evidence",async()=>{
  seed();const api=provider();api.read=vi.fn(async()=>{throw new Error("GBP_QUOTA");});updateState("acme",s=>{enqueue(s,"one","WF-02","a");});
  expect((await runJob("acme",["WF-02"],api,()=>true)).status).toBe("queued");expect(readState("acme").jobs![0].leaseUntil).toBeGreaterThan(Date.now());
  api.read=vi.fn(async()=>{throw new Error("GBP_ACCESS");});await expect(synchronize("acme","one","a",api)).rejects.toThrow("GBP_ACCESS");expect(readState("acme").snapshots!.at(-1)!.facts.sync!.status).toBe("revoked");
 });
 it("binds worker tokens to one tenant and rejects tenant injection and publishing",async()=>{
  const token="a".repeat(40),file=path.join(dir,"workers.json");vi.stubEnv("LOCAL_SEO_WORKERS_FILE",file);writeFileSync(file,JSON.stringify({[createHash("sha256").update(token).digest("hex")]:{tenant:"acme",workflows:["WF-02"]}}));
  const execute=vi.fn(async()=>({status:"idle"}));const app=express();app.use(express.json());app.use(localWorkerRouter(execute));
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const address=server.address() as {port:number};
  const send=(body:unknown,t=token)=>fetch(`http://127.0.0.1:${address.port}/tick`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify(body)});
  try{expect((await send({workflow:"WF-02",tenant:"other"})).status).toBe(400);expect((await send({workflow:"WF-08"})).status).toBe(400);expect((await send({workflow:"WF-02"},"b".repeat(40))).status).toBe(403);expect((await send({workflow:"WF-02"})).status).toBe(200);expect(execute).toHaveBeenCalledWith("acme",["WF-02"]);}finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
});
