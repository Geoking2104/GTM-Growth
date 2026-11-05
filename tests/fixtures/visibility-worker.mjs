import { insertDataset, updateDataset, closeVisibilityStores } from '../../src/console/ai-visibility-store.ts';
const worker = process.argv[2];
for (let i = 0; i < 12; i++) {
  insertDataset('acme', { id: `${worker}-${i}`, createdAt: '2026-01-01T00:00:00Z', brands: [], observations: [] });
  updateDataset('acme', 'shared', (data) => { data.count++; });
}
closeVisibilityStores();
