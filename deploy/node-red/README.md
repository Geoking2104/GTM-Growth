# Optional local SEO poller

Pinned runtime: `nodered/node-red:4.1.17` (Node-RED is Apache-2.0 licensed). The upstream image includes dependencies with their own notices; preserve those notices when redistributing. No Node-RED code is vendored here and no paid/community node is installed. Review the upstream image and its SBOM before production use.

`local-seo.json` imports into Node-RED and contains ten documented workflow tabs; only WF-02/03/07/09/10 execute. All requests go to the fixed private backend tick endpoint. Tokens are read from environment, not embedded in flows. WF-08 cannot publish. `settings.cjs` disables the editor, admin routes, inbound HTTP nodes, external function modules and automatic module installation.

The optional Compose profile has no published ports, a private internal network, a read-only root filesystem, dropped capabilities and bounded memory/CPU/process count. The persistent `/data` volume must be writable by UID 1000. This is a proposed pilot budget, not a production load qualification.

To integrate with `deploy/kayroslab-vps/docker-compose.prod.yml`, explicitly attach the existing `gtm-growth` service to both its existing network and `local-seo-internal` through an operator override. Retain the backend's existing network for Google egress. Merge network/volume definitions and use absolute bind paths to this directory: Docker Compose resolves relative paths against its first compose file, so blindly combining these files with `-f` will resolve mounts incorrectly. No automatic deployment is included.

Provision a tenant-bound token/hash map as described in [operations](../../docs/product/LOCAL-SEO-OPERATIONS.md), mount that map read-only in the backend and set `LOCAL_SEO_WORKERS_FILE`. Set `LOCAL_SEO_WORKER_TOKEN` and an independent random `NODE_RED_CREDENTIAL_SECRET` only in the poller environment. Keep the private route blocked at the public reverse proxy as an additional boundary. Use one poller/token per tenant; there is no platform-wide credential.

For an isolated runtime smoke test (no Google calls):

```sh
npm install --prefix /tmp/gtm-node-red --ignore-scripts --no-audit --no-fund node-red@4.1.17
NODE_RED_ENTRY=/tmp/gtm-node-red/node_modules/node-red/red.js node scripts/qa-local-seo-flows.mjs
```

The test changes only its temporary flow copy to target a localhost fixture, then executes all five exported pollers and checks the exact request method, route, bearer token and body. Production flows retain the fixed backend host guard.
