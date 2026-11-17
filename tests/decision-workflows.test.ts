import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readDecision, changeDecision, closeDecisionStores } from '../src/console/decision-store.js';
import { decisionPrincipal } from '../src/console/decision-context.js';
import { proposeReview, decideReview, executeReview, unifiedInbox } from '../src/console/decision-inbox.js';
import { runMeasurement, latestMeasurement, measurementState } from '../src/console/measurement-audit.js';
import { readIntentEvidence, pinIntent, intentState } from '../src/console/decision-intent.js';
import { decisionPortfolioRoutes } from '../src/console/decision-portfolio.js';
import * as crm from '../src/crm/service.js';
import { closeCrmStores } from '../src/crm/store.js';
import type { HandlerContext } from '../src/console/util.js';
const container='accounts/1/containers/2', workspace=container+'/workspaces/3';
const tenant:any={id:'acme',name:'Acme',status:'active',domains:['example.com'],gscProperties:['sc-domain:example.com'],bingSites:['https://example.com/'],ga4Properties:['123'],gtmContainers:[container],branding:{}};
const ctx=(id='acme',actor='author',role='tenant-admin'):HandlerContext=>({url:'https://example.com/',body:{},user:{sub:actor},tenancy:{tenant:{...tenant,id},role,platformAdmin:false,memberships:[{id,role}]} } as any);
let dir:string;
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),'decision-'));vi.stubEnv('DECISION_PATH',path.join(dir,'decisions.db'));vi.stubEnv('CRM_PATH',path.join(dir,'crm.db'));vi.stubEnv('ECOMMERCE_DATA_KEY_B64',Buffer.alloc(32,7).toString('base64'));});
afterEach(()=>{closeDecisionStores();closeCrmStores();rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();vi.useRealTimers();});
const inventory=()=>({container:{path:container,publicId:'GTM-ABC'},workspace,workspaces:[],tags:[],triggers:[],variables:[],clients:[],versions:[{id:'5'}],live:{id:'4'},pendingChanges:0,coverage:{versions:true,status:true,live:true,clients:true},revision:'r1'});
const io=()=>({inventory:vi.fn(async()=>inventory()),write:vi.fn(async(b:any)=>b.dryRun?{dryRun:true}:{done:{id:'saved'}}),publish:vi.fn(async()=>({published:true})),wordpress:vi.fn(async()=>({ok:true,postId:1,link:'https://example.com/?p=1'})),preview:vi.fn(async()=>({preview:{mode:'dry-run',expiresAt:new Date(Date.now()+600000).toISOString(),diff:'-old\n+new'},writesEnabled:false})),native:vi.fn(async()=>({}))} as any);
const command=(r:any)=>({id:r.id,digest:r.digest,confirmed:true});
async function approve(r:any,dep:any){return decideReview(ctx('acme','reviewer'),{...command(r),source:'decision',decision:'approve',comment:'Evidence reviewed'},dep);}
it('requires explicit membership, even for platform administrators, and enforces read/write roles',async()=>{
 const c=ctx();c.tenancy!.memberships=[];c.tenancy!.platformAdmin=true;
 expect(()=>decisionPrincipal(c)).toThrow('DECISION_ACCESS');await expect(decisionPortfolioRoutes[0].handler(c)).rejects.toThrow('DECISION_ACCESS');
 expect(()=>decisionPrincipal(ctx('acme','viewer','tenant-user'),true)).toThrow('DECISION_ACCESS');
 changeDecision('acme',s=>s.overviews=[{url:'https://example.com',at:'now',score:42}]);expect(readDecision('other').overviews).toBeUndefined();
});
it('aggregates native approvals without bypassing independent authors or hiding unavailable sources',async()=>{
 const dep=io();dep.native.mockImplementation(async(_:any,route:string)=>{if(route.includes('social'))return{approvals:[{id:'1',type:'POST_APPROVE',entityId:'post',requestedBy:'author',requestedAt:'2026-11-17',expiresAt:new Date(Date.now()+60000).toISOString(),status:'PENDING',digest:'a'.repeat(64),context:{text:'Actual post'}}]};throw new Error('not accessible');});
 const d=await unifiedInbox(ctx(),dep);expect(d.partial).toBe(true);expect(d.pending).toBe(1);expect(d.rows[0]).toMatchObject({canApprove:false,canExecute:false,reason:'independent-approver',details:{text:'Actual post'}});
 expect((await unifiedInbox(ctx('acme','reviewer'),dep)).rows[0].canApprove).toBe(true);expect(dep.write).not.toHaveBeenCalled();
});
it('deduplicates proposals, keeps approvals separate, rejects changed versions and executes once',async()=>{
 const dep=io(),input={kind:'gtm',payload:{container,workspace,kind:'tags',op:'create',resource:{name:'GA4'}}};
 const r=await proposeReview(ctx(),input,dep);expect((await proposeReview(ctx(),input,dep)).id).toBe(r.id);expect(dep.write.mock.calls.every(([b]:any)=>b.dryRun)).toBe(true);
 await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('DECISION_CHANGED');await approve(r,dep);
 dep.inventory.mockResolvedValueOnce({...inventory(),revision:'changed-resource-parameters'});await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('DECISION_CHANGED');
 expect((await executeReview(ctx(),command(r),dep)).status).toBe('completed');await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('DECISION_CHANGED');expect(dep.write.mock.calls.filter(([b]:any)=>b.dryRun===false)).toHaveLength(1);
});
it('blocks cross-container targets before a provider read and requires typed publication confirmation',async()=>{
 const dep=io();await expect(proposeReview(ctx(),{kind:'gtm',payload:{container,workspace:'accounts/9/containers/8/workspaces/3',op:'delete-workspace'}},dep)).rejects.toThrow('DECISION_WORKSPACE_SCOPE');expect(dep.inventory).not.toHaveBeenCalled();
 await expect(proposeReview(ctx(),{kind:'gtm',payload:{container,workspace,op:'update',kind:'tags',path:container+'/workspaces/9/tags/5'}},dep)).rejects.toThrow('DECISION_WORKSPACE_SCOPE');
 const r=await proposeReview(ctx(),{kind:'gtm-publish',payload:{container,version:'5'}},dep);await approve(r,dep);await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('GTM_CONFIRM_PUBLIC_ID');expect(dep.publish).not.toHaveBeenCalled();expect((await executeReview(ctx(),{...command(r),confirm:'GTM-ABC'},dep)).status).toBe('completed');
});
it('does not retry an ambiguous external write and never executes a technical diff',async()=>{
 const dep=io();const r=await proposeReview(ctx(),{kind:'gtm',payload:{container,op:'create-workspace',name:'reviewed'}},dep);await approve(r,dep);dep.write.mockRejectedValueOnce(new Error('network timeout'));expect((await executeReview(ctx(),command(r),dep)).status).toBe('uncertain');await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('DECISION_CHANGED');
 const d=await proposeReview(ctx(),{kind:'diff',payload:{url:'https://example.com/'}},dep);await approve(d,dep);await expect(executeReview(ctx(),command(d),dep)).rejects.toThrow('DECISION_CHANGED');
});
it('recomputes WordPress quality, binds the destination and creates only a draft',async()=>{
 const dep=io();vi.stubEnv('WP_SITE_URL_ACME','https://example.com');vi.stubEnv('WP_USERNAME_ACME','test');vi.stubEnv('WP_APP_PASSWORD_ACME','test');
 const payload={title:'Acme leather shoes for long daily walks',slug:'leather-shoes',metaDescription:'a'.repeat(125),outline:[{h2:'Understand leather shoes',bullets:['Fit','Leather','Maintenance']},{h2:'FAQ',bullets:['Sizing?']}],body:'Acme leather shoes '.repeat(300),entities:['Acme','leather shoes']};
 const failed=await proposeReview(ctx(),{kind:'wordpress',payload:{...payload,body:'Short'}},dep);await expect(approve(failed,dep)).rejects.toThrow('DECISION_QUALITY_GATES');
 const r=await proposeReview(ctx(),{kind:'wordpress',payload},dep);await approve(r,dep);vi.stubEnv('WP_SITE_URL_ACME','https://other.example');await expect(executeReview(ctx(),command(r),dep)).rejects.toThrow('DECISION_CHANGED');vi.stubEnv('WP_SITE_URL_ACME','https://example.com');expect((await executeReview(ctx(),command(r),dep)).result).toMatchObject({publicationStatus:'draft',published:false});expect(dep.wordpress).toHaveBeenCalledOnce();
});
it('retains hashed CRM identities and blocks a revoked web scope before binding',async()=>{
 const p={tenant,actor:'author',admin:true};crm.configure(p,'configure',{enabled:true,mode:'native'});const profileId=crm.createNative(p,'create-01',{label:'Contact'}).profileId;
 const dep=io();const r=await proposeReview(ctx(),{kind:'crm-identity',payload:{profileId,identity:{kind:'web_user',scope:'example.com',value:'private-user-id'},proof:{reference:'CRM reviewed record'}}},dep);
 expect(JSON.stringify(readDecision('acme'))).not.toContain('private-user-id');await approve(r,dep);const changed=ctx();changed.tenancy!.tenant!.domains=['other.example'];await expect(executeReview(changed,command(r),dep)).rejects.toThrow('CRM_SOURCE_SCOPE');expect(readDecision('acme').reviews[0].status).toBe('approved');
});
const engines=()=>({inventory:vi.fn(async()=>inventory()),installation:vi.fn(async({url}:any)=>({url,containerIds:['GTM-ABC'],checks:[{id:'gtm.container',status:'pass',required:true},{id:'gtm.consent_default',status:'pass'}]})),setup:vi.fn(async()=>({coverage:{complete:true},issues:[]})),duplicates:vi.fn(async()=>({hasDuplicates:false}))} as any);
const auditInput={container,ga4Property:'123',pages:['https://example.com/']};
it('orchestrates all four engines and keeps missing, changed and stale measurement unknown',async()=>{
 const e=engines();const r=await runMeasurement(ctx(),auditInput,e);expect(r.state).toBe('intact');expect(r.checks).toHaveLength(4);expect(latestMeasurement(ctx(),{url:'https://example.com'}).run?.id).toBe(r.id);expect(latestMeasurement(ctx('other'),{}).run).toBeNull();
 e.setup.mockRejectedValueOnce(new Error('access revoked'));expect((await runMeasurement(ctx(),auditInput,e)).state).toBe('unknown');e.inventory.mockResolvedValueOnce({...inventory(),coverage:{status:false,live:true}});expect((await runMeasurement(ctx(),auditInput,e)).state).toBe('unknown');
 e.inventory.mockResolvedValueOnce({...inventory(),pendingChanges:1});expect((await runMeasurement(ctx(),auditInput,e)).state).toBe('unknown');
 changeDecision('acme',s=>{for(const r of s.audits)r.at='2000-01-01T00:00:00Z';});expect(latestMeasurement(ctx(),{}).stale).toBe(true);
});
it('shows known critical findings despite partial data, never equating an unavailable page with no tag',async()=>{
 const e=engines();e.installation.mockRejectedValueOnce(new Error('timeout'));const unknown=await runMeasurement(ctx(),auditInput,e);expect(unknown.checks[0].state).toBe('unknown');expect(unknown.state).toBe('unknown');
 e.setup.mockRejectedValueOnce(new Error('offline'));e.duplicates.mockResolvedValueOnce({hasDuplicates:true});expect((await runMeasurement(ctx(),auditInput,e)).state).toBe('critical');
 await expect(runMeasurement(ctx(),{...auditInput,pages:['https://foreign.example/']},e)).rejects.toThrow('DECISION_PAGE_SCOPE');expect(measurementState([])).toBe('unknown');
});
it('pins retrieved evidence with version checks and preserves absence of Bing page and AI search volume',async()=>{
 const data=await readIntentEvidence(ctx(),{days:28},{gsc:async()=>({period:{start:'2026-10-01',end:'2026-10-28'},rows:[{query:'leather shoes',page:'https://example.com/shoes',clicks:3,impressions:100,ctr:.03,position:2}]}),bing:async()=>({period:{start:'2026-10-01',end:'2026-10-28'},queries:[{query:'shoes',clicks:1,impressions:5}]}),ai:()=>({id:'dataset',observations:[{id:'obs',prompt:'Which leather shoes?',source:'manual',observedAt:'2026-11-17T00:00:00Z',answer:'Acme shoes',mentions:[{brand:'Acme',status:'confirmed'}]}]})} as any);
 expect(data.evidence[1].page).toBeNull();expect(data.evidence[2].impressions).toBeNull();const request={evidenceId:data.evidence[0].id,stage:'product-aware',targetUrl:'https://example.com/shoes',version:data.version};
 const pinned=pinIntent(ctx(),request);expect(pinned.pins[0].evidence.clicks).toBe(3);expect(()=>pinIntent(ctx(),request)).toThrow('DECISION_CHANGED');expect(()=>pinIntent(ctx(),{...request,version:pinned.version,evidenceId:'a'.repeat(64)})).toThrow('DECISION_EVIDENCE_EXPIRED');
 const changed=ctx();changed.tenancy!.tenant!.gscProperties=[];expect(intentState(changed).pins).toHaveLength(0);expect(()=>pinIntent(changed,{...request,version:pinned.version})).toThrow('DECISION_PROPERTY_SCOPE');expect(intentState(ctx('other')).pins).toHaveLength(0);
});
