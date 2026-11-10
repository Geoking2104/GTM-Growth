import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translateLiveTables } from "../site/fr/server-tables.js";

const siteFile = (name: string): string => readFileSync(join(process.cwd(), "site", name), "utf8");

describe("French and English landing pages", () => {
  const en = siteFile("index.html");
  const fr = siteFile("fr/index.html");

  it("offers visible reciprocal language links and shared design tokens", () => {
    expect(en).toContain('hreflang="fr" lang="fr"');
    expect(fr).toContain('hreflang="en" lang="en"');
    expect(en).toContain('href="brand.css"');
    expect(fr).toContain('href="../brand.css"');
    expect(en).toContain('aria-current="page">EN');
    expect(fr).toContain('aria-current="page">FR');
  });

  it("shares privacy controls while displaying consent in the visitor's language", () => {
    expect(en).toContain('src="./privacy.js"');
    expect(fr).toContain('src="../privacy.js"');
    expect(fr).toContain('class="privacy-settings"');
    const privacy = siteFile("privacy.js");
    expect(privacy).toContain('Vos préférences de confidentialité');
    expect(privacy).toContain('Your privacy preferences');
    expect(privacy).toContain('text("Refuser", "Reject")');
    expect(siteFile("brand.css")).toContain('.privacy-banner .btn.btn-ghost');
  });

  it("runs the free read in French without requiring a console login", () => {
    expect(fr).toContain('src="free-read.js"');
    expect(fr).toContain('id="read-result"');
    expect(fr).not.toContain("window.location.assign('/console/')");
    const js = siteFile("fr/free-read.js");
    expect(js).toContain('fetch("/api/free-read"');
    expect(js).toContain("auditUrlShape");
    expect(js).toContain("sampleTables(dict)");
  });

  it("uses English-language graphics and identifies illustrations", () => {
    for (const wrongLanguage of ["geo-board.webp", "citability-main.webp", "free-sitemap.webp", "free-seo.webp", "free-ga4.webp", "free-gsc.webp", "search-perf.webp", "indexnow-main.webp"]) {
      expect(en).not.toContain(`src="assets/screens/${wrongLanguage}"`);
    }
    expect(en).toContain('src="assets/screens/geo-board-en.svg"');
    expect(en).toContain("English-language illustration");
    const svg = siteFile("assets/screens/geo-board-en.svg");
    expect(svg).toContain("Projected score trajectory");
    expect(svg).not.toContain("Vue d’ensemble");
  });

  it("keeps canonical and hreflang URLs on the public domain", () => {
    const sitemap = siteFile("sitemap.xml");
    const robots = siteFile("robots.txt");
    for (const path of ["/", "/fr/"]) {
      expect(sitemap).toContain(`https://gtm.kayroslab.com${path}`);
      expect(en).toContain(`href="https://gtm.kayroslab.com${path}"`);
      expect(fr).toContain(`href="https://gtm.kayroslab.com${path}"`);
    }
    expect(robots).toContain("Sitemap: https://gtm.kayroslab.com/sitemap.xml");
  });

  it("shows the approved pilot prices with a pre-launch VAT and Mollie caveat", () => {
    expect(fr).toContain("39&nbsp;€");
    expect(fr).toContain("149&nbsp;€");
    expect(en).toContain("€39");
    expect(en).toContain("€149");
    expect(fr).toContain("HT/TTC");
    expect(en).toContain("VAT");
    expect(fr).toContain('/console/?lang=fr#billing');
    expect(en).toContain('/console/?lang=en#billing');
  });

  it("keeps language selection on console links and public sign-in", () => {
    expect(fr).toContain('src="../locale-links.js"');
    expect(en).toContain('src="locale-links.js"');
    const consoleHtml = siteFile("console/index.html");
    expect(consoleHtml).toContain('href="../brand.css"');
    expect(consoleHtml).toContain('src="locale-shell.js"');
    expect(consoleHtml).toContain('hreflang="fr"');
    expect(consoleHtml).toContain('hreflang="en"');
    expect(siteFile("console/locale-shell.js")).toContain('const home = en ? "/" : "/fr/"');
  });
});

describe("French server read rendering", () => {
  it("translates server-provided titles, labels, statuses and live evidence", () => {
    const translated = translateLiveTables([
      {
        id: "seo.meta",
        title: "SEO — metadata",
        subtitle: "Measured on served HTML",
        rows: [
          { label: "Title", value: "48 chars", status: "pass", note: "Indexable." },
          { label: "Canonical", value: "https://example.com/", status: "pass", note: "https://example.com/" },
        ],
      },
      {
        id: "gsc.traffic",
        title: "Search Console — performance report",
        subtitle: "Last 28 days · illustrative sample, not your property.",
        sample: true,
        rows: [{ label: "Clicks", value: "2,940", status: "info" }],
      },
    ]);
    expect(translated[0].title).toBe("SEO — métadonnées");
    expect(translated[0].rows[0]).toMatchObject({ label: "Titre", value: "48 caractères", note: "Indexable." });
    expect(translated[0].rows[1].value).toBe("https://example.com/");
    expect(translated[1].rows[0].label).toBe("Clics");
    expect(translated[1].sample).toBe(true);
    expect(translated[1].subtitle).toContain("EXEMPLE");
  });

  it("preserves evidence while omitting unrecognised English notes", () => {
    const [table] = translateLiveTables([{ id: "seo.content", rows: [{ label: "H1", value: "1 · ‘Hello’", note: "An untranslated server message" }] }]);
    expect(table.rows[0].value).toContain("Hello");
    expect(table.rows[0].note).toBe("");
  });
});
