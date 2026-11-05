/** Server-side public page fetch with DNS pinning and validated redirects.
 * Conservative by design: only globally routable IPv4 addresses are accepted. */
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Fetcher, FetchResult } from "../geo/http.js";

export function publicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

type Resolve = (host: string) => Promise<string[]>;
type Send = (url: URL, address: string, init: { accept?: string; timeoutMs: number }) => Promise<FetchResult>;
const resolve: Resolve = async (host) => (await lookup(host, { all: true, family: 4 })).map((x) => x.address);
const send: Send = (url, address, init) => new Promise((resolveRequest, reject) => {
  const client = url.protocol === "https:" ? httpsRequest : httpRequest;
  const req = client(url, { signal: AbortSignal.timeout(init.timeoutMs), lookup: (_host, _opts, callback) => callback(null, address, 4), headers: { "User-Agent": "GTM-Growth/1.0", Accept: init.accept ?? "text/html,application/xhtml+xml,text/plain,*/*;q=0.8" } }, (res) => {
    const chunks: Buffer[] = []; let total = 0;
    res.on("data", (chunk: Buffer) => { total += chunk.length; if (total > 5 * 1024 * 1024) req.destroy(new Error("Response too large")); else chunks.push(chunk); });
    res.on("error", reject);
    res.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(", ") : value;
      resolveRequest({ url: url.href, status: res.statusCode ?? 0, ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, headers, body: Buffer.concat(chunks).toString("utf8") });
    });
  });
  req.setTimeout(init.timeoutMs, () => req.destroy(new Error("Request timed out")));
  req.on("error", reject); req.end();
});

export function createPublicFetcher(deps: { resolve?: Resolve; send?: Send } = {}): Fetcher {
  return async (raw, init) => {
    let url = new URL(raw); const deadline = Date.now() + (init?.timeoutMs ?? 12000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || !url.hostname.includes(".") || isIP(url.hostname) || (url.port && url.port !== "80" && url.port !== "443")) throw new Error("Invalid public URL");
      const addresses = await (deps.resolve ?? resolve)(url.hostname);
      if (!addresses.length || addresses.some((ip) => !publicIpv4(ip))) throw new Error("Target does not resolve exclusively to public IPv4 addresses");
      const remaining = deadline - Date.now(); if (remaining <= 0) throw new Error("Request timed out");
      const result = await (deps.send ?? send)(url, addresses[0], { accept: init?.accept, timeoutMs: remaining });
      if ([301, 302, 303, 307, 308].includes(result.status) && result.headers.location) { if (redirects === 3) throw new Error("Too many redirects"); url = new URL(result.headers.location, url); continue; }
      return result;
    }
    throw new Error("Too many redirects");
  };
}
export const fetchPublicPage = createPublicFetcher();
