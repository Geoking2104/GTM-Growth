/** Install and exercise the tarball exactly as an outside consumer would. */
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const run = promisify(execFile);
const directory = mkdtempSync(join(tmpdir(), "gtm-growth-package-"));
const tarball = join(directory, "gtm-growth.tgz");
const env = { ...process.env, AUDIT_DATABASE_URL: "", AUDIT_REDIS_URL: "", REDIS_URL: "", GOOGLE_APPLICATION_CREDENTIALS: "", TRANSPORT: "stdio" };
const fixture = createServer((req, res) => {
  if (req.url === "/") return res.writeHead(200, { "content-type": "text/html" }).end("<html><head><title>Example</title></head><body><h1>Example</h1></body></html>");
  if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nAllow: /\n");
  return res.writeHead(404).end();
});

try {
  execFileSync("pnpm", ["pack", "--json", "--out", tarball], { stdio: ["ignore", "pipe", "inherit"] });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "gtm-growth-package-smoke", private: true }));
  writeFileSync(join(directory, "pnpm-workspace.yaml"), "packages: []\nallowBuilds:\n  better-sqlite3: true\n  msgpackr-extract: true\n");
  execFileSync("pnpm", ["add", tarball], { cwd: directory, stdio: "inherit" });
  const bin = join(directory, "node_modules/gtm-growth/dist/bin.js");
  const cli = (...args) => run(process.execPath, [bin, ...args], { cwd: directory, env, timeout: 15000 });
  const { stdout } = await run("pnpm", ["exec", "gtm-growth", "doctor"], { cwd: directory, env, timeout: 15000 });
  const diagnostics = JSON.parse(stdout);
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.services.postgres, "not-configured");
  await assert.rejects(cli("doctor", "--require-services"), { code: 1 });

  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const url = `http://127.0.0.1:${fixture.address().port}/`;
  const args = ["geo-audit", "--url", url, "--no-ai-discovery"];
  assert.ok(JSON.parse((await cli(...args)).stdout).checks.length > 0);
  await assert.rejects(cli(...args, "--min-score", "100"), { code: 1 });
  await assert.rejects(cli("geo-audit", "--url", `${url}missing`), { code: 2 });
  await assert.rejects(cli("geo-audit"), { code: 2 });

  const mcp = new Client({ name: "package-smoke", version: "1.0.0" });
  try {
    await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "--transport", "stdio"], env }), { timeout: 10000 });
    assert.ok((await mcp.listTools()).tools.length > 0);
  } finally {
    await mcp.close();
  }
  console.log("Packaged CLI and MCP passed without Google credentials. Audit exit codes: 0, 1, 2.");
} finally {
  fixture.close();
  rmSync(directory, { recursive: true, force: true });
}
