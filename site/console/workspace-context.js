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
