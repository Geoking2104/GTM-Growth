import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { readFileSync } from 'node:fs';

const fixturePlan = () => ({ id:'plan-1',tenantId:'acme',version:1,createdBy:'member',createdAt:'2026-11-20T12:00:00Z',updatedAt:'2026-11-20T12:00:00Z',name:'Search campaign',objective:'Improve product discovery',language:'en',timezone:'Europe/Paris',startDate:'2026-12-01',endDate:'2026-12-31',budgetCents:100000,currency:'EUR',channels:['seo'],status:'draft',evidence:[],layout:{positions:{}},edges:[],nodes:[{id:'action-1',type:'action',title:'Review canonical URL',description:'Confirm the product page',channel:'seo',startDate:'2026-12-02',endDate:'2026-12-04',owner:'SEO lead',effortHours:3,budgetCents:10000,status:'todo',locked:false,evidenceIds:[],checklist:[]}] });
function environment(lang:string) {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._scenarioValue??[...this.options].find(o=>o.selected)?.value??this.options[0]?.value??'';},set(value){this._scenarioValue=value;for(const option of this.options)option.selected=option.value===value;}});
  const memory=new Map<string,string>();
  const storage={getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)};
  window.matchMedia=()=>({matches:true} as MediaQueryList);
  vi.stubGlobal('document',document);vi.stubGlobal('window',window);vi.stubGlobal('Node',window.Node);vi.stubGlobal('location',{search:`?lang=${lang}`});vi.stubGlobal('localStorage',storage);vi.stubGlobal('sessionStorage',storage);
  return {document,window,memory};
}
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.useRealTimers();});

it.each(['fr','en'])('reads the studio and changes views without writing or invoking AI in %s',async lang=>{
  const {document}=environment(lang),plan=fixturePlan(),calls:string[]=[];
  const api=vi.fn(async(path:string)=>{calls.push(path);if(path.endsWith('/list'))return {plans:[plan],nextOffset:null};if(path.endsWith('/capabilities'))return {actor:'member',canCreate:true,canGenerate:false,channels:[],providers:[],members:[]};if(path.endsWith('/evidence'))return {evidence:[]};if(path.endsWith('/get'))return {plan,canEdit:true,canGenerate:false};throw new Error(path);});
  const {renderScenarios}=await import('../site/console/scenarios.js');
  const root=await renderScenarios({api,state:{me:{tenant:{id:'acme'}}}});document.body.append(root);
  const open=[...root.querySelectorAll('button')].find(b=>b.textContent===(lang==='fr'?'Ouvrir le scénario':'Open scenario'))!;open.click();
  await vi.waitFor(()=>expect(root.querySelector('.scenario-table')).toBeTruthy());
  const schedule=[...root.querySelectorAll('button')].find(b=>b.textContent===(lang==='fr'?'Planning':'Schedule'))!;schedule.click();
  expect(root.querySelector('.scenario-time-bar')?.textContent).toContain('2026');
  expect(root.querySelector('.scenario-inspector')?.textContent).toContain('Review canonical URL');
  expect(calls.every(path=>['/scenarios/list','/scenarios/capabilities','/scenarios/evidence','/scenarios/get'].includes(path))).toBe(true);
  expect(root.querySelector('[role="status"]')).toBeTruthy();root.dispose();
});

it('keeps a conflicting draft recoverable under the authenticated actor and blocks navigation',async()=>{
  vi.useFakeTimers();const {document,memory,window}=environment('en'),plan=fixturePlan();
  const api=vi.fn(async(path:string)=>{if(path.endsWith('/list'))return {plans:[plan]};if(path.endsWith('/capabilities'))return {actor:'actual-member',canCreate:true,canGenerate:false,channels:[],providers:[],members:[]};if(path.endsWith('/evidence'))return {evidence:[]};if(path.endsWith('/get'))return {plan,canEdit:true};if(path.endsWith('/update-draft'))throw new Error('SCENARIO_CHANGED');throw new Error(path);});
  const {renderScenarios}=await import('../site/console/scenarios.js');const root=await renderScenarios({api,state:{me:{tenant:{id:'acme'}}}});document.body.append(root);
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Open scenario')!.click();await vi.advanceTimersByTimeAsync(1);
  const status=root.querySelector('.scenario-table select') as HTMLSelectElement;status.value='in_progress';expect(status.value).toBe('in_progress');status.onchange!(new window.Event('change'));
  await vi.advanceTimersByTimeAsync(1100);
  expect(root.textContent).toContain('Your work is preserved');expect(memory.has('gtm-scenario-recovery:acme:actual-member:plan-1')).toBe(true);
  expect(await root.beforeLeave()).toBe(false);expect(JSON.parse(memory.get('gtm-scenario-recovery:acme:actual-member:plan-1')!).draft.nodes[0].status).toBe('in_progress');
  expect(api.mock.calls.filter(([path])=>path.endsWith('/update-draft'))).toHaveLength(2);root.dispose();await vi.advanceTimersByTimeAsync(3000);expect(api.mock.calls.filter(([path])=>path.endsWith('/update-draft'))).toHaveLength(2);
});

