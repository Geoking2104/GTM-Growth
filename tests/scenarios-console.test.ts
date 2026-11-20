import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { buildConsoleRouter } from '../src/console/api.js';
import { scenarioRoutes } from '../src/console/scenarios.js';
import { TenantStore } from '../src/tenants/store.js';
import { draftOf } from '../src/scenarios/model.js';
import { closeScenarioStores } from '../src/scenarios/store.js';
import { closeDecisionStores } from '../src/console/decision-store.js';

const directory = mkdtempSync(join(tmpdir(), 'scenario-console-'));
const issuer = 'https://auth.example.com/realms/gtm-growth';
const store = new TenantStore(join(directory, 'tenants.json'));
for (const id of ['acme', 'other']) store.upsert({ id, name: id, mode: 'organization', issuer,
  domains: [`${id}.example.com`], emailDomains: [], gscProperties: [`sc-domain:${id}.example.com`],
  ga4Properties: ['123'], bingSites: [`https://${id}.example.com`], branding: {}, identityProviders: [], status: 'active', createdAt: '',
});
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'qa-key', alg: 'RS256', use: 'sig' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token() {
  const header = encode({ alg: 'RS256', kid: 'qa-key' });
  const payload = encode({ iss: issuer, aud: 'gtm-console', sub: 'qa-member', exp: Math.floor(Date.now() / 1000) + 120,
    organization: ['acme'], groups: ['/tenants/acme/tenant-user'],
  });
  return `${header}.${payload}.${sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
}
const app = express(); app.use(express.json());
app.use('/console', buildConsoleRouter(scenarioRoutes, { store, keycloakAdmin: null,
  config: { issuer, clientId: 'gtm-console', jwksUrl: `${issuer}/certs` }, jwksLoader: async () => ({ keys: [jwk] }),
}));
let server: ReturnType<typeof app.listen>, origin: string;
beforeAll(() => {
  vi.stubEnv('SCENARIOS_PATH', join(directory, 'scenarios.db'));
  vi.stubEnv('DECISION_PATH', join(directory, 'decision.db'));
  server = app.listen(0); origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/console/scenarios`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); closeScenarioStores(); closeDecisionStores(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const request = (route: string, body: unknown, tenant = 'acme') => fetch(`${origin}/${route}`, {
  method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'X-Tenant': tenant }, body: JSON.stringify(body),
});

it('uses real console middleware without injecting unrelated analytics defaults and returns a typed conflict', async () => {
  const created = await request('create', { draft: { name: 'December plan', startDate: '2026-12-01', endDate: '2026-12-31' } });
  expect(created.status).toBe(200); expect(created.headers.get('cache-control')).toBe('no-store');
  const { plan } = await created.json();
  const update = { id: plan.id, version: plan.version, draft: { ...draftOf(plan), name: 'Reviewed December plan' } };
  expect((await request('update-draft', update)).status).toBe(200);
  const conflict = await request('update-draft', update);
  expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: 'SCENARIO_CHANGED' });
  const listed = await request('list', {});
  expect(listed.status).toBe(200); expect(listed.headers.get('cache-control')).toBe('no-store');
  const list = await listed.json(); expect(list.plans[0].name).toBe('Reviewed December plan'); expect(list.plans[0].nodes).toBeUndefined();
});

it('requires authentication and current tenant membership before serving campaign data', async () => {
  expect((await fetch(`${origin}/list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
  expect((await request('list', {}, 'other')).status).toBe(403);
});
