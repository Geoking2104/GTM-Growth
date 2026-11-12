import {describe,it,expect} from "vitest";
import {evaluateControls,summarizeControls,factsSchema, type Facts, type Snapshot} from "../src/local-seo/controls.js";
import type { Site,Observation } from "../src/local-seo/model.js";
const now=Date.parse("2026-11-12T12:00:00Z"),at="2026-11-12T11:00:00Z";
const site:Site={id:"one",name:"One",brand:"Brand",country:"BE",languages:["fr-BE"],timezone:"Europe/Brussels",kind:"physical",page:"https://example.com"};
const facts:Facts={identity:{externalId:"locations/1",confirmed:true,matches:1},sync:{status:"success",at},collection:{lastSuccess:at,cadenceHours:24},name:{expected:"Example",observed:" example "},phone:{expected:"+3225550101",observed:"+3225550101",country:"BE"},address:{expected:"street 1",observed:"Street 1",normalizer:"components-v1",country:"BE"},privacy:{privateAddress:true,forbiddenValues:["private street"],publicFields:["service area"]},hours:{timezone:"Europe/Brussels",intervals:[{day:1,start:540,end:1020}]},calendar:{approved:true,requiredDates:["2026-11-13"],confirmedDates:["2026-11-13"]},url:{expected:site.page,observed:site.page},reviews:{complete:true,responseHours:48,items:[{id:"r",createdAt:at,replyExpected:true,replied:true}]},indexing:{expected:true,status:200,robotsAllowed:true,noindex:false},canonical:{expected:site.page,observed:site.page},hreflang:{expected:[site.page],observed:[{url:site.page,reciprocal:true,status:200}]},schema:{applicable:true,identityConfirmed:true,expected:"one",observed:"one"},links:{expected:true,coverageComplete:true,inbound:1},citations:[{url:site.page,at,identityConfirmed:true,expected:"one",observed:"one"}],duplicates:{exactIds:["1","2"],ambiguous:false},workflows:[{id:"j",deadline:at,status:"success"}],verification:{expectedHash:"x",observedHash:"x",deadline:at,readAt:at},execution:{connector:"gbp",reserved:true,qualified:true},publication:{language:"fr-BE",approvedHash:"x",currentHash:"x",expiresAt:"2026-11-13T12:00:00Z",rightsValid:true},claims:{ai:true,factual:[{text:"Phone mismatch",evidenceIds:["s"]}],accessibleEvidenceIds:["s"]}};
const rank=(id:string,date:string):Observation=>({id,siteId:"one",source:"manual",method:"manual",observedAt:date,language:"fr-BE",country:"BE",surface:"maps",query:"service",device:"mobile",depth:20,identity:"locations/1",points:[{id:"a",latitude:50,longitude:4,status:"found",rank:1}],author:"a",importedAt:at,hash:id});
const ranks=[rank("r1","2026-11-11T12:00:00Z"),rank("r2",at)];
const evaluate=(f:Facts=facts,s=site)=>evaluateControls(s,[{id:"s",siteId:s.id,observedAt:at,facts:f,source:"declared",author:"a"}],ranks,now);
const result=(n:number,f:Facts,s=site)=>evaluate(f,s).find(r=>r.id===`LOC-${String(n).padStart(2,"0")}`)!;
describe("LOC-01 to LOC-24 policy",()=>{
 it("evaluates all 24, replays deterministically, preserves declared provenance and applicable coverage",()=>{
  const all=evaluate();expect(all).toHaveLength(24);expect(new Set(all.map(f=>f.id)).size).toBe(24);expect(all.filter(f=>f.status!=="pass").map(f=>f.id)).toEqual(["LOC-07"]);
  expect(result(7,facts,{...site,kind:"service-area"}).status).toBe("pass");
  expect(evaluate()).toEqual(evaluate());expect(summarizeControls(all)).toMatchObject({coverage:100,conformity:100,reliable:true});expect(all[0].provenance).toEqual(["declared"]);
 });
 const cases:Array<[number,keyof Facts,unknown,string]>=[
 [1,"identity",{externalId:"x",confirmed:false,matches:2},"unknown"],
 [2,"sync",{status:"revoked",at},"fail"],[3,"collection",{lastSuccess:"2026-11-01T12:00:00Z",cadenceHours:24},"fail"],
 [4,"name",{expected:"a",observed:"b"},"fail"],[5,"phone",{expected:"+3225550101",observed:"02 555 01 01",country:"BE"},"unknown"],
 [6,"address",{expected:"a",observed:"b",normalizer:"components-v1",country:"BE"},"fail"],
 [7,"privacy",{privateAddress:true,forbiddenValues:["private"],publicFields:["private"]},"fail"],
 [8,"hours",{timezone:"Europe/Brussels",intervals:[{day:1,start:100,end:200},{day:1,start:150,end:300}]},"fail"],
 [9,"calendar",{approved:true,requiredDates:["2026-11-13"],confirmedDates:[]},"fail"],
 [10,"url",{expected:site.page,observed:"https://other.test"},"fail"],
 [11,"reviews",{complete:true,responseHours:48,items:[{id:"r",createdAt:"2026-11-01T12:00:00Z",replyExpected:true,replied:false}]},"fail"],
 [12,"indexing",{expected:true,status:200,robotsAllowed:true,noindex:true},"fail"],
 [13,"canonical",{expected:site.page,observed:"https://other.test"},"fail"],
 [14,"hreflang",{expected:[site.page],observed:[{url:site.page,reciprocal:false,status:200}]},"fail"],
 [15,"schema",{applicable:true,identityConfirmed:false,expected:"a",observed:"b"},"unknown"],
 [16,"links",{expected:true,coverageComplete:false,inbound:0},"unknown"],
 [17,"citations",[{url:site.page,at,identityConfirmed:true,expected:"a",observed:"b"}],"fail"],
 [18,"duplicates",{exactIds:["1","1"],ambiguous:false},"fail"],
 [20,"workflows",[{id:"j",deadline:at,status:"failed"}],"fail"],
 [21,"verification",{expectedHash:"a",observedHash:"b",deadline:at,readAt:at},"fail"],
 [22,"execution",{connector:"dataforseo",reserved:true,qualified:true},"fail"],
 [23,"publication",{language:"en",approvedHash:"x",currentHash:"x",expiresAt:"2026-11-13T12:00:00Z",rightsValid:true},"fail"],
 [24,"claims",{ai:true,factual:[{text:"unproven",evidenceIds:[]}],accessibleEvidenceIds:[]},"fail"],
 ];
 it.each(cases)("LOC-%i handles adverse evidence",(n,key,value,status)=>{expect(result(n,{...facts,[key]:value},n===7?{...site,kind:"service-area"}:site).status).toBe(status);});
 it("LOC-19 requires comparable samples and sufficient collection coverage",()=>{
  const changed={...ranks[1],points:[{...ranks[1].points[0],rank:10}]};expect(evaluateControls(site,[],[ranks[0],changed],now).find(f=>f.id==="LOC-19")!.status).toBe("fail");
  expect(evaluateControls(site,[],[ranks[0],{...changed,language:"nl-BE"}],now).find(f=>f.id==="LOC-19")!.status).toBe("unknown");
 });
 it("does not invent passing controls when evidence is absent, stale or non-applicable",()=>{
  const all=evaluateControls(site,[],[],now);expect(summarizeControls(all).conformity).toBeNull();expect(summarizeControls(all).reliable).toBe(false);
  const old:Snapshot={id:"old",siteId:"one",observedAt:"2026-01-01T00:00:00Z",facts,source:"gbp",author:"a"};expect(evaluateControls(site,[old],[],now)[0].reason).toBe("stale-evidence");
  expect(evaluateControls({...site,kind:"web-only"},[],[],now).find(f=>f.id==="LOC-02")!.status).toBe("not-applicable");
  expect(factsSchema.safeParse({connector:"https://paid.test"}).success).toBe(false);
 });
});
