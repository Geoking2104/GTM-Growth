#!/usr/bin/env node
/** Verify public delivery after deployment; no login, campaign writes or AI calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function checkCampaignStudio({ origin, expectedJointSha, fetcher = fetch }) {
  assert.match(expectedJointSha || '', /^[a-f0-9]{64}$/, 'Provide the expected JointJS SHA-256 from the deployed checkout.');
  const base = new URL(origin);
  assert.ok(['https:', 'http:'].includes(base.protocol) && !base.username && !base.password, 'Use a public HTTP(S) origin without credentials.');
  const resources = [
    ['/assets/vendor/joint-core/joint.js', /^(?:application|text)\/javascript$/],
    ['/console/scenarios.js', /^(?:application|text)\/javascript$/],
    ['/console/scenarios.css', /^text\/css$/],
    ['/console/?lang=fr', /^text\/html$/],
    ['/console/?lang=en', /^text\/html$/],
    ['/assets/ai-engines/xai.svg', /^image\/svg\+xml$/],
  ];
  const results = await Promise.all(resources.map(async ([path, mime]) => {
    const response = await fetcher(new URL(path, base), {
      headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, `${path}: expected HTTP 200.`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    assert.match(contentType, mime, `${path}: incompatible Content-Type ${contentType}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0 && bytes.length <= 1_048_576, `${path}: unexpected asset size.`);
    return { path, contentType, bytes, headers: response.headers };
  }));
  const [joint, editor, , french, english] = results;
  assert.equal(createHash('sha256').update(joint.bytes).digest('hex'), expectedJointSha, 'Public JointJS bytes differ from the deployed checkout.');
  assert.equal(joint.headers.get('x-content-type-options'), 'nosniff', 'Keep strict MIME checking on JointJS.');
  assert.ok(new TextDecoder().decode(editor.bytes).includes("'/assets/vendor/joint-core/joint.js'"), 'The public editor must import the JavaScript asset.');
  for (const shell of [french, english]) {
    assert.ok(new TextDecoder().decode(shell.bytes).includes('scenarios.css'), `${shell.path}: Campaign Studio stylesheet is absent.`);
    const csp = shell.headers.get('content-security-policy') || '';
    assert.match(csp, /(?:^|;)\s*script-src\s+'self'\s*(?:;|$)/, `${shell.path}: keep the self-only script policy.`);
    assert.match(csp, /(?:^|;)\s*style-src\s+'self'\s*(?:;|$)/, `${shell.path}: keep the self-only stylesheet policy.`);
  }
  return { resources: results.length, jointSha256: expectedJointSha, jointContentType: joint.contentType };
}

// Supports both a regular CLI invocation and the deployment's Docker stdin entry.
if (!process.argv[1] || import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkCampaignStudio({
    origin: process.env.STUDIO_DELIVERY_ORIGIN || 'https://gtm.kayroslab.com',
    expectedJointSha: process.env.STUDIO_JOINT_SHA256,
  });
  console.log('Campaign Studio public delivery verified:', JSON.stringify(result));
}
