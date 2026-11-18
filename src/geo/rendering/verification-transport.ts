/** Trusted Node verification transport: public IPv4 pinning, HTTPS/443, no redirects. */
import https from "node:https";
import { resolve4, resolveTxt } from "node:dns/promises";
import { canonicalVerifiedHostname } from "./verified-domain.js";
import { isPublicIpv4 } from "./geo-egress.js";
import type { VerificationTransport } from "./domain-verification.js";

const MAX_BYTES = 256;

export function createSafeVerificationTransport(): VerificationTransport {
  return {
    async resolveTxt(name) {
      if (!name.startsWith("_gtm-growth-verify.")) throw new Error("Unexpected DNS name");
      canonicalVerifiedHostname(name.slice("_gtm-growth-verify.".length));
      return (await resolveTxt(name)).map((parts) => parts.join(""));
    },
    async readHttpsFile(url) {
      const parsed = new URL(url);
      canonicalVerifiedHostname(parsed.hostname);
      if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password ||
          parsed.pathname !== "/.well-known/gtm-growth-verification.txt" || parsed.search || parsed.hash) {
        throw new Error("Invalid verification URL");
      }
      const addresses = await resolve4(parsed.hostname);
      if (!addresses.length || addresses.some((address) => !isPublicIpv4(address))) {
        throw new Error("Non-public verification destination");
      }
      return new Promise<{ status: number; finalUrl: string; body: string; contentType: string }>((resolve, reject) => {
        const request = https.get(url, {
          family: 4,
          timeout: 8000,
          lookup: (_hostname, _options, callback) => callback(null, addresses[0], 4),
          headers: { Accept: "text/plain", "User-Agent": "GTM-Growth-GEO-Verify/2" },
        }, (response) => {
          // Never follow 3xx; content is bounded before decoding.
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_BYTES) { request.destroy(new Error("Oversized verification response")); return; }
            chunks.push(chunk);
          });
          response.on("end", () => resolve({
            status: response.statusCode ?? 0, finalUrl: url,
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: String(response.headers["content-type"] ?? ""),
          }));
          response.on("error", reject);
        });
        request.on("timeout", () => request.destroy(new Error("Verification timeout")));
        request.on("error", reject);
      });
    },
  };
}
