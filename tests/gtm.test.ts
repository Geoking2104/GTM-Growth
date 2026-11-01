import { describe, expect, it } from "vitest";
import {
  extractEventName,
  extractMeasurementIds,
  extractVariableReferences,
  findDuplicateTags,
  simplifyParameters,
  tagsForTrigger,
  tagsUsingVariable,
} from "../src/utils/gtm-helpers.js";
import { gtmTools } from "../src/tools/gtm.js";
import { tools } from "../src/tools/index.js";

const configTag = {
  tagId: "1",
  name: "GA4 - Configuration",
  type: "googtag",
  firingTriggerId: ["10"],
  parameter: [{ key: "tagId", value: "G-ABC123", type: "TEMPLATE" }],
};

const purchaseTag = {
  tagId: "2",
  name: "GA4 - purchase",
  type: "gaawe",
  firingTriggerId: ["11"],
  blockingTriggerId: ["12"],
  parameter: [
    { key: "eventName", value: "purchase", type: "TEMPLATE" },
    { key: "value", value: "{{dlv - ecommerce value}}", type: "TEMPLATE" },
    {
      key: "eventParameters",
      type: "LIST",
      list: [{ map: [{ key: "currency", value: "EUR" }] }],
    },
  ],
};

const duplicatePurchaseTag = {
  tagId: "3",
  name: "GA4 - purchase (old)",
  type: "gaawe",
  firingTriggerId: ["11"],
  parameter: [{ key: "eventName", value: "purchase", type: "TEMPLATE" }],
};

const duplicateConfigTag = {
  tagId: "4",
  name: "GA4 - Configuration (copy)",
  type: "googtag",
  firingTriggerId: ["10"],
  parameter: [{ key: "tagId", value: "G-ABC123", type: "TEMPLATE" }],
};

const cartTag = {
  tagId: "5",
  name: "GA4 - add_to_cart",
  type: "gaawe",
  firingTriggerId: ["11"],
  parameter: [{ key: "eventName", value: "add_to_cart", type: "TEMPLATE" }],
};

const allTags = [configTag, purchaseTag, duplicatePurchaseTag, duplicateConfigTag, cartTag];

describe("gtm helpers", () => {
  it("extracts nested variable references without duplicates", () => {
    const refs = extractVariableReferences([
      { key: "value", value: "{{dlv - value}}" },
      { key: "nested", list: [{ map: [{ key: "currency", value: "{{dlv - currency}}" }] }] },
      { key: "again", value: "{{dlv - value}}" },
      { key: "constant", value: "EUR" },
    ]);
    expect(refs.sort()).toEqual(["dlv - currency", "dlv - value"]);
  });

  it("finds tags that use a variable, including nested parameters", () => {
    const usingValue = tagsUsingVariable(allTags, "dlv - ecommerce value");
    expect(usingValue.map((tag) => tag.tagId)).toEqual(["2"]);

    const usingCurrency = tagsUsingVariable(allTags, "dlv - currency");
    expect(usingCurrency).toEqual([]);
  });

  it("splits tags by firing and blocking trigger", () => {
    const { firing, blocking } = tagsForTrigger(allTags, "11");
    expect(firing.map((tag) => tag.tagId).sort()).toEqual(["2", "3", "5"]);

    const blocked = tagsForTrigger(allTags, "12");
    expect(blocked.blocking.map((tag) => tag.tagId)).toEqual(["2"]);
    expect(blocked.firing).toEqual([]);
  });

  it("detects duplicate event tags and duplicate configuration tags", () => {
    const report = findDuplicateTags(allTags);
    expect(report.duplicateEventGroups).toHaveLength(1);
    expect(report.duplicateEventGroups[0].key).toBe("purchase");
    expect(report.duplicateEventGroups[0].tags.map((tag) => tag.tagId).sort()).toEqual(["2", "3"]);
    expect(report.duplicateConfigGroups).toHaveLength(1);
    expect(report.duplicateConfigGroups[0].key).toBe("G-ABC123");
    expect(report.duplicateGroupCount).toBe(2);
  });

  it("reports no duplicates for a clean container", () => {
    const report = findDuplicateTags([configTag, cartTag]);
    expect(report.duplicateGroupCount).toBe(0);
  });

  it("reads event names and measurement ids from nested parameters", () => {
    expect(extractEventName(purchaseTag.parameter as any)).toBe("purchase");
    expect(
      extractMeasurementIds([
        {
          key: "eventSettingsTable",
          type: "LIST",
          list: [{ map: [{ key: "measurementId", value: "G-NESTED1" }] }],
        },
      ] as any)
    ).toEqual(["G-NESTED1"]);
    expect(extractEventName(null)).toBeNull();
    expect(extractMeasurementIds(null)).toEqual([]);
  });

  it("keeps nested parameter structures when simplifying", () => {
    const simplified = simplifyParameters(purchaseTag.parameter as any);
    expect(simplified[2].list).toBeTruthy();
    expect(simplified[0]).toMatchObject({ key: "eventName", value: "purchase" });
  });
});

describe("gtm tool surface", () => {
  it("registers the Phase 2 reverse-lookup tools", () => {
    const names = gtmTools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "find_tags_by_trigger",
        "find_tags_using_variable",
        "detect_duplicate_tags",
        "get_built_in_variables",
      ])
    );
  });

  it("exposes them through the server tool list", () => {
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "find_tags_by_trigger",
        "find_tags_using_variable",
        "detect_duplicate_tags",
        "get_built_in_variables",
      ])
    );
  });
});
