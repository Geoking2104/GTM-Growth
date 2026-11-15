/** Offline browser fixtures. No merchant credentials or external payment requests. */
import fs from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright-core';
const app = express(); app.use(express.static('site'));
app.get('/billing-fixture', (_req,res) => res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/console/billing.css"></head><body class="console-page"><main style="padding:20px;max-width:1100px;margin:auto"></main></body></html>'));
app.get('/checkout-fixture', (_req,res) => res.send('Local checkout fixture — no payment'));
const server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const output = process.env.BILLING_QA_OUTPUT_DIR || '../qa-billing'; await fs.mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  for (const lang of ['en','fr']) for (const width of [390,1440]) for (const active of [false,true]) {
    const page = await browser.newPage({viewport:{width,height:1000}}); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    await page.goto(`${base}/billing-fixture`);
    await page.evaluate(async ({lang,active,base}) => {
      document.documentElement.lang=lang;
      const {renderBilling}=await import('/console/billing.js');
      const status={mode:'test',enrolled:true,checkoutEnabled:true,termsVersion:'fixture-v1',limitsVersion:'fixture-v1',termsUrls:{en:base+'/terms',fr:base+'/fr/terms'},
        plans:[{key:'solo',name:'Cloud Solo',chargeCents:null,testChargeCents:3900,pilotPriceCents:3900,limits:{monthlyOperations:100,maxDomains:1}},{key:'agency',name:'Cloud Agence',chargeCents:null,testChargeCents:14900,pilotPriceCents:14900,limits:{monthlyOperations:500,maxDomains:5}}],
        ...(active?{plan:'solo',status:'active',cloudAccess:'paid',paidUntil:'2027-01-01T00:00:00Z',nextPaymentDate:'2027-01-01',limits:{monthlyOperations:100,maxDomains:1},usagePeriod:'2026-11',usage:[{period:'2026-11',metric:'operations',quantity:24}]}:{})};
      window.billingCalls=[];
      const request=async (route,body)=>{window.billingCalls.push({route,body});if(route==='/checkout')return{checkoutUrl:base+'/checkout-fixture'};if(route==='/cancel'){status.status='canceled';status.cancelRequested=true;}return structuredClone(status);};
      document.querySelector('main').append(await renderBilling({me:{role:'tenant-admin'},request,fr:lang==='fr'}));
    },{lang,active,base});
    if (active) {
      page.once('dialog',d=>d.accept());
      await page.getByRole('button',{name:lang==='fr'?'Résilier mon abonnement':'Cancel subscription'}).click();
      await page.getByText(lang==='fr'?'Résiliation demandée':'Cancellation requested',{exact:false}).waitFor();
      if (!(await page.evaluate(()=>window.billingCalls.some(c=>c.route==='/cancel'&&c.body.confirm==='CANCEL_SUBSCRIPTION')))) throw new Error('Cancellation consent missing');
    } else {
      const checks=page.locator('input[type=checkbox]'); if(await checks.count()!==2 || await checks.first().isChecked()) throw new Error('Missing or preselected consent');
      await checks.first().focus(); await page.keyboard.press('Space'); if(!await checks.first().isChecked())throw new Error('Keyboard consent failed');
    }
    if(await page.evaluate(()=>document.documentElement.scrollWidth)>width+2 || errors.length)throw new Error(JSON.stringify({lang,width,active,errors}));
    await page.screenshot({path:`${output}/${lang}-${width}-${active?'canceled':'consent'}.png`,fullPage:true});
    if(!active) { await page.getByRole('button',{name:lang==='fr'?'Continuer vers Mollie':'Continue to Mollie'}).first().click(); await page.waitForURL(`${base}/checkout-fixture`); }
    console.log(JSON.stringify({lang,width,active,passed:true})); await page.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
