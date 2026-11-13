/** Only infer an existing, unambiguous membership. Never choose among customers. */
export async function resolveWorkspace(loadMe, selected, remember) {
  let me = await loadMe(selected);
  if (!me.tenant && !selected && me.memberships?.length === 1) {
    const candidate = me.memberships[0].id;
    me = await loadMe(candidate);
    if (me.tenant?.id === candidate) remember(candidate);
  } else if (me.tenant) remember(me.tenant.id);
  return me;
}

/** Preserve a Slack/console deep link across the OIDC round trip. The server
 * still authorizes the requested tenant before it becomes the active selection. */
export function workspaceHandoff(location, storage, now = Date.now()) {
  const key = "gtm-console-handoff", params = new URLSearchParams(location.search);
  const tenant = params.get("tenant");
  const validTenant = value => typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value);
  const validHash = value => typeof value === "string" && /^#[a-z_]+(?:\/[a-z-]+)?$/.test(value);
  if (validTenant(tenant)) {
    const value = { tenant, hash: validHash(location.hash) ? location.hash : "#overview", expires: now + 600000 };
    storage.setItem(key, JSON.stringify(value)); return value;
  }
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    if (value && validTenant(value.tenant) && validHash(value.hash) && Number.isFinite(value.expires) && value.expires > now) return value;
  } catch { /* invalid pending intent cannot select a workspace */ }
  storage.removeItem(key); return null;
}
