#!/usr/bin/env node

import { config } from "dotenv";
config();

import { initRedis } from "./cache/redis.js";
import { startServer } from "./server.js";

// Initialize optional Redis cache
initRedis();

const transport = process.argv.includes("--transport")
  ? process.argv[process.argv.indexOf("--transport") + 1]
  : process.env.TRANSPORT || "stdio";

startServer(transport as "stdio" | "http").catch((err) => {
  console.error("Failed to start GTM Growth MCP server:", err);
  process.exit(1);
});
