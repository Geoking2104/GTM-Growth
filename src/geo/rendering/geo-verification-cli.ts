/** Local operator CLI; never expose this command as a public API. */
import { DomainVerificationRegistry } from "./domain-registry.js";
import { createSafeVerificationTransport } from "./verification-transport.js";
import type { PendingChallenge } from "./domain-registry.js";
import fs from "node:fs";

async function main() {
  const [action, tenantId, actorId, hostname, methodOrChallenge] = process.argv.slice(2);
  if (!action || !tenantId || !actorId || !hostname) {
    throw new Error("Usage: geo-verification-cli <issue|verify|revoke> <tenantId> <actorId> <hostname> [dns-txt|https-file]; verify reads challenge JSON on stdin");
  }
  const store = new DomainVerificationRegistry();
  try {
    if (action === "issue") {
      if (methodOrChallenge !== "dns-txt" && methodOrChallenge !== "https-file") throw new Error("Verification method required");
      const challenge = store.issue(tenantId, actorId, hostname, methodOrChallenge);
      process.stdout.write(`${JSON.stringify(challenge)}\n`);
    } else if (action === "verify") {
      const challenge = JSON.parse(fs.readFileSync(0, "utf8")) as PendingChallenge;
      if (challenge.hostname !== hostname) throw new Error("Challenge hostname mismatch");
      const grant = await store.verify(tenantId, actorId, challenge, createSafeVerificationTransport());
      process.stdout.write(`${JSON.stringify(grant)}\n`);
    } else if (action === "revoke") {
      store.revoke(tenantId, actorId, hostname);
      process.stdout.write("revoked\n");
    } else throw new Error("Unknown command");
  } finally { store.close(); }
}

if (process.argv[1]?.endsWith("geo-verification-cli.js")) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "verification_failed"}\n`); process.exitCode = 1; });
}
