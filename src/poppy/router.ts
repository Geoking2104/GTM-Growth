import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireOidc, oidcConfigFromEnv, type OidcConfig, type JwksLoader, type TokenClaims } from "../console/auth.js";
import { withTrust } from "../console/api.js";
import { resolveTenant } from "../tenants/context.js";
import { TenantStore } from "../tenants/store.js";
import { catalog, readModel, querySchema } from "../data-agent/service.js";
import { PapStore } from "./store.js";
import { clientLoader, redirectAllowed } from "./client.js";
import { verifyAssertion, verifySession } from "./crypto.js";
import { membershipReader, type MemberReader } from "./membership.js";
import { authorized, availableResources, resourceSubset, type Policy } from "./policy.js";
import { authorizationMetadata, discovery, metadataPath, openapi } from "./discovery.js";
import { configFromEnv, demand, hash, now, PapError, random, resourcesSchema, scopes, type Code, type Grant, type PapConfig, type Pending, type Principal, type Token } from "./types.js";
export interface PapOptions {
    config?: PapConfig | null;
    store?: PapStore;
    tenants?: TenantStore;
    member?: MemberReader;
    client?: ReturnType<typeof clientLoader>;
    read?: typeof readModel;
    oidc?: OidcConfig | null;
    jwks?: JwksLoader;
    readTimeoutMs?: number;
}
const id = z.string().min(1).max(2048);
const listScopes = (raw: string) => { const s = raw.split(" "); demand(s.length && s.every(x => scopes.includes(x)) && new Set(s).size === s.length, "invalid_scope"); return s; };
const principal = (claims: TokenClaims): Principal => { demand(claims.iss && claims.sub && typeof claims.sid === "string", "login_required", 401); return { issuer: claims.iss, user: claims.sub, session: claims.sid }; };
const same = (a: Principal, b: Principal) => a.issuer === b.issuer && a.user === b.user;
const browserCookie = (req: Request) => /(?:^|;\s*)__Host-pap-consent=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
const subset = (a: string[], b: string[]) => a.every(x => b.includes(x));
/** Must be mounted BEFORE the application's general JSON parser. */
export function mountPoppy(app: Express, options: PapOptions = {}): PapStore | null {
    const config = options.config === undefined ? configFromEnv() : options.config;
    if (!config) {
        app.use("/api/poppy", (_req, res) => res.status(503).set("Cache-Control", "no-store").json({ error: "pilot_disabled" }));
        return null;
    }
    const store = options.store ?? new PapStore(config.path), tenants = options.tenants ?? new TenantStore();
    const member = options.member ?? membershipReader(), loadClient = options.client ?? clientLoader(config.clients);
    const oidc = withTrust(options.oidc === undefined ? oidcConfigFromEnv() : options.oidc, tenants);
    const router = express.Router({ caseSensitive: true, strict: true });
    // Nginx forwards the actual Host. Forwarded host/proto headers never choose Company identity.
    const canonical: RequestHandler = (req, res, next) => { if (req.get("host")?.toLowerCase() !== new URL(config.origin).host.toLowerCase()) {
        res.status(400).json({ error: "invalid_host" });
        return;
    } next(); };
    router.use(canonical);
    router.use((_req, res, next) => { res.locals.papRequestId = random(); res.locals.papStarted = Date.now(); res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }); next(); });
    router.use(express.json({ limit: "16kb", strict: true }), express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 20 }));
    // Periodic lazy housekeeping, bounded to one pass per minute per process.
    let purged = 0;
    router.use((req, _res, next) => { try {
        if (now() > purged + 60) {
            store.prune();
            purged = now();
        }
        store.rate(`edge:${req.ip}`, 300);
        next();
    }
    catch (e) {
        next(e);
    } });
    const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown, timeout = 0): RequestHandler => (req, res, next) => {
        const work = Promise.resolve().then(() => fn(req, res));
        let timer: NodeJS.Timeout | undefined;
        const pendingWork = timeout ? Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PapError(504, "read_timeout")), timeout); })]) : work;
        void pendingWork.catch(next).finally(() => clearTimeout(timer));
    };
    const auth = requireOidc(oidc, options.jwks);
    const checkOrigin = (req: Request) => demand(req.get("origin") === config.origin, "invalid_origin", 403);
    const pending = (req: Request, request: string) => { const p = store.get<Pending>("pending", request); demand(p && p.browser === hash(browserCookie(req)), "request_expired"); return p; };
    async function consoleMember(req: Request, res: Response, tenantId: string) {
        const claims = res.locals.user as TokenClaims;
        const p = principal(claims);
        const tenant = tenants.get(tenantId);
        demand(tenant && tenant.status === "active", "workspace_denied", 403);
        const role = await member(p, tenant);
        demand(role, "workspace_denied", 403);
        return { p, tenant, role };
    }
    function finish(res: Response, p: Pending, params: Record<string, string>) { const u = new URL(p.redirect); if (p.state !== undefined)
        u.searchParams.set("state", p.state); u.searchParams.set("iss", config!.issuer); for (const [k, v] of Object.entries(params))
        u.searchParams.set(k, v); return res.json({ redirect: u.href }); }
    function issue(g: Grant, selectedScopes: string[], resource: string) {
        store.active(g.id);
        const access = random(), refresh = random();
        store.put("access", hash(access), { grant: g.id, client: g.client, scopes: selectedScopes, resource, expires: now() + 300 } satisfies Token, now() + 300);
        store.put("refresh", hash(refresh), { grant: g.id, client: g.client, scopes: selectedScopes, resource, expires: g.expires } satisfies Token, g.expires);
        return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 300, scope: selectedScopes.join(" ") };
    }
    app.get("/.well-known/poppy.json", canonical, (_req, res) => res.json(discovery(config)));
    app.get("/.well-known/oauth-protected-resource", canonical, (_req, res) => res.json({ resource: config.origin, authorization_servers: [config.issuer], scopes_supported: scopes, bearer_methods_supported: ["header"] }));
    app.get(new URL(metadataPath(config.issuer)).pathname, canonical, (_req, res) => res.json(authorizationMetadata(config)));
    router.get("/openapi.json", (_req, res) => res.json(openapi(config)));
    router.get("/capabilities", (_req, res) => res.json({ protocolVersion: "1.0", status: "allowlisted-pilot", models: catalog, writes: false, providerCompatibility: "Requires a successful test of the actual agent version and access mode" }));
    router.get("/oauth/authorize", wrap(async (req, res) => {
        // Establish a trusted redirect before returning any OAuth error to a client.
        const address = z.object({ client_id: id, redirect_uri: id }).passthrough().parse(req.query);
        const client = await loadClient(address.client_id);
        demand(client.redirect_uris.some(r => redirectAllowed(address.redirect_uri, r)), "invalid_redirect_uri");
        try {
            const q = z.object({ client_id: id, redirect_uri: id, response_type: z.literal("code"), scope: id, state: z.string().max(2048).optional(), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal("S256") }).strict().parse(req.query);
            const requested = listScopes(q.scope);
            const request = random(), browser = random();
            store.put("pending", request, { client: client.client_id, clientName: client.client_name, redirect: q.redirect_uri, state: q.state, challenge: q.code_challenge, scopes: requested, browser: hash(browser), expires: now() + 600 } satisfies Pending, now() + 600);
            res.cookie("__Host-pap-consent", browser, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600000 });
            res.redirect(303, `${config.origin}/console/agents.html?request=${request}`);
        }
        catch (e) {
            if (!(e instanceof PapError || e instanceof ZodError))
                throw e;
            const redirect = new URL(address.redirect_uri);
            redirect.searchParams.set("error", e instanceof PapError ? e.code : "invalid_request");
            redirect.searchParams.set("iss", config.issuer);
            if (typeof req.query.state === "string" && req.query.state.length <= 2048)
                redirect.searchParams.set("state", req.query.state);
            return res.redirect(303, redirect.href);
        }
    }));
    router.post("/console/context", auth, wrap(async (req, res) => {
        checkOrigin(req);
        const q = z.object({ tenant: id.optional(), request: id.optional() }).strict().parse(req.body);
        const claims = res.locals.user as TokenClaims;
        const p = principal(claims);
        const workspaces: {
            id: string;
            name: string;
        }[] = [];
        for (const t of tenants.list()) {
            try {
                const ctx = resolveTenant(claims, tenants, oidc?.issuer ?? "", t.id);
                if (ctx.memberships.some(m => m.id === t.id) && await member(p, t))
                    workspaces.push({ id: t.id, name: t.name });
            }
            catch (e) {
                if (e instanceof PapError && e.status === 503)
                    throw e;
            }
        }
        const tenantId = q.tenant ?? (workspaces.length === 1 ? workspaces[0].id : undefined);
        const pendingRequest = q.request ? pending(req, q.request) : undefined;
        if (!tenantId)
            return res.json({ workspaces, scopes, request: pendingRequest ? { client: pendingRequest.client, clientName: pendingRequest.clientName, scopes: pendingRequest.scopes } : null });
        const ctx = await consoleMember(req, res, tenantId);
        const policy = store.get<Policy>("policy", tenantId) ?? { enabled: false, clients: [] };
        const grants = store.all<Grant>("grant").filter(g => g.tenant === tenantId && (ctx.role === "tenant-admin" || same(g, p)));
        return res.json({ workspaces, tenant: { id: ctx.tenant.id, name: ctx.tenant.name }, role: ctx.role, user: p.user, resources: availableResources(ctx.tenant), policy, allowedClients: config.clients, scopes, grants: grants.map(g => ({ ...g, session: undefined })), request: pendingRequest ? { client: pendingRequest.client, clientName: pendingRequest.clientName, scopes: pendingRequest.scopes, allowed: policy.enabled && policy.clients.includes(pendingRequest.client) } : null });
    }));
    router.post("/console/policy", auth, wrap(async (req, res) => {
        checkOrigin(req);
        const q = z.object({ tenant: id, enabled: z.boolean(), clients: z.array(id).max(50) }).strict().parse(req.body);
        const ctx = await consoleMember(req, res, q.tenant);
        demand(ctx.role === "tenant-admin" && subset(q.clients, config.clients), "workspace_denied", 403);
        store.atomic(() => { store.put("policy", q.tenant, { enabled: q.enabled, clients: q.clients }, 253402300799); for (const g of store.all<Grant>("grant"))
            if (g.tenant === q.tenant && (!q.enabled || !q.clients.includes(g.client)))
                store.revoke(g.id); store.audit(q.tenant, null, "policy", q.enabled ? "enabled" : "disabled"); });
        return res.json({ saved: true });
    }));
    router.post("/console/metrics", auth, wrap(async (req, res) => {
        checkOrigin(req);
        const q = z.object({ tenant: id }).strict().parse(req.body);
        const ctx = await consoleMember(req, res, q.tenant);
        demand(ctx.role === "tenant-admin", "workspace_denied", 403);
        const rows = store.db.prepare("SELECT action,outcome,model,count(*) AS count,round(avg(duration_ms)) AS meanDurationMs,max(duration_ms) AS maxDurationMs FROM pap_audit WHERE tenant=? AND at>=? GROUP BY action,outcome,model").all(q.tenant, now() - 30 * 86400);
        return res.json({ periodDays: 30, events: rows });
    }));
    router.post("/console/consent", auth, wrap(async (req, res) => {
        checkOrigin(req);
        const q = z.object({ request: id, tenant: id.optional(), approve: z.boolean(), scopes: z.array(id).max(5).default([]), resources: resourcesSchema.optional() }).strict().parse(req.body);
        const p = pending(req, q.request);
        if (!q.approve) {
            store.remove("pending", q.request);
            return finish(res, p, { error: "access_denied" });
        }
        demand(q.tenant && q.resources && q.scopes.length && subset(q.scopes, p.scopes), "invalid_scope");
        const ctx = await consoleMember(req, res, q.tenant);
        const policy = store.get<Policy>("policy", q.tenant);
        demand(policy?.enabled && policy.clients.includes(p.client) && config.clients.includes(p.client), "access_denied", 403);
        demand(resourceSubset(q.resources, availableResources(ctx.tenant)), "resource_denied", 403);
        const client = await loadClient(p.client);
        demand(client.redirect_uris.some(r => redirectAllowed(p.redirect, r)), "invalid_redirect_uri");
        const code = random();
        store.atomic(() => {
            pending(req, q.request);
            const policyNow = store.get<Policy>("policy", q.tenant!);
            demand(policyNow?.enabled && policyNow.clients.includes(p.client), "access_denied", 403);
            const g: Grant = { ...ctx.p, id: random(), client: p.client, clientName: client.client_name, tenant: ctx.tenant.id, scopes: [...new Set(q.scopes)], resources: q.resources!, created: now(), expires: now() + 30 * 86400, lastUsed: null, revoked: null };
            store.saveGrant(g);
            store.put("code", hash(code), { grant: g.id, client: g.client, redirect: p.redirect, challenge: p.challenge, expires: now() + 60 } satisfies Code, now() + 60);
            store.remove("pending", q.request);
            store.audit(g.tenant, g.id, "consent", "granted");
        });
        return finish(res, p, { code });
    }));
    router.post("/console/revoke", auth, wrap(async (req, res) => {
        checkOrigin(req);
        const q = z.object({ tenant: id, grant: id }).strict().parse(req.body);
        const ctx = await consoleMember(req, res, q.tenant);
        const g = store.grant(q.grant);
        demand(g && g.tenant === q.tenant && (same(g, ctx.p) || ctx.role === "tenant-admin"), "workspace_denied", 403);
        store.atomic(() => { for (const related of store.all<Grant>("grant"))
            if (related.tenant === g.tenant && related.client === g.client && same(related, g))
                store.revoke(related.id); });
        return res.json({ revoked: true });
    }));
    const assertionFields = { client_id: id, client_assertion_type: z.literal("urn:ietf:params:oauth:client-assertion-type:jwt-bearer"), client_assertion: z.string().min(1).max(16000) };
    async function authenticate(q: {
        client_id: string;
        client_assertion: string;
    }) {
        try {
            const c = await loadClient(q.client_id);
            verifyAssertion(q.client_assertion, c, config!.issuer, store);
            return c;
        }
        catch {
            throw new PapError(401, "invalid_client");
        }
    }
    router.post("/oauth/token", wrap(async (req, res) => {
        demand(req.is("application/x-www-form-urlencoded") && Object.keys(req.query).length === 0);
        const q = z.object({ ...assertionFields, grant_type: z.enum(["authorization_code", "refresh_token"]), code: id.optional(), redirect_uri: id.optional(), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(), refresh_token: id.optional(), scope: id.optional(), resource: id.optional() }).strict().parse(req.body);
        await authenticate(q);
        demand(!q.resource || q.resource === config.origin, "invalid_target");
        const bucket = q.grant_type === "authorization_code" ? "code" : "refresh";
        const value = bucket === "code" ? q.code : q.refresh_token;
        demand(value, "invalid_grant");
        const key = hash(value);
        const previous = store.get<Code | Token>(bucket, key);
        demand(previous && previous.client === q.client_id, "invalid_grant");
        if (bucket === "code") {
            const code = previous as Code;
            demand(q.redirect_uri === code.redirect && q.code_verifier && hash(q.code_verifier) === code.challenge && !q.resource && !q.scope, "invalid_grant");
        }
        let g: Grant;
        try {
            g = (await authorized(previous.grant, store, tenants, config, member)).grant;
        }
        catch (e) {
            if (e instanceof PapError && e.status === 401)
                throw new PapError(400, "invalid_grant");
            throw e;
        }
        const previousScopes = bucket === "code" ? g.scopes : (previous as Token).scopes;
        const wanted = q.scope ? listScopes(q.scope) : previousScopes;
        demand(subset(wanted, previousScopes), "invalid_scope");
        return store.atomic(() => { demand(store.get(bucket, key), "invalid_grant"); store.active(g.id); store.remove(bucket, key); const issued = issue(g, wanted, q.resource ?? config.origin); store.audit(g.tenant, g.id, bucket === "code" ? "token" : "refresh", "ok"); return res.json(issued); });
    }));
    router.post("/oauth/revoke", wrap(async (req, res) => {
        demand(req.is("application/x-www-form-urlencoded") && Object.keys(req.query).length === 0);
        const q = z.object({ ...assertionFields, token: id, token_type_hint: z.string().max(100).optional() }).strict().parse(req.body);
        await authenticate(q);
        store.atomic(() => { const t = store.get<Token>("refresh", hash(q.token)); if (t?.client === q.client_id)
            store.revoke(t.grant); const a = store.get<Token>("access", hash(q.token)); if (a?.client === q.client_id)
            store.remove("access", hash(q.token)); });
        return res.status(200).end();
    }));
    router.post("/read", wrap(async (req, res) => {
        demand(Object.keys(req.query).length === 0 && !req.headers["x-tenant"] && req.is("application/json"));
        demand(req.get("poppy-version") === "1.0", "version_unsupported");
        demand(!req.get("poppy-extensions"), "extension_unsupported");
        const q = querySchema.parse(req.body);
        const raw = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.get("authorization") ?? "")?.[1];
        demand(raw, "invalid_token", 401);
        const token = store.get<Token>("access", hash(raw));
        demand(token && token.resource === config.origin, "invalid_token", 401);
        const g = store.active(token.grant);
        res.locals.papGrant = g;
        res.locals.papModel = q.model;
        demand(token.client === g.client && token.scopes.includes(`gtm:${q.model}:read`) && g.scopes.includes(`gtm:${q.model}:read`), "insufficient_scope", 403);
        store.rate(`grant:${g.id}`, 30);
        store.rate(`tenant:${g.tenant}`, 120);
        try {
            const client = await loadClient(token.client);
            verifySession(req.get("poppy-session") ?? "", client, config.issuer, req.method, `${config.origin}${req.originalUrl.split("?")[0]}`, raw, `${g.issuer}:${g.user}:${g.tenant}`, store);
        }
        catch (e) {
            throw new PapError(400, e instanceof PapError && e.code === "session_ended" ? "session_ended" : "invalid_session");
        }
        const requestId = res.locals.papRequestId as string;
        {
            const current = await authorized(g.id, store, tenants, config, member);
            demand(!res.headersSent, "read_timeout", 504);
            demand(!q.source || (q.model === "search" ? current.tenant.gscProperties : q.model === "analytics" ? current.tenant.ga4Properties ?? [] : []).includes(q.source), "resource_denied", 403);
            const release = store.lease(g.tenant);
            const work = Promise.resolve().then(() => (options.read ?? readModel)(current.tenant, q));
            void work.then(release, release);
            const data = await work;
            demand(!res.headersSent, "read_timeout", 504);
            const final = await authorized(g.id, store, tenants, config, member);
            demand(JSON.stringify(availableResources(final.tenant)) === JSON.stringify(availableResources(current.tenant)), "resource_denied", 403);
            demand(/^#[a-z_]+(?:\/[a-z_-]+)?$/.test(data.href), "service_unavailable", 503);
            return store.atomic(() => { demand(!res.headersSent, "read_timeout", 504); const latest = store.active(g.id); latest.lastUsed = now(); store.saveGrant(latest); store.audit(g.tenant, g.id, "read", data.state, q.model, requestId, Date.now() - res.locals.papStarted); return res.json({ schemaVersion: "1.0", requestId, workspaceId: g.tenant, data: { ...data, href: `${config.origin}/console/${data.href}` } }); });
        }
    }, options.readTimeoutMs ?? 15000));
    router.use((_req, res) => res.status(404).json({ error: "not_found" }));
    router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
        let e = error instanceof PapError ? error : error instanceof ZodError || (error as {
            type?: string;
        })?.type === "entity.parse.failed" ? new PapError(400, "invalid_request") : (error as {
            type?: string;
        })?.type === "entity.too.large" ? new PapError(413, "input_too_large") : new PapError(503, "service_unavailable");
        if (e.status === 401 || e.code === "insufficient_scope")
            res.set("WWW-Authenticate", `Bearer error="${e.code}", resource_metadata="${config.origin}/.well-known/oauth-protected-resource"`);
        const g = res.locals.papGrant as Grant | undefined;
        if (g) {
            try { store.audit(g.tenant, g.id, "read", e.code, res.locals.papModel, res.locals.papRequestId, Date.now() - res.locals.papStarted); }
            catch { e = new PapError(503, "service_unavailable"); }
        }
        if (e.status === 429)
            res.set("Retry-After", "60");
        return res.status(e.status).json({ error: e.code, requestId: res.locals.papRequestId });
    });
    app.use("/api/poppy", router);
    return store;
}
