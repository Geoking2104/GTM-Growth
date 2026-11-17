/** Public release smoke: verify the account theme's real CSS, logo and font delivery. */
import assert from 'node:assert/strict';
const origin = 'https://auth.kayroslab.com';
const read = async path => {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, 'Only check the configured authentication origin');
  const response = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(15000) });
  assert.equal(response.status,200,`Brand asset unavailable: ${url.pathname}`);
  return response;
};
const page = await (await read('/realms/gtm-growth/account/?kc_locale=fr')).text();
const environment = JSON.parse(page.match(/<script id="environment" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || 'null');
assert.ok(environment, 'Account environment missing');
assert.equal(environment.logo,'img/brand.svg','Account logo is not configured');
assert.equal(environment.logoUrl,'https://gtm.kayroslab.com/console/');
assert.match(page,/<title>GTM Growth<\/title>/);
const base = environment.resourceUrl;
assert.match(base,/^\/resources\/[a-zA-Z0-9_-]+\/account\/gtm-growth$/);
const css = await (await read(`${base}/css/gtm-growth-account.css`)).text();
assert.match(css,/--gtm-purple:#6935dc/);
assert.match(css,/@font-face/);
const logo=await (await read(`${base}/img/brand.svg`)).text();
assert.match(logo,/GTM Growth/);
assert.match(logo,/data:image\/png;base64,/);
const font=await read(`${base}/fonts/InterVariable.woff2`);
assert.ok((await font.arrayBuffer()).byteLength>10000,'Inter font was not delivered');
const favicon=await read(`${base}/favicon.svg`);assert.match(favicon.headers.get('content-type')||'',/svg/);
console.log('Keycloak account brand verified: configured wordmark, violet CSS, Inter, favicon and console destination.');
