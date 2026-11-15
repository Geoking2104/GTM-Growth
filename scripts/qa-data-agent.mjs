/** Bilingual agent UI smoke with explicitly synthetic data, no real credentials or model calls. */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const root = process.cwd();
const output = process.env.DATA_AGENT_QA_OUTPUT_DIR || '../qa-data-agent';
const require = createRequire(root + '/package.json');
const express = require('express'); const {chromium} = require('playwright-core');
const app = express(); app.use(express.static(root + '/site'));
const server = await new Promise(resolve => {const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),headless:true});
await fs.mkdir(output,{recursive:true});
try {
for(const lang of ['fr','en']) for(const width of [390,1440]) {
 const page=await browser.newPage({viewport:{width,height:1000}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('gtm-console-wizard-v1:acme:user','done');});
 await page.route('**/console/auth.js',r=>r.fulfill({contentType:'text/javascript',body:'export const handleRedirect=async()=>({}), accessToken=async()=>"qa-fixture", currentTenant=()=>null, setTenant=()=>{}, accountConsoleUrl=()=>"#tracking", login=async()=>{}, logout=()=>{};'}));
 let profile={role:'marketer',goal:'leads',stage:'grow',audience:lang==='fr'?'Dirigeants de PME (exemple de test)':'SME owners (test fixture)',target:{metric:'sessions',value:500}};
 await page.route('**/api/**',async r=>{
 const url=new URL(r.request().url()); const body=r.request().postDataJSON(); let data, status=200;
 if(url.pathname.endsWith('/me')) data={tenant:{id:'acme',name:lang==='fr'?'Exemple de test · Acme':'Test fixture · Acme',domains:['example.com'],gscProperties:[],ga4Properties:[],bingSites:[],gtmContainers:[],branding:{}},memberships:[{id:'acme',role:'tenant-admin'}],role:'tenant-admin'};
 else if(url.pathname.endsWith('/data-agent/context')) data={profile,slack:'not-configured',actions:[{href:'#ga4',title:lang==='fr'?'Valider les événements clés':'Validate key events',reason:'Test fixture'},{href:'#journey',title:lang==='fr'?'Relier contenus et audience':'Connect content and audience',reason:'Test fixture'}]};
 else if(url.pathname.endsWith('/data-agent/profile')) {profile=body; data={profile};}
 else if(url.pathname.endsWith('/data-agent/query')) data={state:'ready',summary:lang==='fr'?'Mesures de test sur la période indiquée.':'Test measurements for the stated period.',source:'GA4 · Test fixture',readAt:'2026-11-13T12:00:00Z',period:{start:'2026-10-16',end:'2026-11-12'},metrics:[{id:'sessions',label:'Sessions',value:420,unit:'count'},{id:'keyEvents',label:lang==='fr'?'Événements clés':'Key events',value:12,unit:'count'}],caveats:[lang==='fr'?'Données fictives pour la recette. Les événements clés ne sont pas nécessairement des prospects ou des ventes.':'Synthetic QA data. Key events are not necessarily leads or sales.'],href:'#ga4'};
 else {status=503;data={error:'QA fixture: source not connected'};}
 await r.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base+'/console/?lang='+lang+'#ga4');
 await page.locator('#c-data-agent > details > summary').click();
 await page.locator('.c-agent-grid').last().getByRole('button').click();
 await page.locator('.c-agent-answer').getByText('420 / 500',{exact:false}).waitFor();
 if(await page.locator('.c-agent-answer a').getAttribute('href') !== '#ga4') throw new Error('Missing source analysis handoff');
 await page.locator('.c-agent-profile > summary').click();
 await page.locator('.c-agent-grid').first().locator('select').first().selectOption('agency');
 await page.locator('.c-agent-grid').first().getByRole('button').click();
 await page.locator('.c-agent-grid').last().getByRole('button').click();
 await page.locator('.c-agent-answer').getByText('420 / 500',{exact:false}).waitFor();
 const sizing=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));
 if(sizing.documentWidth>width+2) throw new Error('Overflow '+JSON.stringify(sizing));
 if(errors.length) throw new Error(errors.join('\n'));
 await page.screenshot({path:output+'/'+lang+'-'+width+'.png',fullPage:true});
 console.log(JSON.stringify({lang,width,sizing,errors,profileSaved:profile.role==='agency'})); await page.close();
}
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