it('renders imported labels as text and prevents editing a protected node',async()=>{
  const {document}=environment('en'),plan=fixturePlan();plan.nodes[0].title='<img src=x onerror=alert(1)>';plan.nodes[0].locked=true;
  const api=async(path:string)=>path.endsWith('/list')?{plans:[plan]}:path.endsWith('/capabilities')?{actor:'member',canCreate:true,channels:[],providers:[],members:[]}:path.endsWith('/evidence')?{evidence:[]}:{plan,canEdit:true};
  const {renderScenarios}=await import('../site/console/scenarios.js');const root=await renderScenarios({api,state:{me:{tenant:{id:'acme'}}}});document.body.append(root);[...root.querySelectorAll('button')].find(b=>b.textContent==='Open scenario')!.click();await vi.waitFor(()=>expect(root.querySelector('.scenario-inspector fieldset')).toBeTruthy());
  expect((root.querySelector('.scenario-inspector fieldset') as HTMLFieldSetElement)?.disabled).toBe(true);expect(root.querySelector('.scenario-inspector img')).toBeNull();expect(root.textContent).toContain('<img src=x onerror=alert(1)>');root.dispose();
});

describe('shared scenario view model',()=>{
  it('removes incident dependencies and layout when an action is deleted, preserving other evidence',async()=>{
    const {removeNode}=await import('../site/console/scenarios-model.js');const p=fixturePlan();p.nodes.push({...p.nodes[0],id:'action-2'});p.edges=[{id:'edge-1',source:'action-1',target:'action-2',type:'finish_to_start',lagDays:0}] as any;p.layout.positions={'action-1':{x:1,y:1},'action-2':{x:2,y:2}};const next=removeNode(p,'action-1');expect(next.nodes.map((n:any)=>n.id)).toEqual(['action-2']);expect(next.edges).toEqual([]);expect(next.layout.positions).toEqual({'action-2':{x:2,y:2}});expect(p.nodes).toHaveLength(2);
  });
  it('undoes and redoes the same semantic plan shared by calendar, table and canvas',async()=>{
    const {createHistory,clone,dayIndex,addDays,summarize}=await import('../site/console/scenarios-model.js');const history=createHistory(),initial=fixturePlan(),changed=clone(initial);changed.nodes[0].endDate='2026-12-08';changed.nodes[0].budgetCents=20000;history.push(initial);const undo=history.undo(changed);expect(undo.nodes[0].endDate).toBe('2026-12-04');expect(history.redo(undo).nodes[0].budgetCents).toBe(20000);expect(summarize({summary:{count:4,done:1,assigned:3,hours:6,budget:5000}})).toEqual({count:4,done:1,assigned:3,hours:6,budget:5000});expect(addDays('2026-03-28',2)).toBe('2026-03-30');expect(dayIndex('2026-03-30')-dayIndex('2026-03-28')).toBe(2);
  });
  it('uses a local JointJS module without injecting a stylesheet blocked by console CSP',()=>{
    const source=readFileSync('site/console/scenarios.js','utf8'),css=readFileSync('site/console/scenarios.css','utf8');expect(source).toContain("'/assets/vendor/joint-core/joint.js'");expect(source).toContain("joint.dia.Paper.extend({stylesheet:''})");expect(css).toContain('vector-effect:non-scaling-stroke');expect(source).not.toContain('innerHTML');
  });
});
