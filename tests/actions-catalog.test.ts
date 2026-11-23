import { describe, expect, it } from "vitest";
import {
  ACTION_CATALOG, ACTION_CATALOG_VERSION, CATALOG_EXCLUDED_WRITES,
  catalogEntry, isCatalogAction, normaliseTerms, termsDigest,
} from "../src/actions/catalog.js";

describe("pre-approved action catalog (R11)", () => {
  it("publishes a versioned catalog with its three governed actions", () => {
    expect(ACTION_CATALOG_VERSION).toBe("preapproved-actions-v1");
    expect(ACTION_CATALOG.map((e) => e.id)).toEqual(["indexnow.submit", "draft.generate", "report.dispatch"]);
    for (const entry of ACTION_CATALOG) {
      expect(entry.version).toMatch(/-v1$/);
      expect(entry.version).toBe(`${entry.id.replace(".", "-")}-v1`);
      expect(entry.title.fr.length).toBeGreaterThan(3);
      expect(entry.summary.en.length).toBeGreaterThan(20);
      expect(entry.proposalTtlHours).toBe(72);
      expect(entry.approvalTtlHours).toBe(24);
    }
  });

  it("explicitly excludes every other external write from one-click eligibility", () => {
    expect(CATALOG_EXCLUDED_WRITES.map((w) => w.id)).toEqual(["apply.robots-meta", "wordpress.publish", "gbp.write", "crm.write", "social.publish"]);
    for (const w of CATALOG_EXCLUDED_WRITES) {
      expect(isCatalogAction(w.id)).toBe(false);
      expect(() => catalogEntry(w.id)).toThrow("hors catalogue");
    }
    expect(isCatalogAction("indexnow.submit")).toBe(true);
  });

  it("refuses unknown or non-catalog actions without exception", () => {
    expect(() => catalogEntry("malicious.import")).toThrow("hors catalogue");
    expect(() => normaliseTerms("not.an.action", {})).toThrow("hors catalogue");
  });
});

describe("IndexNow submission terms (entry rules)", () => {
  const valid = { host: " https://www.exemple.fr/page ", key: "A1b2C3d4E5", urls: ["https://www.exemple.fr/a", "https://www.exemple.fr/b", "https://www.exemple.fr/a"] };

  it("normalises the host, validates the key grammar and dedupes HTTPS urls on the declared host", () => {
    const terms = normaliseTerms("indexnow.submit", valid);
    expect(terms).toEqual({ host: "www.exemple.fr", key: "A1b2C3d4E5", urls: ["https://www.exemple.fr/a", "https://www.exemple.fr/b"] });
  });

  it("refuses a bad key, foreign urls, non-HTTPS and an oversized list", () => {
    expect(() => normaliseTerms("indexnow.submit", { ...valid, key: "short" })).toThrow("Clé IndexNow invalide");
    expect(() => normaliseTerms("indexnow.submit", { ...valid, urls: ["https://autre.fr/a"] })).toThrow("appartenir à l'hôte déclaré");
    expect(() => normaliseTerms("indexnow.submit", { ...valid, urls: ["http://example.fr/a"] })).toThrow("HTTPS");
    expect(() => normaliseTerms("indexnow.submit", { ...valid, urls: [] })).toThrow("Au moins une URL");
    expect(() => normaliseTerms("indexnow.submit", { ...valid, urls: Array.from({ length: 101 }, (_, i) => `https://example.fr/${i}`) })).toThrow("100 URLs maximum");
    expect(() => normaliseTerms("indexnow.submit", { host: "pas un hote", key: "A1b2C3d4E5", urls: ["https://example.fr/"] })).toThrow("hôte");
  });
});

describe("draft generation terms (entry rules)", () => {
  const valid = { kind: "titles", input: { keyword: "audit seo", brand: " Acme ", topic: "", audience: "PME", benefit: null, existingTitle: "  ", existingHeadings: ["SEO technique", ""] } };

  it("keeps only bounded, trimmed fields and marks absent ones as absent, never zero", () => {
    const terms = normaliseTerms("draft.generate", valid);
    expect(terms).toMatchObject({ kind: "titles", input: { keyword: "audit seo", brand: "Acme", audience: "PME" } });
    expect((terms as { input: Record<string, unknown> }).input.topic).toBeNull();
    expect((terms as { input: Record<string, unknown> }).input.benefit).toBeNull();
    expect((terms as { input: { existingHeadings: string[] } }).input.existingHeadings).toEqual(["SEO technique"]);
  });

  it("refuses an unknown kind, a missing keyword and oversized fields", () => {
    expect(() => normaliseTerms("draft.generate", { ...valid, kind: "publish" })).toThrow("titles, meta ou outline");
    expect(() => normaliseTerms("draft.generate", { ...valid, input: { ...valid.input, keyword: " " } })).toThrow("Mot-clé requis");
    expect(() => normaliseTerms("draft.generate", { ...valid, input: { ...valid.input, keyword: "x".repeat(201) } })).toThrow("trop long");
    expect(() => normaliseTerms("draft.generate", { ...valid, input: { ...valid.input, existingHeadings: Array.from({ length: 13 }, (_, i) => `S${i}`) } })).toThrow("sections maximum");
  });
});

describe("report dispatch terms (entry rules)", () => {
  it("accepts one bounded follow-up identifier and refuses anything else", () => {
    expect(normaliseTerms("report.dispatch", { followUpId: "abc-123" })).toEqual({ followUpId: "abc-123" });
    expect(() => normaliseTerms("report.dispatch", {})).toThrow("Identifiant de suivi requis.");
    expect(() => normaliseTerms("report.dispatch", { followUpId: "id; avec espaces!" })).toThrow("invalide");
  });
});

describe("exact-terms digest", () => {
  const withUrls = (urls: string[]) => normaliseTerms("indexnow.submit", { host: "example.fr", key: "A1b2C3d4E5", urls });

  it("binds the approval to the exact normalised terms: no collision, no drift", () => {
    const two = withUrls(["https://example.fr/a", "https://example.fr/b"]);
    expect(termsDigest(two)).toBe(termsDigest({ host: "example.fr", key: "A1b2C3d4E5", urls: ["https://example.fr/a", "https://example.fr/b"] }));
    expect(termsDigest(two)).not.toBe(termsDigest(withUrls(["https://example.fr/a", "https://example.fr/b", "https://example.fr/c"])));
    expect(termsDigest(two)).not.toBe(termsDigest(normaliseTerms("indexnow.submit", { host: "example.fr", key: "Z9z8Y7W6x5", urls: ["https://example.fr/a", "https://example.fr/b"] })));
    const draft = normaliseTerms("draft.generate", { kind: "titles", input: { keyword: "audit seo" } });
    const draftChanged = normaliseTerms("draft.generate", { kind: "titles", input: { keyword: "audit seo", brand: "X" } });
    expect(termsDigest(draft)).not.toBe(termsDigest(draftChanged));
  });
});
