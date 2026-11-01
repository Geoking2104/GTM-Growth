/**
 * Pure GTM helpers — no network, no client.
 *
 * Kept separate from `tagmanager-api.ts` so the matching logic (variable
 * references, trigger lookups, duplicate detection) can be unit-tested against
 * fixtures instead of a live container.
 */

export interface GtmParameter {
  key?: string | null;
  value?: string | null;
  type?: string | null;
  list?: unknown[] | null;
  map?: unknown[] | null;
}

export interface GtmTagLike {
  tagId?: string | null;
  name?: string | null;
  type?: string | null;
  firingTriggerId?: string[] | null;
  blockingTriggerId?: string[] | null;
  parameter?: GtmParameter[] | null;
}

export interface TagSummary {
  tagId: string | null | undefined;
  name: string | null | undefined;
  type: string | null | undefined;
  eventName: string | null;
  measurementIds: string[];
}

const VARIABLE_REF = /\{\{([^{}]+)\}\}/g;

/** Collect every `{{Variable Name}}` reference in a parameter tree. */
export function extractVariableReferences(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      for (const match of node.matchAll(VARIABLE_REF)) {
        const name = match[1].trim();
        if (name) found.add(name);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const child of Object.values(node as Record<string, unknown>)) walk(child);
    }
  };
  walk(value);
  return [...found];
}

/** Tags whose firing or blocking trigger is `triggerId`. */
export function tagsForTrigger(
  tags: GtmTagLike[],
  triggerId: string
): { firing: TagSummary[]; blocking: TagSummary[] } {
  const firing = tags.filter((tag) => (tag.firingTriggerId ?? []).includes(triggerId));
  const blocking = tags.filter((tag) => (tag.blockingTriggerId ?? []).includes(triggerId));
  return {
    firing: firing.map(summarizeTag),
    blocking: blocking.map(summarizeTag),
  };
}

/** Tags that reference `variableName` (`{{name}}`) anywhere in their parameters. */
export function tagsUsingVariable(tags: GtmTagLike[], variableName: string): TagSummary[] {
  return tags
    .filter((tag) => extractVariableReferences(tag.parameter ?? []).includes(variableName))
    .map(summarizeTag);
}

export interface DuplicateGroup {
  key: string;
  tags: TagSummary[];
}

export interface DuplicateReport {
  duplicateEventGroups: DuplicateGroup[];
  duplicateConfigGroups: DuplicateGroup[];
  /** Number of groups, not of tags. */
  duplicateGroupCount: number;
}

/**
 * Detect duplicate GA4 tags: the same event name fired twice, or the same
 * Measurement ID configured by more than one configuration tag.
 */
export function findDuplicateTags(tags: GtmTagLike[]): DuplicateReport {
  const eventGroups = new Map<string, GtmTagLike[]>();
  const configGroups = new Map<string, GtmTagLike[]>();

  for (const tag of tags) {
    if (tag.type === "gaawe") {
      const eventName = extractEventName(tag.parameter ?? []);
      if (eventName) {
        eventGroups.set(eventName, [...(eventGroups.get(eventName) ?? []), tag]);
      }
    }
    if (tag.type === "googtag" || tag.type === "gaawc") {
      const ids = extractMeasurementIds(tag.parameter ?? []);
      for (const id of ids.length ? ids : ["(no measurement id)"]) {
        configGroups.set(id, [...(configGroups.get(id) ?? []), tag]);
      }
    }
  }

  const toGroups = (groups: Map<string, GtmTagLike[]>): DuplicateGroup[] =>
    [...groups.entries()]
      .filter(([, grouped]) => grouped.length > 1)
      .map(([key, grouped]) => ({ key, tags: grouped.map(summarizeTag) }));

  const duplicateEventGroups = toGroups(eventGroups);
  const duplicateConfigGroups = toGroups(configGroups);

  return {
    duplicateEventGroups,
    duplicateConfigGroups,
    duplicateGroupCount: duplicateEventGroups.length + duplicateConfigGroups.length,
  };
}

export function summarizeTag(tag: GtmTagLike): TagSummary {
  return {
    tagId: tag.tagId,
    name: tag.name,
    type: tag.type,
    eventName: extractEventName(tag.parameter ?? []),
    measurementIds: extractMeasurementIds(tag.parameter ?? []),
  };
}

/** GTM stores the GA4 event name as a `eventName` parameter. */
export function extractEventName(parameters: GtmParameter[] | null = []): string | null {
  const list = parameters ?? [];
  const parameter = list.find((item) => item.key === "eventName");
  return parameter?.value || null;
}

/** Measurement IDs live in `measurementId`/`trackingId`/`tagId`, sometimes nested in lists. */
export function extractMeasurementIds(parameters: GtmParameter[] | null = []): string[] {
  const ids: string[] = [];
  for (const parameter of parameters ?? []) {
    const key = parameter.key;
    if (
      (key === "measurementId" || key === "trackingId" || key === "tagId") &&
      typeof parameter.value === "string" &&
      parameter.value.startsWith("G-")
    ) {
      ids.push(parameter.value);
    }
    for (const item of parameter.list ?? []) {
      const map = (item as { map?: GtmParameter[] })?.map;
      if (!Array.isArray(map)) continue;
      for (const entry of map) {
        if (
          (entry.key === "measurementId" || entry.key === "value") &&
          typeof entry.value === "string" &&
          entry.value.startsWith("G-")
        ) {
          ids.push(entry.value);
        }
      }
    }
  }
  return [...new Set(ids)];
}

/** Trim parameters to the fields an agent needs to explain a tag. */
export function simplifyParameters(parameters: GtmParameter[] | null = []) {
  return (parameters ?? []).map((parameter) => ({
    key: parameter.key,
    type: parameter.type,
    value: parameter.value ?? null,
    list: parameter.list ?? undefined,
    map: parameter.map ?? undefined,
  }));
}
