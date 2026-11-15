import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { publicIpv4 } from "../http/public-fetch.js";
import { demand, type Client } from "./types.js";
export function httpsUrl(raw: unknown): URL {
    demand(typeof raw === "string" && raw.length <= 2048, "invalid_client");
    const u = new URL(raw);
    demand(u.protocol === "https:" && !u.username && !u.password && !u.hash && !isIP(u.hostname) && u.hostname.includes(".") && (!u.port || u.port === "443"), "invalid_client");
    return u;
}
/** No redirects, fixed public IPv4, bounded DNS + entire response, no credentials. */
export async function fetchMetadataResponse(raw: string): Promise<{
    status: number;
    body: unknown;
    location?: string;
}> {
    const u = httpsUrl(raw);
    const signal = AbortSignal.timeout(5000);
    const addresses = await Promise.race([lookup(u.hostname, { all: true, family: 4 }), new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Metadata timeout")), { once: true }))]);
    demand(addresses.length && addresses.every(a => publicIpv4(a.address)), "invalid_client");
    return new Promise((resolve, reject) => {
        const req = request(u, { signal, family: 4, lookup: (_host, _opts, callback) => callback(null, addresses[0].address, 4), headers: { Accept: "application/json", "User-Agent": "GTM-Growth-PAP/1.0" } }, res => {
            if (res.statusCode !== 200) {
                res.resume();
                resolve({ status: res.statusCode ?? 0, body: null, location: res.headers.location });
                return;
            }
            if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(res.headers["content-type"] ?? "")) {
                res.resume();
                reject(new Error("Invalid metadata response"));
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 256 * 1024)
                req.destroy(new Error("Metadata too large"));
            else
                chunks.push(chunk); });
            res.on("error", reject);
            res.on("end", () => { try {
                resolve({ status: 200, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
            }
            catch {
                reject(new Error("Invalid metadata JSON"));
            } });
        });
        req.on("error", reject);
        req.end();
    });
}
export async function fetchMetadata(raw: string): Promise<unknown> { const r = await fetchMetadataResponse(raw); demand(r.status === 200, "invalid_client"); return r.body; }
const loopback = (u: URL) => u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname);
export function redirectAllowed(raw: string, registered: string) {
    try {
        const a = new URL(raw), b = new URL(registered);
        if (loopback(a) && loopback(b)) {
            a.port = "";
            b.port = "";
            return a.href === b.href;
        }
        return raw === registered;
    }
    catch {
        return false;
    }
}
export function clientLoader(allowed: string[], fetcher = fetchMetadata) {
    // No identity/permissions cache: removal of allowlist and key rotation are immediate.
    return async (id: string): Promise<Client> => {
        demand(allowed.includes(id), "invalid_client", 401);
        const url = httpsUrl(id);
        const doc = await fetcher(id) as Partial<Client> & {
            token_endpoint_auth_method?: string;
        };
        demand(doc && doc.client_id === id && typeof doc.client_name === "string" && doc.client_name.length > 0 && doc.client_name.length <= 200 && doc.token_endpoint_auth_method === "private_key_jwt", "invalid_client");
        const keysUrl = httpsUrl(doc.jwks_uri);
        demand(keysUrl.host === url.host, "invalid_client");
        demand(Array.isArray(doc.redirect_uris) && doc.redirect_uris.length > 0 && doc.redirect_uris.length <= 20, "invalid_client");
        for (const r of doc.redirect_uris) {
            const u = new URL(r);
            demand(!u.hash && !u.username && !u.password && (loopback(u) || (u.protocol === "https:" && u.host === url.host)), "invalid_client");
        }
        const jwks = await fetcher(keysUrl.href) as {
            keys?: Record<string, unknown>[];
        };
        demand(jwks && Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.length <= 20, "invalid_client");
        demand(jwks.keys.every(k => !["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(x => x in k)), "invalid_client");
        return { client_id: id, client_name: doc.client_name, jwks_uri: keysUrl.href, redirect_uris: doc.redirect_uris, keys: jwks.keys };
    };
}
