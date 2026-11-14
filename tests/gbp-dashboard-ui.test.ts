import {afterEach,expect,it,vi} from 'vitest';
import {parseHTML} from 'linkedom';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it.each(['fr','en'])('keeps selected-location data isolated in %s and exposes missing data honestly',async(lang)=>{
 const {document,window}=parseHTML('<html><body></body></html>');document.documentElement.lang=lang;
 vi.stubGlobal('document',document);vi.stubGlobal('Node',window.Node);vi.stubGlobal('location',{search:`?lang=${lang}`});vi.stubGlobal('localStorage',{getItem:()=>lang,setItem:()=>{}});
 // linkedom exposes a getter-only select.value; browsers provide the matching setter.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(v){for(const o of this.querySelectorAll('option')){if(o.value===v)o.setAttribute('selected','');else o.removeAttribute('selected');}}});
 const {renderGbpDashboard}=await import('../site/console/gbp-dashboard.js');
 let resolve!:(value:unknown)=>void;
 const call=vi.fn(async()=>new Promise(r=>{resolve=r;}));
 const node=renderGbpDashboard({data:{sites:[{id:'a',name:'First',kind:'physical',languages:['fr']},{id:'b',name:'Second',kind:'physical',languages:['en']}],bindings:[{siteId:'a'}]},call,admin:true});document.body.append(node);
 const select=node.querySelector('select')!,load=node.querySelector('.gbp-filters button')!;
 expect(node.querySelector('.gbp-reviews .gbp-number')!.textContent).toBe('—');
 const pending=load.onclick!({} as any);expect(call).toHaveBeenCalledWith('gbp/dashboard',expect.objectContaining({siteId:'a'}));
 select.value='b';select.onchange!({} as any);resolve({fetchedAt:new Date().toISOString(),reviews:{status:'available',average:5,total:999,sample:{size:0}},performance:{status:'unavailable'}});await pending;
 expect(node.querySelector('.gbp-business-name')!.textContent).toBe('Second');expect(node.querySelector('.gbp-reviews .gbp-number')!.textContent).toBe('—');expect(load.disabled).toBe(true);
 select.value='a';select.onchange!({} as any);
 call.mockResolvedValueOnce({fetchedAt:new Date().toISOString(),reviews:{status:'available',total:0,average:null,sample:{size:0,complete:true,positive:0,negative:0,neutral:0,unknown:0}},performance:{status:'unavailable',code:'GBP_QUOTA'}});
 await load.onclick!({} as any);expect(node.querySelector('.gbp-reviews .gbp-number')!.textContent).toBe('0');expect(node.querySelector('.gbp-gauge-score strong')!.textContent).toBe('—');expect(node.querySelector('.gbp-empty-chart')!.textContent).toMatch(/quota/i);expect(node.textContent).not.toContain('999');
});
