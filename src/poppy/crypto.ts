import { constants, createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { demand, hash, now, type Client } from "./types.js";
import type { PapStore } from "./store.js";
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256;
function jwt(raw: string) {
    demand(typeof raw === "string" && raw.length <= 16000 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(raw));
    const parts = raw.split(".");
    const header: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    demand(object(header) && object(claims) && !header.crit && header.b64 === undefined && !header.jku && !header.x5u);
    return { header, claims, data: Buffer.from(parts.slice(0, 2).join(".")), sig: Buffer.from(parts[2], "base64url") };
}
function signature(j: ReturnType<typeof jwt>, keys: Obj[]) {
    const alg = j.header.alg;
    demand(alg === "ES256" || alg === "PS384");
    const matches = keys.filter(k => k.kid === j.header.kid);
    demand(text(j.header.kid) && matches.length === 1);
    const jwk = matches[0];
    demand(!["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(k => k in jwk) && (!jwk.use || jwk.use === "sig") && (!jwk.alg || jwk.alg === alg) && (!jwk.key_ops || (Array.isArray(jwk.key_ops) && jwk.key_ops.includes("verify"))));
    demand(alg === "ES256" ? jwk.kty === "EC" && jwk.crv === "P-256" : jwk.kty === "RSA");
    const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    demand(alg !== "PS384" || (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048);
    demand(verify(alg === "ES256" ? "sha256" : "sha384", j.data, alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 }, j.sig));
}
function lifetime(c: Obj, max: number) { demand(Number.isInteger(c.iat) && Number.isInteger(c.exp) && (c.iat as number) <= now() + 30 && (c.exp as number) > now() && (c.exp as number) > (c.iat as number) && (c.exp as number) - (c.iat as number) <= max && text(c.jti)); }
export function verifyAssertion(raw: string, client: Client, issuer: string, store: PapStore) {
    const j = jwt(raw);
    signature(j, client.keys);
    const c = j.claims;
    demand(!String(j.header.typ ?? "").startsWith("poppy-"));
    demand(c.iss === client.client_id && c.sub === client.client_id && c.aud === issuer);
    lifetime(c, 300);
    demand(store.replay("assertion", `${client.client_id}:${c.jti}`, (c.exp as number) + 30));
}
export function normalizeHtu(raw: string) { const u = new URL(raw); u.hash = ""; u.search = ""; return u.href.replace(/%[0-9a-f]{2}/gi, s => { const c = String.fromCharCode(parseInt(s.slice(1), 16)); return /[A-Za-z0-9._~-]/.test(c) ? c : s.toUpperCase(); }); }
export function verifySession(raw: string, client: Client, issuer: string, method: string, url: string, token: string, account: string, store: PapStore) {
    const j = jwt(raw);
    demand(j.header.typ === "poppy-session+jwt" && j.header.alg === "ES256" && typeof j.header.poppy_dlg === "string");
    const d = jwt(j.header.poppy_dlg);
    demand(d.header.typ === "poppy-delegation+jwt");
    signature(d, client.keys);
    lifetime(d.claims, 86400);
    demand(d.claims.iss === client.client_id);
    const cnf = d.claims.cnf;
    demand(object(cnf) && object(cnf.jwk));
    const k = cnf.jwk;
    demand(k.kty === "EC" && k.crv === "P-256" && text(k.x) && text(k.y) && !k.d);
    const thumb = hash(JSON.stringify({ crv: k.crv, kty: k.kty, x: k.x, y: k.y }));
    demand(j.header.kid === thumb);
    signature(j, [{ ...k, kid: thumb }]);
    const c = j.claims;
    demand(c.iss === client.client_id && c.aud === issuer && c.htm === method && typeof c.htu === "string" && !new URL(c.htu).search && !new URL(c.htu).hash && normalizeHtu(c.htu) === normalizeHtu(url));
    demand(Number.isInteger(c.iat) && (c.iat as number) >= now() - 60 && (c.iat as number) <= now() + 30 && text(c.jti) && text(c.sid) && /^[A-Za-z0-9_-]+$/.test(c.sid) && text(c.sub) && (c.agent_id === undefined || text(c.agent_id)) && c.ath === hash(token));
    store.atomic(() => {
        demand(store.replay("proof", `${client.client_id}:${c.jti}`, now() + 120));
        const bindingKey = hash(`${issuer}:${client.client_id}:${thumb}`);
        const binding = store.get<{
            sub: string;
            expires: number;
        }>("delegated-user", bindingKey);
        demand(!binding || binding.sub === c.sub);
        const expires = Math.max(binding?.expires ?? 0, d.claims.exp as number);
        store.put("delegated-user", bindingKey, { sub: c.sub, expires }, expires);
        const id = hash(JSON.stringify([issuer, client.client_id, c.sid, c.sub]));
        const session = store.get<{
            agent?: string;
            account: string;
        }>("session", id);
        demand(!session || (session.account === account && session.agent === c.agent_id), "session_ended");
        store.put("session", id, { agent: c.agent_id, account }, now() + 30 * 86400);
    });
    return { sid: c.sid, sub: c.sub };
}
