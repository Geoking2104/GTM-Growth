import { describe, expect, it } from "vitest";
import { approvedV2Grid } from "../src/geo/score/v2/approved-grid.js";
import { V2_TITLES_FR } from "../src/report-access/export.js";
// @ts-expect-error plain browser module without types
import { GEO_CHECK_TITLES_FR, geoCheckTitle } from "../site/geo-check-titles.js";

describe("French titles of the 42 AI visibility checks", () => {
  it("cover every approved control and match the export titles", () => {
    const ids = approvedV2Grid().controls.map((control: { id: string }) => control.id).sort();
    expect(ids).toHaveLength(42);
    expect(Object.keys(GEO_CHECK_TITLES_FR).sort()).toEqual(ids);
    expect(GEO_CHECK_TITLES_FR).toEqual(V2_TITLES_FR);
  });

  it("translates in FR and keeps the server title in EN", () => {
    expect(geoCheckTitle("C02", "Direct answers to user questions", "fr")).toBe("Réponses directes aux questions");
    expect(geoCheckTitle("C02", "Direct answers to user questions", "en")).toBe("Direct answers to user questions");
    expect(geoCheckTitle("Z99", "Unknown title", "fr")).toBe("Unknown title");
  });
});
