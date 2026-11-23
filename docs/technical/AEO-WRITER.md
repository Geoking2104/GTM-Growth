# AEO Writer (R8): answer-grounded content scoring

The AEO Writer closes the R1/R2 loop: the tenant's stored AI-visibility panel
(imported or collected answers) knows the questions users actually asked AI
engines; the AEO Writer scores a tenant-supplied content against those prompts
and drafts what is missing. Everything runs locally: no network call, no
partner call, nothing stored, nothing invented. Unknown stays `null`, never
zero.

## What is scored

- **Prompt coverage.** The panel's prompts are deduplicated, ordered most
  recent first and bounded (20 rows). Each prompt is reduced to its intent
  terms (4+ characters, French/English stopwords stripped, capped at 8); the
  content is matched against them. A prompt with no usable term stays
  `unevaluated`, never counts as answered. Coverage tiers: ≥60% terms `covered`,
  ≥30% `partial`, else `absent`. The first sentence carrying the matched terms
  is returned as evidence.
- **Citability base.** The existing citability audit
  (`src/geo/citability.ts`) runs on the content (plain text is wrapped into a
  tolerant HTML shell; supplied HTML is parsed as-is), with the brand's
  declared website as its reference URL.
- **Combined score.** `score = round(0.6 × coverage + 0.4 × citability)`; a
  panel without usable prompts leaves the coverage and the combined score
  unevaluated (`null`). A high heuristic score never guarantees a citation.

## Drafts

`aeoDrafts` generates local drafts for the prompts the content does not
answer (`absent`/`partial`), bounded to 5, using the open-source generators
(`src/console/generators.ts`, deterministic French templates): three title
proposals and a full outline with FAQ per prompt. A draft is never a
publication; every draft carries its review note and re-reading stays the
tenant's act.

## Routes (active tenant required, member-visible reads)

| Route | Contract |
| --- | --- |
| `POST /aeo-writer/score` | `{ datasetId?, content, brand? }` → scores against the stored panel (default: latest); content 40..20000 chars |
| `POST /aeo-writer/drafts` | `{ datasetId?, content?, brand?, limit? }` → drafts for uncovered prompts (all panel prompts when no content) |

The bilingual Operations panel (`#ops/writer`) renders the score, per-prompt
rows with missing terms and evidence, the citability strengths and gaps, and
the drafts under review notes. Panel errors surface verbatim; nothing is
rendered without data.

## Validation

- `tests/aeo-writer.test.ts`: term extraction and stopword stripping, plain
  text wrapping, prompt dedup/order/bounds, coverage classification,
  null-never-zero without prompts, draft bounds, review notes.
- `tests/aeo-writer-routes.test.ts`: active-tenant gate, missing panel,
  content bounds, score and draft happy paths, dataset id plumbing.
- `tests/aeo-writer-ui.test.ts`: bilingual panel, score table with provenance,
  drafts with review note, error surface (linkedom, FR/EN).
