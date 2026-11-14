import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {dashboardInput,monthWindow,performanceQuery,performanceSeries,reviewSummary} from '../src/local-seo/dashboard.js';
import {GoogleBusinessProfile,type GbpConfig} from '../src/local-seo/gbp.js';
import {localSeoRoutes} from '../src/console/local-seo.js';
import {readState,updateState,closeLocalStores} from '../src/local-seo/store.js';
import type {HandlerContext} from '../src/console/util.js';
const now=new Date('2026-11-14T12:00:00Z'),metric='WEBSITE_CLICKS',month='2026-11';
const raw=(datedValues:unknown[],dailyMetric=metric)=>({multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric,timeSeries:{datedValues}}]}]});
const point=(day:number,value?:unknown)=>({date:{year:2026,month:11,day},...(value===undefined?{}:{value})});
describe('Google dashboard data semantics',()=>{
 it('keeps a real zero separate from missing dates and omitted values',()=>{
  const series=performanceSeries(raw([point(1,'0'),point(3,'7'),point(4)]),month,metric,now);
  expect(series.points.slice(0,4).map(x=>x.value)).toEqual([0,null,7,null]);expect(series.reportedDays).toBe(2);expect(series.expectedDays).toBe(13);
 });
 it('validates a bounded month, including leap years and the first day of a month',()=>{
  expect(monthWindow('2024-02',new Date('2024-03-01')) .days).toBe(29);
  expect(monthWindow('2026-11',new Date('2026-11-01')).days).toBe(0);
  expect(()=>monthWindow('2026-12',now)).toThrow('LOCAL_INVALID');expect(()=>monthWindow('2025-11',now)).toThrow('LOCAL_INVALID');
  expect(performanceQuery(month,metric,now).query.get('dailyRange.end_date.day')).toBe('13');
  expect(dashboardInput.safeParse({siteId:'one',month,metric,location:'locations/2'}).success).toBe(false);
 });
 it('rejects duplicate days, future points, invalid numbers and overlapping series',()=>{
  for(const rows of [[point(1,2),point(1,3)],[point(31,2)],[point(14,2)],[point(1,'9007199254740993')],[point(1,-1)]])expect(()=>performanceSeries(raw(rows),month,metric,now)).toThrow('GBP_REMOTE');
  const duplicate=raw([point(1,1)]);duplicate.multiDailyMetricTimeSeries.push(...duplicate.multiDailyMetricTimeSeries);expect(()=>performanceSeries(duplicate,month,metric,now)).toThrow();
 });
 it('uses Google totals and discloses a partial star sample, discarding identities and comments',()=>{
  const summary=reviewSummary({averageRating:4.53,totalReviewCount:176,nextPageToken:'next',reviews:[{starRating:'FIVE',reviewer:{displayName:'Private'},comment:'Sensitive text'},{starRating:'ONE'},{starRating:'THREE'},{}]});
  expect(summary).toMatchObject({average:4.53,total:176,sample:{positive:1,negative:1,neutral:1,unknown:1,size:4,complete:false}});
  expect(JSON.stringify(summary)).not.toMatch(/Private|Sensitive|nextPageToken/);
  expect(reviewSummary({totalReviewCount:0,averageRating:0})).toMatchObject({average:null,total:0,sample:{complete:true}});
  expect(reviewSummary({})).toMatchObject({average:null,total:null,sample:{complete:false}});
 });
 it('uses only the approved Google hosts, bounds and redirect policy',async()=>{
  const configuration:GbpConfig={enabled:true,writeEnabled:false,clientId:'client',clientSecret:'fixture',refreshToken:'fixture',account:'accounts/1',locations:['locations/1'],requestsPerHour:100};
  const fetcher=vi.fn(async(url:URL|Request|string)=>new Response(JSON.stringify(String(url).includes('oauth2')?{access_token:'fixture'}:{})));
  const provider=new GoogleBusinessProfile('acme',fetcher,()=>configuration,()=>{});
  await provider.dashboardReviews('locations/1');await provider.dashboardPerformance('locations/1',performanceQuery(month,metric,now).query);
  expect(String(fetcher.mock.calls[1][0])).toContain('mybusiness.googleapis.com/v4/accounts/1/locations/1/reviews?pageSize=50');
  expect(String(fetcher.mock.calls[3][0])).toContain('businessprofileperformance.googleapis.com/v1/locations/1:fetchMultiDailyMetricsTimeSeries?dailyMetrics=WEBSITE_CLICKS');
  await expect(provider.dashboardReviews('locations/2')).rejects.toThrow('GBP_ACCESS');expect(fetcher).toHaveBeenCalledTimes(4);
 });
});
let directory:string;
beforeEach(()=>{directory=mkdtempSync(path.join(tmpdir(),'gbp-dashboard-'));vi.stubEnv('LOCAL_SEO_PATH',path.join(directory,'store.sqlite3'));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();closeLocalStores();rmSync(directory,{recursive:true,force:true});});
const currentMonth=()=>new Date().toISOString().slice(0,7);
function seed(){updateState('acme',s=>{s.sites=[{id:'one',name:'One',brand:'Client',country:'FR',languages:['fr'],timezone:'Europe/Paris',kind:'physical',page:'https://example.com'}];s.bindings={one:{siteId:'one',location:'locations/1',confirmedBy:'admin',confirmedAt:new Date().toISOString()}};s.grants.local=['one'];});}
function context(actor='admin',tenant='acme',body:Record<string,unknown>={}){return {body:{siteId:'one',month:currentMonth(),metric,...body},user:{sub:actor},tenancy:{tenant:{id:tenant,status:'active'},role:actor==='admin'?'tenant-admin':'tenant-user',platformAdmin:false}} as HandlerContext;}
const call=(ctx=context())=>localSeoRoutes.find(r=>r.path==='/local-seo/gbp/dashboard')!.handler(ctx) as Promise<any>;
describe('Tenant-scoped dashboard reads',()=>{
 it('returns partial success and never persists the Google dashboard result',async()=>{
  seed();const before=JSON.stringify(readState('acme'));
  vi.spyOn(GoogleBusinessProfile.prototype,'dashboardReviews').mockResolvedValue({averageRating:4,totalReviewCount:1,reviews:[{starRating:'FOUR'}]});
  vi.spyOn(GoogleBusinessProfile.prototype,'dashboardPerformance').mockRejectedValue(new Error('GBP_QUOTA'));
  const result=await call(context('local'));expect(result.reviews.total).toBe(1);
  if(new Date().getUTCDate()>1)expect(result.performance).toEqual({status:'unavailable',code:'GBP_QUOTA'});
  expect(JSON.stringify(readState('acme'))).toBe(before);
 });
 it('rejects foreign tenants, missing grants, arbitrary metrics and provider IDs before any read',async()=>{
  seed();const read=vi.spyOn(GoogleBusinessProfile.prototype,'dashboardReviews').mockResolvedValue({});
  for(const ctx of [context('admin','other'),context('stranger'),context('admin','acme',{location:'locations/2'}),context('admin','acme',{metric:'INVENTED'})])await expect(call(ctx)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
 });
 it('rejects revoked grants and changed bindings while a read is in flight',async()=>{
  seed();vi.spyOn(GoogleBusinessProfile.prototype,'dashboardPerformance').mockResolvedValue({});
  vi.spyOn(GoogleBusinessProfile.prototype,'dashboardReviews').mockImplementation(async()=>{updateState('acme',s=>{s.grants.local=[];});return {};});
  await expect(call(context('local'))).rejects.toThrow('LOCAL_ACCESS');
  vi.spyOn(GoogleBusinessProfile.prototype,'dashboardReviews').mockImplementation(async()=>{updateState('acme',s=>{delete s.bindings?.one;});return {};});
  await expect(call()).rejects.toThrow('LOCAL_CHANGED');
 });
 it('rejects web-only locations, unbound listings and platform administrators',async()=>{
  seed();updateState('acme',s=>{s.sites[0].kind='web-only';});await expect(call()).rejects.toThrow('LOCAL_NOT_APPLICABLE');
  updateState('acme',s=>{s.sites[0].kind='physical';delete s.bindings?.one;});await expect(call()).rejects.toThrow('GBP_UNBOUND');
  const ctx=context();ctx.tenancy!.platformAdmin=true;await expect(call(ctx)).rejects.toThrow('LOCAL_ACCESS');
 });
});
