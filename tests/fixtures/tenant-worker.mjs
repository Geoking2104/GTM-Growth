import { TenantStore, closeTenantStores } from '../../src/tenants/store.ts';
const store = new TenantStore(process.env.TEST_TENANT_REGISTRY);
const worker = process.argv[2];
for (let i = 0; i < 15; i++) store.upsert({ id: `${worker}-${i}`, name: 'Example', mode: 'organization', issuer: 'https://example.org', domains: [], emailDomains: [], gscProperties: [], branding: {}, identityProviders: [], status: 'active', createdAt: '2026-01-01' });
closeTenantStores();
