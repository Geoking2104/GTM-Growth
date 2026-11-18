/** HTTPS CONNECT gateway for the isolated GEO browser. IPv4-only pilot. */
import net from "node:net";
import { resolve4 } from "node:dns/promises";
import { canonicalVerifiedHostname } from "./verified-domain.js";

export function isPublicIpv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) return false;
  const a = ip.split(".").map(Number);
  // Deny special-purpose allocations conservatively. The pilot intentionally has no IPv6 egress.
  if (a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224) return false;
  if (a[0] === 100 && a[1] >= 64 && a[1] <= 127) return false;
  if (a[0] === 169 && a[1] === 254) return false;
  if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return false;
  if (a[0] === 192 && (a[1] === 168 || a[1] === 0 || (a[1] === 88 && a[2] === 99))) return false;
  if (a[0] === 198 && ((a[1] === 18 || a[1] === 19) || (a[1] === 51 && a[2] === 100))) return false;
  if (a[0] === 203 && a[1] === 0 && a[2] === 113) return false;
  if (a[0] === 192 && a[1] === 0 && a[2] === 2) return false;
  return true;
}

export function parseAllowedConnect(line: string, expectedHostname: string): string {
  const match = /^CONNECT ([a-z0-9.-]+):443 HTTP\/1\.[01]$/.exec(line);
  if (!match || match[1] !== canonicalVerifiedHostname(expectedHostname)) {
    throw new Error("Only verified HTTPS host:443 is allowed");
  }
  return match[1];
}

export function createEgressServer(hostname: string) {
  canonicalVerifiedHostname(hostname);
  let active = 0;
  const server = net.createServer((client) => {
    if (active >= 1) { client.end("HTTP/1.1 503 Busy\r\n\r\n"); return; }
    active++;
    let upstream: net.Socket | undefined;
    let header = Buffer.alloc(0);
    let started = false;
    const cleanup = () => { if (active > 0) active--; upstream?.destroy(); };
    client.once("close", cleanup);
    client.setTimeout(45_000, () => client.destroy());
    client.on("data", async function onHeader(chunk: Buffer) {
      if (started) return;
      header = Buffer.concat([header, chunk]);
      if (header.length > 4096) { client.destroy(); return; }
      const end = header.indexOf("\r\n\r\n");
      if (end < 0) return;
      started = true;
      client.removeListener("data", onHeader);
      try {
        const target = parseAllowedConnect(header.subarray(0, end).toString("ascii").split("\r\n")[0], hostname);
        const addresses = await resolve4(target);
        if (!addresses.length || addresses.some((ip) => !isPublicIpv4(ip))) throw new Error("Unsafe DNS answer");
        // TCP connects to an inspected numeric address, preventing DNS rebinding at connect time.
        upstream = net.connect({ host: addresses[0], port: 443, timeout: 8000 });
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          const extra = header.subarray(end + 4);
          if (extra.length) upstream?.write(extra);
          client.pipe(upstream!); upstream!.pipe(client);
        });
        upstream.on("error", () => client.destroy());
        upstream.on("timeout", () => client.destroy());
        upstream.on("close", () => client.destroy());
      } catch { client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); }
    });
    client.on("error", () => client.destroy());
  });
  server.maxConnections = 1;
  return server;
}

if (process.argv[1]?.endsWith("geo-egress.js")) {
  const hostname = process.env.GEO_TARGET_HOSTNAME;
  if (!hostname) throw new Error("GEO_TARGET_HOSTNAME is required");
  createEgressServer(hostname).listen(3128, "0.0.0.0");
}
