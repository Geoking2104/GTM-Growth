import { afterEach, expect, it, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
const context=new AsyncLocalStorage<string>();
vi.mock('../src/auth/service-account.js',()=>({getAuthClient:async()=>({identity:context.getStore()})}));
vi.mock('googleapis',()=>({google:{options(){},analyticsdata:({auth}:any)=>({identity:auth.identity}),analyticsadmin:({auth}:any)=>({identity:auth.identity}),tagmanager:({auth}:any)=>({accounts:{list:async()=>({data:{account:[{accountId:auth.identity,name:auth.identity}]}})}})}}));
vi.mock('../src/cache/redis.js',()=>({cacheGet:async()=>null,cacheSet:async()=>{},cacheKey:()=>'',TTL:{}}));
afterEach(()=>vi.resetModules());
it('constructs GA4 and GTM clients with the current request credential instead of the first tenant',async()=>{
 const {getDataClient,getAdminClient}=await import('../src/google/client.js');const {listGtmAccounts}=await import('../src/google/tagmanager-api.js');
 const results=await Promise.all(['tenant-one','tenant-two','tenant-one'].map(id=>context.run(id,async()=>({data:await getDataClient(),admin:await getAdminClient(),gtm:await listGtmAccounts()}))));
 for(const [i,id] of ['tenant-one','tenant-two','tenant-one'].entries()){expect(results[i].data).toMatchObject({identity:id});expect(results[i].admin).toMatchObject({identity:id});expect(results[i].gtm.accounts[0].accountId).toBe(id);}
});
