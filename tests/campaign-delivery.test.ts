import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { checkCampaignStudio } from '../scripts/check-campaign-studio.mjs';

const bundle = 'export const dia = {};';
const digest = createHash('sha256').update(bundle).digest('hex');
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'";
function fixture({ mime = 'application/javascript', contents = bundle, legacyImport = false } = {}) {
  return async (url: URL) => {
    const path = url.pathname;
    if (path.endsWith('/joint.js')) return new Response(contents, { headers: { 'content-type': mime, 'x-content-type-options': 'nosniff' } });
    if (path.endsWith('/scenarios.js')) return new Response(`import('/assets/vendor/joint-core/joint.${legacyImport ? 'mjs' : 'js'}')`, { headers: { 'content-type': 'application/javascript' } });
    if (path.endsWith('.css')) return new Response('.scenario{}', { headers: { 'content-type': 'text/css' } });
    if (path.endsWith('.svg')) return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
    return new Response('<link href="scenarios.css">', { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp } });
  };
}
const options = { origin: 'https://gtm.example.test', expectedJointSha: digest };
it('accepts the exact public JavaScript bundle and strict-CSP console shells', async () => {
  expect(await checkCampaignStudio({ ...options, fetcher: fixture() })).toMatchObject({ resources: 6, jointSha256: digest, jointContentType: 'application/javascript' });
});
it.each(['application/octet-stream', 'text/html'])('rejects HTTP200 with %s even when the bundle bytes match', async mime => {
  await expect(checkCampaignStudio({ ...options, fetcher: fixture({ mime }) })).rejects.toThrow('incompatible Content-Type');
});
it('rejects a stale bundle served with the correct MIME type', async () => {
  await expect(checkCampaignStudio({ ...options, fetcher: fixture({ contents: 'export const old = true;' }) })).rejects.toThrow('bytes differ');
});
it('rejects an editor still importing the obsolete extension', async () => {
  await expect(checkCampaignStudio({ ...options, fetcher: fixture({ legacyImport: true }) })).rejects.toThrow('editor must import');
});
