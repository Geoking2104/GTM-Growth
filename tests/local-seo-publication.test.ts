import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";import path from "node:path";import { tmpdir } from "node:os";
import { closeLocalStores,readState,updateState } from "../src/local-seo/store.js";
import {preparePublication,approvePublication,executePublication,verifyPublication} from "../src/local-seo/publication.js";
import type {GbpProvider} from "../src/local-seo/gbp.js";
let dir:string,value:string;let provider:GbpProvider;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),"local-publish-"));vi.stubEnv("LOCAL_SEO_PATH",path.join(dir,"db.sqlite3"));vi.stubEnv("LOCAL_SEO_PUBLISH_ENABLED","true");value="https://example.com/old";
 provider={read:vi.fn(async()=>({name:"locations/1",websiteUri:value})),validate:vi.fn(async()=>{}),write:vi.fn(async(_l,c)=>{value=c.value;}),reviews:vi.fn(async()=>({items:[],complete:true,responseHours:48}))};
 updateState("acme",s=>{s.sites=[{id:"one",name:"One",brand:"Brand",country:"BE",languages:["fr-BE"],timezone:"Europe/Brussels",kind:"physical",page:"https://example.com"}];s.bindings={one:{siteId:"one",location:"locations/1",confirmedBy:"admin",confirmedAt:new Date().toISOString()}};});
});
afterEach(()=>{closeLocalStores();rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();});
const prepare=()=>preparePublication("acme","one","fr-BE",{field:"websiteUri",value:"https://example.com/new"},"author",provider);
describe("supervised GBP publication",()=>{
 it("previews without writing, requires another approver and verifies by a separate read",async()=>{
  const p=await prepare();expect(provider.write).not.toHaveBeenCalled();expect(()=>approvePublication("acme",p.id,p.digest,"author")).toThrow();
  approvePublication("acme",p.id,p.digest,"reviewer");const result=await executePublication("acme",p.id,p.digest,"reviewer",provider);
  expect(result.status).toBe("verified");expect(provider.write).toHaveBeenCalledTimes(1);expect(provider.read).toHaveBeenCalledTimes(3);
  await expect(executePublication("acme",p.id,p.digest,"reviewer",provider)).rejects.toThrow("GBP_ALREADY_DISPATCHED");
 });
 it("does not write on external drift, scope revocation, expiry or disabled publishing",async()=>{
  const p=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");value="https://example.com/external";
  expect((await executePublication("acme",p.id,p.digest,"reviewer",provider)).status).toBe("conflict");expect(provider.write).not.toHaveBeenCalled();
  const q=await prepare();approvePublication("acme",q.id,q.digest,"reviewer");updateState("acme",s=>{s.scopeVersion=1;});await expect(executePublication("acme",q.id,q.digest,"reviewer",provider)).rejects.toThrow("LOCAL_CHANGED");
  const r=await prepare();approvePublication("acme",r.id,r.digest,"reviewer",Date.now()-3600000);await expect(executePublication("acme",r.id,r.digest,"reviewer",provider)).rejects.toThrow("LOCAL_TRANSITION");
  vi.stubEnv("LOCAL_SEO_PUBLISH_ENABLED","false");await expect(executePublication("acme",r.id,r.digest,"reviewer",provider)).rejects.toThrow("GBP_WRITE_DISABLED");
 });
 it("reconciles a timeout after the provider applied the update, without replaying it",async()=>{
  const p=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");provider.write=vi.fn(async(_l,c)=>{value=c.value;throw new Error("timeout");});
  expect((await executePublication("acme",p.id,p.digest,"reviewer",provider)).status).toBe("uncertain");closeLocalStores();
  expect((await verifyPublication("acme",p.id,"reviewer",provider)).status).toBe("verified");expect(provider.write).toHaveBeenCalledTimes(1);
 });
 it("atomically excludes concurrent writes and never trusts another tenant's approval",async()=>{
  const p=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");
  await expect(executePublication("other",p.id,p.digest,"reviewer",provider)).rejects.toThrow();
  const results=await Promise.allSettled([executePublication("acme",p.id,p.digest,"reviewer",provider),executePublication("acme",p.id,p.digest,"reviewer",provider)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(provider.write).toHaveBeenCalledTimes(1);
 });
 it("blocks tampered approval digests and changed targets",async()=>{
  const p=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");updateState("acme",s=>{s.publications![0].change.value="https://evil.test";});
  await expect(executePublication("acme",p.id,p.digest,"reviewer",provider)).rejects.toThrow("LOCAL_CHANGED");expect(readState("acme").audit.length).toBeGreaterThan(0);
 });
 it("locks the Google target across separate approved diffs",async()=>{
  const p=await prepare(),q=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");approvePublication("acme",q.id,q.digest,"reviewer");
  updateState("acme",s=>{s.publications![0].status="uncertain";});
  await expect(executePublication("acme",q.id,q.digest,"reviewer",provider)).rejects.toThrow("GBP_TARGET_BUSY");expect(provider.write).not.toHaveBeenCalled();
 });
 it("recovers an abandoned preflight without dispatch and rejects another executor",async()=>{
  const p=await prepare();approvePublication("acme",p.id,p.digest,"reviewer");
  await expect(executePublication("acme",p.id,p.digest,"other-admin",provider)).rejects.toThrow("LOCAL_TRANSITION");
  updateState("acme",s=>{s.publications![0].status="preflight";s.publications![0].leaseUntil=Date.now()-1;});
  closeLocalStores();expect((await verifyPublication("acme",p.id,"reviewer",provider)).status).toBe("failed");expect(provider.write).not.toHaveBeenCalled();
 });

});
