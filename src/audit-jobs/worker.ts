import "dotenv/config";
import { createServer } from "node:http";
import { startAuditRuntime } from "./runtime.js";
import { auditRegistry } from "./metrics.js";
const runtime = await startAuditRuntime({ worker: true });
if (!runtime) throw new Error("AUDIT_JOBS_ENABLED must be true for the audit worker");
// Internal Compose network only; never publish this port at the host edge.
const health = createServer(async (req, res) => {
  try {
    if (req.url === "/metrics") { res.setHeader("Content-Type", auditRegistry.contentType); res.end(await auditRegistry.metrics()); }
    else { await runtime.ready(); res.end("ok"); }
  } catch { res.statusCode = 503; res.end("unavailable"); }
}).listen(3001, "0.0.0.0");
const stop = async () => { health.close(); await runtime.close(); process.exit(0); };
process.once("SIGTERM", stop); process.once("SIGINT", stop);
