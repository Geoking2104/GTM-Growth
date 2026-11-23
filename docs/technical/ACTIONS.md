# Pre-approved action catalog (R11)

This document covers the versioned catalog of actions eligible for one-click
governed execution, its entry/exit rules, its ledger and its audit trail.
The platform's discipline is unchanged: every other external write — robots or
meta changes, WordPress publication, Google Business Profile, CRM, social —
stays OUT of the catalog and keeps its module-specific human confirmation,
without exception and without a configuration to bypass it.

**Catalog version:** `preapproved-actions-v1`. Bumping any terms contract or
governance rule bumps the affected entry's version; a proposal records the
catalog version it was validated against.

## The three pre-approved actions

| Action | Terms contract | External effect |
| --- | --- | --- |
| `indexnow.submit` (`indexnow-submit-v1`) | `{ host, key, urls[1..100] }`, every URL HTTPS and on the exact declared host, tenant-registered domain, IndexNow key grammar enforced | One submission through the existing IndexNow client, which still requires its explicit confirm |
| `draft.generate` (`draft-generate-v1`) | `{ kind: titles \| meta \| outline, input }` with bounded French/English fields | None: open-source local generators, a draft for human review, never a publication |
| `report.dispatch` (`report-dispatch-v1`) | `{ followUpId }` | One branded J+14/J+28 report follow-up to its already-verified recipient, same page, same scope, through the existing strict-TLS R9 pipeline |

## Entry and exit rules

**Entry rules** (`normaliseTerms` in [src/actions/catalog.ts](../../src/actions/catalog.ts)):

- An action must be in the catalog; anything else is refused with an explicit
  French error (`Action hors catalogue…`).
- Terms are strictly normalised and bounded (URL counts, key grammar, field
  lengths, identifier shape); the caller never supplies a raw payload to an
  adapter.
- A proposal expires after 72 hours: approving expired terms requires a new
  proposal, never a silent extension.
- `indexnow.submit` is additionally checked against the tenant's registered
  domains at the route level (`src/console/actions.ts`).

**Exit rules** ([src/actions/ledger.ts](../../src/actions/ledger.ts)):

- An approval covers **the exact terms digest** and expires after 24 hours
  (clamped 1..168 hours); the TTL and digest are journaled with the approval.
- Execution goes through an **atomic claim** (SQLite, immediate transaction).
  A concurrent or repeated execution replays the recorded attempt status; the
  adapter never runs twice for one operation.
- An ambiguous provider outcome (network, timeout) leaves the operation
  `reconciling`: it is **never auto-retried**, and only a verified external
  outcome (`/actions/resolve`) closes it (`succeeded` or `failed`).
- A claim older than `EXECUTION_STALE_MS` (15 minutes) without a completion is
  a dead process: the next claim journals a `stale-claim` event and moves the
  operation to `reconciling` instead of resuming it.
- A proposed or approved operation can be cancelled; a terminal or reconciling
  one cannot be silently mutated.

## Ledger and audit trail

The ledger is a SQLite authority (`ACTIONS_DB_PATH`, default
`data/actions.sqlite3`, mode 0600) shared across processes: tables
`action_operations`, `action_attempts` (one per operation), `action_events`
(the per-execution audit trail, latest-first, capped at 200 events per
operation). Every transition — proposed, approved, claimed, succeeded,
failed, reconciling, stale-claim, resolved, cancelled — writes an event with
its actor, its detail (bounded to 300 characters) and its timestamp.

PAP L2 agents (see the runbook section below) propose operations with the
origin `pap`; the same rules govern them without exception.

## Console routes (tenant-admin gated for writes)

| Route | Contract |
| --- | --- |
| `GET /actions/catalog` | Catalog version, entries, explicit exclusions, governance note — every member |
| `GET /actions/operations` | This tenant's operations, states, terms digests — every member |
| `POST /actions/propose` | `{ action, terms }` → `proposed`, entry rules enforced |
| `POST /actions/approve` | `{ operationId, ttlHours? }` → approval bound to the terms digest |
| `POST /actions/execute` | `{ operationId, approve? }` → the one-click gesture: approve + atomic claim + adapter + journal; replays and stale claims return their recorded status |
| `POST /actions/cancel` | `{ operationId }` → `cancelled` (proposed/approved only) |
| `POST /actions/resolve` | `{ operationId, outcome: succeeded\|failed, detail }` → closes a reconciling operation on a verified external outcome |

A "one-click" execution therefore chains `approve` + `claim` + adapter in a
single gesture, but each step journals its own event: an audit trail per
execution is never optional. The English UI keeps the same contracts; locale
changes labels, never governance.

## PAP L2 (scoped, reviewable agent operations)

The PAP specification (F16/T21/T22) gates agent writes behind the same
catalog: agents never gain a raw write scope, they gain the right to
*propose* catalog operations with exact terms into the same ledger (origin
`pap`), and the tenant's own governance (approve/execute, per the entry/exit
rules above) decides. Execution still runs the target module's own
validations; an agent's standing instruction cannot bypass them. See
[docs/PAP-SPECIFICATION.md](../PAP-SPECIFICATION.md) for the protocol-level
rules; the extension is advertised only after acceptance, behind
`PAP_OPERATIONS_ENABLED` (fail-closed, off by default). This delivery ships
the propose surface: the `gtm:operations:propose` scope, the
`POST /api/poppy/operations/propose` route and the ledger wiring, all
gated on the flag. The flag stays off until pilot acceptance; with the flag
off the scope is refused in consent, absent from discovery, the OAuth
protected-resource metadata and the OpenAPI facade, and the route answers
503. The stable MCP tool contracts are documented in
[docs/mcp/TOOLS.md](../mcp/TOOLS.md) alongside this catalog.

The route contract matches the read pilot: bearer access token, exact
resource origin, `Poppy-Version: 1.0`, no extension headers, a fresh
delegated `Poppy-Session` proof bound to the token, rate limits per grant
and per tenant, and a re-read of the authorization state before writing.
`{ action, terms }` runs the same strict entry rules as the console
proposal (`normaliseTerms`), an IndexNow proposal must target a domain the
tenant owns, and the answer is `{ proposed, operationId, state,
proposalExpiresAt, next }` plus the console link: no execution data, ever.
Both audit trails record the proposal (PAP audit and
`action_events`), with the actor `agent:<client_id>`.

## Validation

- `tests/actions-catalog.test.ts`: catalog versioning, explicit exclusions,
  per-action entry rules (normalisation, bounds, refusals), exact-terms
  digest stability and drift sensitivity.
- `tests/actions-ledger.test.ts`: lifecycle, proposal/approval expiry,
  atomic claim and replay, ambiguous → reconciling → resolved, stale-claim
  detection, cancellation, tenant isolation, per-execution audit events.
- `tests/actions-routes.test.ts`: member/admin gating, catalog publication,
  one-click approve+execute, IndexNow tenant-domain refusal, out-of-catalog
  refusals, replay, cancellation, resolve rules.
- `tests/poppy-operations.test.ts`: the PAP propose surface — no advertisement
  and a 503 while `PAP_OPERATIONS_ENABLED` is off; scope, OAuth token and
  delegated-session gates; a proposal recorded with origin `pap` and actor
  `agent:<client>` for the exact tenant, journalled in both audit trails; and
  the out-of-catalog (`invalid_request`) and out-of-domain (`resource_denied`)
  refusals.
- CI runs every suite with the full toolchain (`pnpm test`).
