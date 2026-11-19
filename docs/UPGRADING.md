# Upgrade and release guide

[Documentation](README.md) · [Changelog](../CHANGELOG.md) · [Capability register](journey/CAPABILITIES.md)

## Upgrade from 0.22 to 0.23

1. Use Node.js 24 or newer and enable the pnpm shim with `corepack enable pnpm`
   where Corepack is installed. The checkout uses the exact pnpm version in
   `package.json`. Install that pinned version on systems without Corepack.
2. Switch to the reviewed version and run `pnpm install --frozen-lockfile`.
   If the checkout has a legacy `node_modules` folder, move it aside first and
   run the frozen install in the clean tree.
3. Run `pnpm run build`, `node dist/bin.js doctor`, then `pnpm test`. Back up the
   existing data and configuration before upgrading a running installation.
   Docker builds use the same pinned pnpm and lockfile.
4. Use the separate `integrations/eve-data-agent` lockfile with Node.js 26 when
   operating that integration.

The `gtm-growth` executable accepts CLI subcommands. MCP launch configurations
that use `gtm-growth` with server flags or without arguments continue to start
the server. The `gtm-growth-cli` executable also remains available.
[Audit exit codes](CLI.md#audit-exit-codes).

## First public audit · EN

From a checkout, enable pnpm, install the frozen lock and build. Run the checks
below against a public page you are authorised to assess. These commands work
with no Google credentials or running database.

```bash
node dist/bin.js doctor
node dist/bin.js geo-audit --url https://example.com/
```

After the package is published, the public registry supports the same workflow
in a clean directory. `--allow-build` enables the native dependencies used by
the package.

```bash
pnpm dlx --allow-build=better-sqlite3 --allow-build=msgpackr-extract gtm-growth@0.23.0 doctor
pnpm dlx --allow-build=better-sqlite3 --allow-build=msgpackr-extract gtm-growth@0.23.0 geo-audit --url https://example.com/
```

## Premier audit public · FR

Depuis le dépôt, activez pnpm, installez les dépendances avec
`pnpm install --frozen-lockfile`, puis lancez `pnpm run build`. Les commandes
`node dist/bin.js doctor` et `node dist/bin.js geo-audit --url <URL>` vérifient
l’installation et auditent une page publique autorisée. Le parcours fonctionne
sans identifiants Google ni base de données. Après publication, utilisez les
deux commandes `pnpm dlx` ci-dessus depuis un répertoire vierge.

## Prepare a release

Use patch versions for fixes, minor versions for compatible features and major
versions for breaking changes. Align `package.json` and `skills/gtm-growth/SKILL.md`,
move the relevant notes from `[Unreleased]` to a dated version in the changelog,
and review the capability register for that exact version and date.

```bash
pnpm install --frozen-lockfile
pnpm run release:check v0.23.0
pnpm test
node scripts/smoke-package.mjs
```

From the reviewed `main` commit, a maintainer signs the tag with the project’s
release key, verifies it with `git verify-tag v0.23.0`, and pushes the signed tag.
Use hosted CI for the tagged revision and create the GitHub release from that
revision and its changelog. The registry publisher runs `pnpm publish --access public`
with the authorised publishing account. For the first release, verify ownership
in the registry and repeat the clean-directory public audit after publication.
Record source revision, npm package version and deployment evidence independently.

Keep release notes in English and French with the version, observed scope and
activation conditions. Use the deployment runbooks for live configuration.
