import { z } from "zod";
import { type Tenant, tenantOwnsUrl } from "../tenants/store.js";
import { getConnection } from "../ecommerce/store.js";
import { scopedCustomerRef } from "../ecommerce/identity.js";
import { decodeEcommerceKey } from "../ecommerce/secrets.js";
import {
  id,
  iso,
  identityInput,
  proofInput,
  contactInput,
  eventInput,
  assertEvent,
  assertProof,
  hash,
  uuid,
  now,
  type Identity,
  type Contact,
  type Binding,
  type Event,
  type Proof,
  type EventInput,
} from "./model.js";
import {
  database,
  transaction,
  one,
  many,
  settings,
  saveSettings,
  identityKey,
  audit,
  idempotent,
  blocked,
} from "./store.js";
export type Principal = { tenant: Tenant; actor: string; admin: boolean };
export function role(p: Principal) {
  return p.admin ? "admin" : (settings(p.tenant.id).roles[p.actor] ?? "none");
}
export function access(p: Principal, write = false, admin = false) {
  if (
    p.tenant.status !== "active" ||
    (admin && !p.admin) ||
    !(write ? ["admin", "editor"] : ["admin", "editor", "reader"]).includes(
      role(p),
    )
  )
    throw new Error("CRM_ACCESS");
}
export function enabled(tenant: string) {
  if (!settings(tenant).enabled) throw new Error("CRM_DISABLED");
}
function capacity(
  tenant: string,
  table: "crm_contacts" | "crm_events",
  limit: number,
) {
  const row = database()
    .prepare(`SELECT count(*) AS n FROM ${table} WHERE tenant=?`)
    .get(tenant) as { n: number };
  if (row.n >= limit) throw new Error("CRM_CAPACITY");
}
export function contact(tenant: string, profileId: string) {
  const c = one<Contact>(
    "SELECT payload FROM crm_contacts WHERE tenant=? AND id=?",
    tenant,
    profileId,
  );
  if (!c) throw new Error("CRM_NOT_FOUND");
  return c;
}
function putContact(tenant: string, c: Contact) {
  database()
    .prepare(
      "INSERT INTO crm_contacts VALUES (?,?,?) ON CONFLICT(tenant,id) DO UPDATE SET payload=excluded.payload",
    )
    .run(tenant, c.id, JSON.stringify(c));
}
export function keyForInput(tenant: Tenant, input: Identity) {
  if (
    ["web_user", "web_session"].includes(input.kind) &&
    !tenantOwnsUrl(tenant, "https://" + input.scope)
  )
    throw new Error("CRM_SOURCE_SCOPE");
  if (
    input.kind === "shopify_customer" ||
    input.kind === "prestashop_customer"
  ) {
    const provider =
        input.kind === "shopify_customer" ? "shopify" : "prestashop",
      store = getConnection(tenant.id, input.scope);
    if (!store || store.provider !== provider)
      throw new Error("CRM_SOURCE_SCOPE");
    if (!/^\d+$/.test(input.value.replace(/^gid:\/\/shopify\/Customer\//, "")))
      throw new Error("CRM_INVALID_IDENTITY");
    return commerceKey(
      tenant.id,
      input.scope,
      scopedCustomerRef(
        tenant.id,
        input.scope,
        provider,
        input.value,
        decodeEcommerceKey(process.env.ECOMMERCE_DATA_KEY_B64),
      ),
    );
  }
  return identityKey(tenant.id, input.kind, input.scope, input.value);
}
export const commerceKey = (tenant: string, store: string, reference: string) =>
  identityKey(tenant, "commerce_ref", store, reference);
export function bind(
  tenant: string,
  profileId: string,
  key: string,
  kind: string,
  scope: string,
  proof: Proof,
  actor: string,
  method: Binding["method"],
) {
  enabled(tenant);
  const c = contact(tenant, profileId);
  if (c.status !== "active" || blocked(tenant, key))
    throw new Error("CRM_COLLECTION_BLOCKED");
  assertProof(kind, proof);
  const old = one<Binding>(
    "SELECT payload FROM crm_bindings WHERE tenant=? AND key=?",
    tenant,
    key,
  );
  if (old) {
    if (old.profileId !== profileId) throw new Error("CRM_IDENTITY_CONFLICT");
    if (hash(old.proof) !== hash(proof))
      throw new Error("CRM_BINDING_PROOF_CONFLICT");
    return old;
  }
  const binding: Binding = {
    id: uuid(),
    key,
    kind,
    scope,
    profileId,
    proof,
    actor,
    method,
    at: now(),
  };
  database()
    .prepare("INSERT INTO crm_bindings VALUES (?,?,?,?)")
    .run(tenant, key, profileId, JSON.stringify(binding));
  audit(tenant, actor, "identity-linked", binding.id);
  return binding;
}
export function createNative(p: Principal, key: string, raw: unknown) {
  access(p, true);
  const input = contactInput.parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["create", input], () => {
    enabled(p.tenant.id);
    capacity(p.tenant.id, "crm_contacts", 10000);
    const at = now(),
      c: Contact = {
        ...input,
        id: uuid(),
        status: "active",
        mode: "native",
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
    putContact(p.tenant.id, c);
    bind(
      p.tenant.id,
      c.id,
      identityKey(p.tenant.id, "gtm_contact", "native", c.id),
      "gtm_contact",
      "native",
      { reference: "Native GTM contact record" },
      p.actor,
      "native",
    );
    audit(p.tenant.id, p.actor, "contact-created", c.id);
    return { profileId: c.id };
  });
}
export function upsertExternal(
  tenant: Tenant,
  source: string,
  externalId: string,
  raw: unknown,
  actor: string,
) {
  const input = contactInput.parse(raw),
    key = keyForInput(tenant, {
      kind: "crm_id",
      scope: source,
      value: externalId,
    });
  return transaction(tenant.id, () => {
    enabled(tenant.id);
    if (blocked(tenant.id, key)) throw new Error("CRM_COLLECTION_BLOCKED");
    const binding = one<Binding>(
      "SELECT payload FROM crm_bindings WHERE tenant=? AND key=?",
      tenant.id,
      key,
    );
    if (binding) {
      const c = contact(tenant.id, binding.profileId);
      if (c.status === "paused") throw new Error("CRM_COLLECTION_BLOCKED");
      putContact(tenant.id, {
        ...c,
        ...input,
        updatedAt: now(),
        version: c.version + 1,
      });
      audit(tenant.id, actor, "external-contact-updated", c.id);
      return { profileId: c.id };
    }
    capacity(tenant.id, "crm_contacts", 10000);
    const at = now(),
      c: Contact = {
        ...input,
        id: uuid(),
        mode: "plugin",
        status: "active",
        createdAt: at,
        updatedAt: at,
        version: 1,
      };
    putContact(tenant.id, c);
    bind(
      tenant.id,
      c.id,
      key,
      "crm_id",
      source,
      { reference: "Exact external CRM record supplied by " + source },
      actor,
      "source_asserted",
    );
    audit(tenant.id, actor, "external-contact-created", c.id);
    return { profileId: c.id };
  });
}
export function externalProfile(
  tenant: Tenant,
  source: string,
  externalId: string,
) {
  const key = keyForInput(tenant, {
    kind: "crm_id",
    scope: source,
    value: externalId,
  });
  const binding = one<Binding>(
    "SELECT payload FROM crm_bindings WHERE tenant=? AND key=?",
    tenant.id,
    key,
  );
  if (!binding) throw new Error("CRM_NOT_FOUND");
  return binding.profileId;
}
export function linkIdentity(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({ profileId: id, identity: identityInput, proof: proofInput })
    .strict()
    .parse(raw);
  const identity = keyForInput(p.tenant, i.identity);
  return idempotent(
    p.tenant.id,
    p.actor,
    key,
    ["link", i.profileId, identity, i.proof],
    () => ({
      bindingId: bind(
        p.tenant.id,
        i.profileId,
        identity,
        i.identity.kind,
        i.identity.scope,
        i.proof,
        p.actor,
        "human_declared",
      ).id,
    }),
  );
}
export function linkEvent(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({ profileId: id, eventId: id, proof: proofInput })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["link-event", i], () => {
    const e = one<Event>(
      "SELECT payload FROM crm_events WHERE tenant=? AND id=?",
      p.tenant.id,
      i.eventId,
    );
    if (!e) throw new Error("CRM_NOT_FOUND");
    return {
      bindingId: bind(
        p.tenant.id,
        i.profileId,
        e.identityKey,
        e.identityKind,
        e.identityScope,
        i.proof,
        p.actor,
        "human_declared",
      ).id,
    };
  });
}
export function unlink(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({
      profileId: id,
      bindingId: id,
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["unlink", i], () => {
    const b = many<Binding>(
      "SELECT payload FROM crm_bindings WHERE tenant=? AND profile_id=?",
      p.tenant.id,
      i.profileId,
    ).find((b) => b.id === i.bindingId);
    if (!b || b.kind === "gtm_contact") throw new Error("CRM_NOT_FOUND");
    database()
      .prepare("DELETE FROM crm_bindings WHERE tenant=? AND key=?")
      .run(p.tenant.id, b.key);
    audit(p.tenant.id, p.actor, "identity-unlinked", b.id, i.reason);
    return { unlinked: true };
  });
}
export function record(
  tenant: string,
  source: string,
  input: EventInput,
  provenance: Event["provenance"],
  subject: { key: string; kind: string; scope: string },
  authorization?: string,
) {
  enabled(tenant);
  assertEvent(input);
  const { identity: _discardIdentity, ...safe } = input;
  const digest = hash({ ...safe, identityKey: subject.key, authorization });
  const old = one<Event>(
    "SELECT payload FROM crm_events WHERE tenant=? AND source=? AND event_key=?",
    tenant,
    source,
    input.eventId,
  );
  if (old) {
    if (old.hash !== digest) throw new Error("CRM_EVENT_CONFLICT");
    return { eventId: old.id, duplicate: true, accepted: true };
  }
  const binding = one<Binding>(
    "SELECT payload FROM crm_bindings WHERE tenant=? AND key=?",
    tenant,
    subject.key,
  );
  if (
    blocked(tenant, subject.key) ||
    (binding && contact(tenant, binding.profileId).status === "paused")
  )
    return { accepted: false, reason: "collection_blocked" };
  if (input.supersedes) {
    const previous = one<Event>(
      "SELECT payload FROM crm_events WHERE tenant=? AND source=? AND event_key=?",
      tenant,
      source,
      input.supersedes,
    );
    if (!previous || previous.identityKey !== subject.key)
      throw new Error("CRM_INVALID_CORRECTION");
  }
  capacity(tenant, "crm_events", 100000);
  const e: Event = {
    ...safe,
    id: uuid(),
    source,
    identityKey: subject.key,
    identityKind: subject.kind,
    identityScope: subject.scope,
    provenance,
    ...(authorization ? { authorization } : {}),
    receivedAt: now(),
    hash: digest,
  };
  database()
    .prepare("INSERT INTO crm_events VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      tenant,
      e.id,
      source,
      e.eventId,
      subject.key,
      e.occurredAt,
      e.channel,
      digest,
      JSON.stringify(e),
    );
  return { eventId: e.id, accepted: true, duplicate: false };
}
export function recordFromPlugin(
  tenant: Tenant,
  source: string,
  input: EventInput,
  authorization?: string,
) {
  const subject = input.identity
    ? {
        key: keyForInput(tenant, input.identity),
        kind: input.identity.kind,
        scope: input.identity.scope,
      }
    : {
        key: identityKey(tenant.id, "event_only", source, input.eventId),
        kind: "event_only",
        scope: source,
      };
  return record(
    tenant.id,
    source,
    input,
    "source_asserted",
    subject,
    authorization,
  );
}
export function addManual(p: Principal, key: string, raw: unknown) {
  access(p, true);
  const i = z
    .object({
      profileId: id,
      type: z.enum(["call", "meeting", "note"]),
      occurredAt: iso,
      summary: z.string().trim().min(2).max(280),
      proof: proofInput,
      sourceUrl: eventInput.shape.sourceUrl,
      note: z.string().max(1500).optional(),
    })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["manual", i], () => {
    const c = contact(p.tenant.id, i.profileId);
    if (c.status !== "active") throw new Error("CRM_COLLECTION_BLOCKED");
    const result = record(
      p.tenant.id,
      "manual:" + p.actor,
      eventInput.parse({
        eventId: key,
        channel: "manual",
        type: i.type,
        occurredAt: i.occurredAt,
        summary: i.summary,
        proof: i.proof,
        sourceUrl: i.sourceUrl,
        details: { note: i.note },
      }),
      "human_declared",
      {
        key: identityKey(p.tenant.id, "gtm_contact", "native", c.id),
        kind: "gtm_contact",
        scope: "native",
      },
    );
    if (c.mode === "plugin")
      bind(
        p.tenant.id,
        c.id,
        identityKey(p.tenant.id, "gtm_contact", "native", c.id),
        "gtm_contact",
        "native",
        { reference: "Manual activity on exact GTM contact" },
        p.actor,
        "native",
      );
    audit(p.tenant.id, p.actor, "manual-event-added", i.profileId);
    return result;
  });
}
const join =
  "LEFT JOIN crm_bindings b ON b.tenant=e.tenant AND b.key=e.identity_key AND (json_extract(b.payload,'$.proof.validFrom') IS NULL OR e.occurred_at>=json_extract(b.payload,'$.proof.validFrom')) AND (json_extract(b.payload,'$.proof.validUntil') IS NULL OR e.occurred_at<=json_extract(b.payload,'$.proof.validUntil'))";
export const queryInput = z
  .object({
    profileId: id.optional(),
    unlinked: z.boolean().default(false),
    channel: z
      .enum(["all", "web", "social", "manual", "shopify", "prestashop"])
      .default("all"),
    from: iso.optional(),
    to: iso.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.object({ at: iso, id }).strict().optional(),
  })
  .strict();
export function query(tenant: string, raw: unknown) {
  const i = queryInput.parse(raw);
  if (i.from && i.to && i.from > i.to) throw new Error("CRM_INVALID_INTERVAL");
  if (i.profileId) contact(tenant, i.profileId);
  const where = ["e.tenant=?"];
  const params: unknown[] = [tenant];
  if (i.profileId) {
    where.push("b.profile_id=?");
    params.push(i.profileId);
  } else if (i.unlinked) where.push("b.profile_id IS NULL");
  if (i.channel !== "all") {
    where.push("e.channel=?");
    params.push(i.channel);
  }
  if (i.from) {
    where.push("e.occurred_at>=?");
    params.push(i.from);
  }
  if (i.to) {
    where.push("e.occurred_at<=?");
    params.push(i.to);
  }
  if (i.cursor) {
    where.push("(e.occurred_at<? OR (e.occurred_at=? AND e.id<?))");
    params.push(i.cursor.at, i.cursor.at, i.cursor.id);
  }
  const rows = database()
    .prepare(
      `SELECT e.payload,b.payload AS binding FROM crm_events e ${join} WHERE ${where.join(" AND ")} ORDER BY e.occurred_at DESC,e.id DESC LIMIT ?`,
    )
    .all(...params, i.limit + 1) as Array<{
    payload: string;
    binding?: string;
  }>;
  const more = rows.length > i.limit;
  const events = rows.slice(0, i.limit).map((row) => {
    const {
      identityKey: _identityKey,
      hash: _hash,
      ...event
    } = JSON.parse(row.payload) as Event;
    const binding = row.binding
      ? (JSON.parse(row.binding) as Binding)
      : undefined;
    return {
      ...event,
      match: binding
        ? {
            method: binding.method,
            proof: binding.proof,
            linkedAt: binding.at,
            profileId: binding.profileId,
          }
        : null,
    };
  });
  const last = events.at(-1);
  return {
    events,
    nextCursor: more && last ? { at: last.occurredAt, id: last.id } : null,
  };
}
export function timeline(p: Principal, raw: unknown) {
  access(p);
  return query(p.tenant.id, raw);
}
export function detail(p: Principal, raw: unknown) {
  access(p);
  const i = z.object({ profileId: id }).strict().parse(raw),
    c = contact(p.tenant.id, i.profileId),
    bindings = many<Binding>(
      "SELECT payload FROM crm_bindings WHERE tenant=? AND profile_id=?",
      p.tenant.id,
      c.id,
    ).map(({ key: _key, ...b }) => b);
  return { contact: c, bindings, ...query(p.tenant.id, { profileId: c.id }) };
}
export function overview(p: Principal, raw: unknown = {}) {
  access(p);
  const i = z
      .object({
        search: z.string().max(120).default(""),
        offset: z.number().int().nonnegative().max(10000).default(0),
      })
      .strict()
      .parse(raw),
    t = p.tenant.id;
  const list = many<Contact>(
    "SELECT payload FROM crm_contacts WHERE tenant=? ORDER BY json_extract(payload,'$.createdAt') DESC,id LIMIT 10000",
    t,
  ).filter(
    (c) =>
      !i.search ||
      `${c.label} ${c.id}`.toLowerCase().includes(i.search.toLowerCase()),
  );
  const counts = database()
    .prepare(
      `SELECT count(*) AS total,sum(CASE WHEN b.profile_id IS NOT NULL THEN 1 ELSE 0 END) AS linked FROM crm_events e ${join} WHERE e.tenant=?`,
    )
    .get(t) as { total: number; linked: number | null };
  return {
    settings: {
      ...settings(t),
      roles: p.admin ? settings(t).roles : undefined,
    },
    role: role(p),
    contacts: list.slice(i.offset, i.offset + 100),
    hasMore: list.length > i.offset + 100,
    counts: {
      contacts: list.length,
      events: counts.total,
      linked: counts.linked ?? 0,
      unlinked: counts.total - (counts.linked ?? 0),
    },
    audit: p.admin
      ? many(
          "SELECT payload FROM crm_audit WHERE tenant=? ORDER BY seq DESC LIMIT 30",
          t,
        )
      : [],
  };
}
export function configure(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({ enabled: z.boolean(), mode: z.enum(["native", "plugin"]) })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["settings", i], () => {
    saveSettings(p.tenant.id, { ...settings(p.tenant.id), ...i });
    audit(p.tenant.id, p.actor, "settings-updated", i.mode);
    return { saved: true };
  });
}
export function grant(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({
      actor: z.string().min(1).max(200),
      role: z.enum(["reader", "editor", "none"]),
    })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["grant", i], () => {
    const s = settings(p.tenant.id);
    if (i.role === "none") delete s.roles[i.actor];
    else s.roles[i.actor] = i.role;
    saveSettings(p.tenant.id, s);
    audit(p.tenant.id, p.actor, "role-updated", i.actor);
    return { saved: true };
  });
}
export function setContactStatus(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({
      profileId: id,
      version: z.number().int(),
      status: z.enum(["active", "paused"]),
    })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["status", i], () => {
    const c = contact(p.tenant.id, i.profileId);
    if (c.version !== i.version) throw new Error("CRM_CHANGED");
    putContact(p.tenant.id, {
      ...c,
      status: i.status,
      updatedAt: now(),
      version: c.version + 1,
    });
    audit(p.tenant.id, p.actor, "contact-" + i.status, c.id);
    return { saved: true };
  });
}
export function erase(p: Principal, key: string, raw: unknown) {
  access(p, true, true);
  const i = z
    .object({
      profileId: id,
      version: z.number().int(),
      confirmation: z.literal("ERASE"),
    })
    .strict()
    .parse(raw);
  return idempotent(p.tenant.id, p.actor, key, ["erase", i], () => {
    const c = contact(p.tenant.id, i.profileId);
    if (c.version !== i.version) throw new Error("CRM_CHANGED");
    const keys = many<Binding>(
      "SELECT payload FROM crm_bindings WHERE tenant=? AND profile_id=?",
      p.tenant.id,
      c.id,
    ).map((b) => b.key);
    for (const k of keys) {
      database()
        .prepare("INSERT OR IGNORE INTO crm_blocked VALUES (?,?)")
        .run(p.tenant.id, k);
      database()
        .prepare("DELETE FROM crm_events WHERE tenant=? AND identity_key=?")
        .run(p.tenant.id, k);
    }
    database()
      .prepare("DELETE FROM crm_bindings WHERE tenant=? AND profile_id=?")
      .run(p.tenant.id, c.id);
    database()
      .prepare("DELETE FROM crm_contacts WHERE tenant=? AND id=?")
      .run(p.tenant.id, c.id);
    audit(p.tenant.id, p.actor, "contact-erased", c.id);
    return { erased: true };
  });
}

export function exportContact(p: Principal, raw: unknown) {
  access(p);
  return transaction(p.tenant.id, () => {
    const result = detail(p, raw);
    const events = [...result.events];
    let cursor = result.nextCursor;
    while (cursor) {
      const page = query(p.tenant.id, {
        profileId: result.contact.id,
        limit: 100,
        cursor,
      });
      events.push(...page.events);
      cursor = page.nextCursor;
    }
    audit(p.tenant.id, p.actor, "contact-exported", result.contact.id);
    return { ...result, events, nextCursor: null, exportedAt: now() };
  });
}
