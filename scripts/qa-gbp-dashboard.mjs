#!/usr/bin/env node
/** Reference-layout and data-state QA. Synthetic fixtures only; never calls Google. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const output=path.resolve(process.env.LANDING_QA_OUTPUT_DIR||'../qa-landing');await mkdir(output,{recursive:true});
const root=path.resolve('site');
const server=createServer(async(req,res)=>{
 try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw new Error();res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.CHROMIUM_BIN||(existsSync(chromium.executablePath())?chromium.executablePath():'/usr/bin/chromium');
let browser;
try{
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const language of ['fr','en'])for(const width of [1200,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/gbp-fixture*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${language}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/local-seo.css"></head><body style="margin:0;background:#fff"><main class="local-seo-workspace" style="max-width:1150px;margin:24px auto;padding:0 16px"><p style="font:12px sans-serif;color:#68727b">GTM Growth · ${language==='fr'?'Données de test, aucun compte Google':'Test data, no Google account'}</p><div id="fixture"></div></main></body></html>`}));
  await page.goto(`${origin}/gbp-fixture?lang=${language}`);
  await page.evaluate(async()=>{
   const {renderGbpDashboard}=await import('/console/gbp-dashboard.js');
   const sites=[{id:'paris',name:'Atelier Rivoli — Paris',brand:'Atelier',country:'FR',languages:['fr'],kind:'physical'},{id:'lyon',name:'Atelier — Lyon',country:'FR',languages:['fr'],kind:'physical'},{id:'web',name:'Online',country:'FR',languages:['fr'],kind:'web-only'}];
   window.requests=[];window.mode='ok';
   const call=async(route,body)=>{
    window.requests.push({route,body});
    if(window.mode==='delayed')return new Promise(resolve=>{window.resolveLate=resolve;});
    return {siteId:body.siteId,month:body.month,metric:body.metric,fetchedAt:new Date().toISOString(),reviews:{status:'available',average:4,total:12,sample:{size:12,complete:true,positive:8,negative:2,neutral:2,unknown:0}},performance:window.mode==='partial'?{status:'unavailable',code:'GBP_QUOTA'}:{status:'available',points:Array.from({length:12},(_,i)=>({date:`${body.month}-${String(i+1).padStart(2,'0')}`,value:i===3?null:i===0?0:[3,7,5,9][i%4]})),reportedDays:11,expectedDays:12}};
   };
   document.getElementById('fixture').append(renderGbpDashboard({data:{sites,bindings:[{siteId:'paris',location:'locations/1'}]},call,admin:true}));
  });
  const dashboard=page.locator('.gbp-dashboard'),load=dashboard.locator('.gbp-filters button');
  assert.equal(await dashboard.locator('.gbp-reviews .gbp-number').textContent(),'—');
  await load.click();await page.waitForFunction(()=>document.querySelector('.gbp-dashboard').getAttribute('aria-busy')==='false');
  assert.equal(await dashboard.locator('.gbp-reviews .gbp-number').textContent(),'12');
  assert.equal(await dashboard.locator('.gbp-bars .gbp-bar').count(),12);assert.equal(await dashboard.locator('.gbp-missing').count(),1);
  assert.equal(await dashboard.locator('.gbp-gauge-score strong').textContent(),'4');
  await dashboard.locator('.gbp-performance summary').click();assert.equal(await dashboard.locator('.gbp-data-table tr').count(),13);await dashboard.locator('.gbp-performance summary').click();
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=width+1,JSON.stringify(dimensions));
  await page.screenshot({path:path.join(output,`gbp-${language}-${width}.png`),fullPage:true});
  await dashboard.locator('select').nth(2).selectOption('CALL_CLICKS');await dashboard.locator('select').nth(1).selectOption({index:1});await load.click();await page.waitForFunction(()=>document.querySelector('.gbp-dashboard').getAttribute('aria-busy')==='false');
  const request=await page.evaluate(()=>window.requests.at(-1));assert.equal(request.body.metric,'CALL_CLICKS');assert.equal(request.route,'gbp/dashboard');
  await page.evaluate(()=>{window.mode='partial';});await load.click();await page.waitForFunction(()=>document.querySelector('.gbp-dashboard').getAttribute('aria-busy')==='false');assert.equal(await dashboard.locator('.gbp-reviews .gbp-number').textContent(),'12');assert.match(await dashboard.locator('.gbp-empty-chart').innerText(),/quota/i);
  await page.evaluate(()=>{window.mode='delayed';});await load.click();await page.waitForFunction(()=>!!window.resolveLate);
  await dashboard.locator('select').first().selectOption('lyon');assert.equal(await load.isDisabled(),true);
  await page.evaluate(()=>window.resolveLate({reviews:{status:'available',average:5,total:999},fetchedAt:new Date().toISOString()}));
  assert.equal(await dashboard.locator('.gbp-reviews .gbp-number').textContent(),'—');assert.match(await dashboard.locator('.gbp-business-name').innerText(),/Lyon/);
  await dashboard.locator('select').first().selectOption('web');assert.match(await dashboard.locator('[role="status"]').innerText(),language==='fr'?/non applicables/:/not applicable/);
  assert.equal(await load.isDisabled(),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('GBP dashboard: FR/EN desktop/mobile, filters, partial errors, zero/missing and stale-response isolation passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
