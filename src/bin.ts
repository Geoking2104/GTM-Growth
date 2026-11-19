#!/usr/bin/env node

const command = process.argv[2];
// Existing MCP clients invoke the binary without a subcommand or with server flags.
if (command && (!command.startsWith("-") || command === "--help" || command === "-h")) {
  await import("./cli.js");
} else {
  await import("./index.js");
}
