import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { localSeoRoutes } from "../src/console/local-seo.js";
import { closeLocalStores } from "../src/local-seo/store.js";
import { metrics, compare, observationSchema, series } from "../src/local-seo/model.js";
import type { HandlerContext } from "../src/console/util.js";
let dir:string;const previous=process.env.LOCAL_SEO_PATH;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"local-seo-"));process.env.LOCAL_SEO_PATH=path.join(dir,"state.sqlite3");});
afterEach(()=>{closeLocalStores();rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.LOCAL_SEO_PATH;else process.env.LOCAL_SEO_PATH=previous;});
const site={id:"one",name:"One",brand:"Brand",country:"BE",languages:["fr-BE","nl-BE"],timezone:"Europe/Brussels",kind:"physical",page:"https://example.com/one"};
const ctx=(body:Record<string,unknown>={},actor="admin",tenant="acme",role="tenant-admin")=>({url:"",body,user:{sub:actor},tenancy:{tenant:{id:tenant,status:"active",domains:["example.com"]},role,platformAdmin:false}} as HandlerContext);
const call=async(name:string,body:Record<string,unknown>={},actor="admin",tenant="acme",role="tenant-admin")=>localSeoRoutes.find(r=>r.path===`/local-seo/${name}`)!.handler(ctx(body,actor,tenant,role)) as Promise<any>;
async function setup(){const p=await call("registry",{rows:[site]});await call("registry",{rows:[site],confirm:true,hash:p.hash});}
const observation={siteId:"one",source:"Survey",method:"manual",observedAt:"2026-11-10T12:00:00Z",language:"fr-BE",country:"BE",surface:"maps",query:"service",device:"mobile",depth:20,identity:"place-1",points:[{id:"a",latitude:50,longitude:4,status:"found",rank:2}]};
describe("Local SEO evidence and authorization",()=>{
 it("preserves REC-02 denominators and never invents error ranks",()=>{
  const points=Array.from({length:25},(_,i)=>({id:String(i),status:i<6?"found":i<20?"not-found":"error",...(i<6?{rank:2}:{})}));
  const o=observationSchema.parse({...observation,points});expect(metrics(o)).toMatchObject({coverage:80,top3:30,median:2,valid:20,found:6});
  expect(observationSchema.safeParse({...observation,points:[{id:"a",status:"error",rank:101}]}).success).toBe(false);
  expect(metrics({...o,points:[{id:"a",status:"error"}]}).top3).toBeNull();
 });
 it("requires matching language, grid, identity and metadata for comparison",()=>{
  const a=observationSchema.parse(observation);const b={...a,observedAt:"2026-11-11T12:00:00Z"};
  expect(compare(a as any,b as any).comparable).toBe(true);
  expect(compare(a as any,{...b,language:"nl-BE"} as any).comparable).toBe(false);
  expect(series({...a,language:undefined})).toBeNull();
  expect(series({...a,points:[{...a.points[0],latitude:51}]})).not.toBe(series(a));
 });
 it("previews imports, isolates rejects and persists stable IDs across restart",async()=>{
  const rows=[site,{...site,id:"bad",page:"https://evil.test"},{...site,id:"private",address:"secret"}];const p=await call("registry",{rows});expect(p.rejected).toHaveLength(2);expect((await call("state")).sites).toHaveLength(0);
  await call("registry",{rows,confirm:true,hash:p.hash});closeLocalStores();expect((await call("state")).sites).toHaveLength(1);
  await call("registry",{rows,confirm:true,hash:p.hash});expect((await call("state")).sites).toHaveLength(1);
  await expect(call("registry",{rows,confirm:true,hash:"wrong"})).rejects.toThrow("LOCAL_CHANGED");
 });
 it("filters reads and exports, denies cross-tenant writes and immediately revokes grants",async()=>{
  await setup();await expect(call("import",{observation},"local","acme","tenant-user")).rejects.toThrow("LOCAL_ACCESS");
  await call("grant",{user:"local",sites:["one"]});await call("import",{observation},"local","acme","tenant-user");
  expect((await call("export",{},"local","acme","tenant-user")).observations).toHaveLength(1);
  expect((await call("state",{},"admin","other")).observations).toHaveLength(0);
  await expect(call("import",{observation},"admin","other")).rejects.toThrow("LOCAL_ACCESS");
  await call("grant",{user:"local",sites:[]});expect((await call("export",{},"local","acme","tenant-user")).observations).toHaveLength(0);
 });
 it("deduplicates evidence and invalidates approval on any draft edit",async()=>{
  await setup();const o=await call("import",{observation});expect((await call("import",{observation})).id).toBe(o.id);
  const action={siteId:"one",title:"Review",content:"Check the observation",language:"fr-BE",owner:"owner",due:"2026-12-01T12:00:00Z",evidence:[o.id]};const a=await call("action",{action});
  await call("transition",{id:a.id,version:1,op:"submit"});await expect(call("transition",{id:a.id,version:1,op:"approve"})).rejects.toThrow("LOCAL_TRANSITION");
  await call("transition",{id:a.id,version:1,op:"approve"},"reviewer");
  const edited=await call("action",{id:a.id,version:1,action:{...action,content:"Changed"}});expect(edited.status).toBe("draft");expect(edited.approval).toBeUndefined();
  await expect(call("transition",{id:a.id,version:1,op:"manual"})).rejects.toThrow("LOCAL_CHANGED");
  await expect(call("action",{action:{...action,evidence:["missing"]}})).rejects.toThrow("LOCAL_EVIDENCE");
 });
 it("denies platform access without editorial delegation and marks web-only local tracking inapplicable",async()=>{
  const c=ctx();c.tenancy!.platformAdmin=true;await expect(localSeoRoutes[0].handler(c)).rejects.toThrow("LOCAL_ACCESS");
  const rows=[{...site,kind:"web-only"}];const p=await call("registry",{rows});await call("registry",{rows,confirm:true,hash:p.hash});await expect(call("import",{observation})).rejects.toThrow("LOCAL_NOT_APPLICABLE");
 });
});
