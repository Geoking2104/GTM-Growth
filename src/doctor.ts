import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

type ServiceStatus = "not-configured" | "reachable" | "unreachable";

async function postgresStatus(url: string | undefined): Promise<ServiceStatus> {
  if (!url) return "not-configured";
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 1500, query_timeout: 1500 });
    client.on("error", () => {});
    try {
      await client.connect();
      await client.query("SELECT 1");
      return "reachable";
    } finally {
      await client.end();
    }
  } catch {
    return "unreachable";
  }
}

async function redisStatus(url: string | undefined): Promise<ServiceStatus> {
  if (!url) return "not-configured";
  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(url, { lazyConnect: true, connectTimeout: 1500, commandTimeout: 1500, retryStrategy: () => null });
    redis.on("error", () => {});
    try {
      await redis.connect();
      return await redis.ping() === "PONG" ? "reachable" : "unreachable";
    } finally {
      redis.disconnect();
    }
  } catch {
    return "unreachable";
  }
}

export async function doctor(env: NodeJS.ProcessEnv = process.env) {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string; engines: { node: string }; dependencies: Record<string, string>;
  };
  const require = createRequire(import.meta.url);
  const missing = Object.keys(manifest.dependencies).filter(name => {
    try { import.meta.resolve(name); return false; } catch { return true; }
  });
  let sqlite = false;
  try {
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    new Database(":memory:").close();
    sqlite = true;
  } catch {
    // Loading the native binding verifies the Node ABI as well as resolution.
  }
  const [postgres, auditRedis, cacheRedis] = await Promise.all([
    postgresStatus(env.AUDIT_DATABASE_URL), redisStatus(env.AUDIT_REDIS_URL), redisStatus(env.REDIS_URL),
  ]);
  const nodeSupported = Number(process.versions.node.split(".")[0]) >= 24;
  return {
    version: manifest.version,
    node: { version: process.version, required: manifest.engines.node, supported: nodeSupported },
    dependencies: { missing, sqlite },
    configuration: {
      auditJobsEnabled: env.AUDIT_JOBS_ENABLED === "true",
      googleCredentialFileConfigured: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS),
      smtpConfigured: Boolean(env.REPORT_SMTP_HOST && env.REPORT_SMTP_USER && env.REPORT_SMTP_PASSWORD && env.REPORT_SMTP_FROM),
    },
    services: { postgres, auditRedis, cacheRedis },
    ready: nodeSupported && missing.length === 0 && sqlite,
  };
}
