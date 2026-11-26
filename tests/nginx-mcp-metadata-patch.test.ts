import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = join(process.cwd(), "deploy/kayroslab-vps/patch-nginx-mcp-metadata.py");

function patch(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "nginx-mcp-"));
  const file = join(dir, "vhost.conf");
  writeFileSync(file, source);
  const result = spawnSync("python3", [script, "--write", file], { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, text: readFileSync(file, "utf8") };
}

const redirect80 = `
server {
  listen 80;
  server_name gtm.kayroslab.com;
  location ^~ /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://$host$request_uri; }
}
`;

const httpsApp = `
server {
  listen 443 ssl;
  server_name gtm.kayroslab.com *.gtm.kayroslab.com;
  location /api/ { proxy_pass http://127.0.0.1:4300; }
  location ~ ^/(mcp|sse|messages)$ { proxy_pass http://127.0.0.1:4300; }
  location / { try_files $uri $uri/ =404; }
}
`;

describe("nginx MCP metadata patcher", () => {
  it("inserts the well-known proxy only on the app vhost", () => {
    const { status, out, text } = patch(redirect80 + httpsApp);
    expect(status, out).toBe(0);
    expect(out).toContain("inserted");
    const [http, https] = text.split("listen 443");
    expect(http).not.toContain("oauth-protected-resource(/mcp)?");
    expect(https).toContain("oauth-protected-resource(/mcp)?");
    expect(https).toContain("proxy_pass http://127.0.0.1:4300;");
  });

  it("updates a legacy well-known regex and is idempotent afterwards", () => {
    const legacy = httpsApp.replace(
      "  location /api/",
      "  location ~ ^/\\.well-known/(poppy\\.json|oauth-protected-resource|oauth-authorization-server/api/poppy/oauth)$ {\n    proxy_pass http://127.0.0.1:4300;\n  }\n  location /api/",
    );
    const first = patch(legacy);
    expect(first.status, first.out).toBe(0);
    expect(first.out).toContain("updated:");
    expect(first.text).toContain("oauth-protected-resource(/mcp)?");
    const second = patch(first.text);
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain("already");
    expect(second.text).toBe(first.text);
  });
});
