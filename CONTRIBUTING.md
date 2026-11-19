# Contributing to GTM Growth

[Project](README.md) · [Documentation hub](docs/README.md) · [Repository audit](docs/maintenance/REPOSITORY-AUDIT.md)

Make a change understandable from the customer decision through its source data,
authorisation and verification. Use the existing stack and module boundaries.

## Documentation contract

| Fact | Canonical home |
| --- | --- |
| Stage, handoff and vocabulary | [Shared journey](docs/journey/README.md) |
| Implemented/optional/deferred status and release evidence | [Capability register](docs/journey/CAPABILITIES.md) |
| User value, workflow and measurement limits | [Marketing](docs/marketing/README.md), [measurement](docs/marketing/MEASUREMENT.md) |
| Runtime and integration boundary | [Technical](docs/technical/README.md), [integration map](docs/technical/INTEGRATION-MAP.md) |
| Configuration, activation and recovery | Module runbook indexed in [operations](docs/technical/OPERATIONS.md) |
| Historical intent | Dated specification or changelog; label superseded behavior |

Keep the root README short. Add details to their canonical guide and link them.
Preserve existing guide URLs where possible; if a file must move, update all
relative links and leave a short compatibility entry at a widely used old path.
Use English-first reference documentation and equivalent FR/EN product copy.
Do not rewrite original supplied specifications as though they were delivered code.

## Evidence and claims

- Link capabilities to concrete source/contracts and meaningful tests.
- Distinguish observed, declared, hypothetical, unknown and sample data.
- Distinguish source availability, configuration, execution, independent readback and production deployment.
- Keep buyer questions separate from observed CRM contact history.
- Document the exact adapter's write gate; a preview or general access role does not authorise publication.
- Show costs and prerequisites for optional providers. Do not invent billing entitlements or provider activation.
- Include source/period/coverage/currency/denominator where a KPI needs them.

## Working on code and site copy

Start from `main`, open a short-lived branch and use a PR to record the issue or
decision, customer behavior and checks. Remove merged branches when their
follow-up work is complete. Archive still-relevant work with a link to its
tracking issue before closing a branch. Keep credentials and customer exports
outside the repository.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run docs:check
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run site:check
```

Run the checks appropriate to the change. For landing/catalog copy, edit shared
sources under `site/` and run `pnpm run site:render`; commit both generated languages.
Use existing browser QA for affected flows. Avoid tests that merely duplicate prose;
prefer broken-link checks and behavior/parity tests.

Mermaid diagrams should explain one relationship with short labels and a nearby
text/table equivalent. Topology and event order belong in diagrams; exact statuses,
configuration mappings and metric definitions belong in tables.

## Release

A PR or merge is not a deployment. Follow [operations](docs/technical/OPERATIONS.md)
and the manual workflow/environment gates. Record the actual deployed revision and
verification evidence. Optional providers need their own live acceptance.
For release metadata, signed tags and the CLI package, see the [upgrade guide](docs/UPGRADING.md).
