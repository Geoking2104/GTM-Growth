import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translateLiveTables } from "../site/fr/server-tables.js";

const siteFile = (name: string): string => readFileSync(join(process.cwd(), "site", name), "utf8");

describe("French and English landing pages", () => {
  const en = siteFile("index.html");
  const fr = siteFile("fr/index.html");
  it("shares the English layout, stylesheet and behavior", () => {
    for (const html of [en, fr]) {
      expect(html).toContain('class="wrap hero-inner"');
      expect(html).toContain('class="site-header"');
      expect(html).toContain('href="/styles.css"');
      expect(html).toContain('href="/landing.css"');
      expect(html).toContain('src="/landing.js"');
      expect(html).toContain('src="/privacy.js"');
      expect(html).toContain('src="/locale-links.js"');
      expect(html).toContain('id="read-result"');
      expect(html).toContain('id="lead-form"');
    }
  });
  it("preserves the French editorial sections and their English translations", () => {
    expect(fr).toContain("Sachez quoi améliorer.");
    expect(en).toContain("Know what to improve.");
    for (const id of ["audit", "fonctionnement", "outils", "ops", "console", "roadmap", "toolkit", "mesure", "preuve", "offres", "contact", "faq", "credit"]) {
      for (const html of [en, fr]) expect(html).toContain(`id="${id}"`);
    }
    expect(fr).toContain("Trois phases, sept chantiers");
    expect(en).toContain("Three phases, seven workstreams");
  });
  it("uses localized versions of the same graphic and marks projections", () => {
    expect(en).toContain('src="/assets/screens/geo-board-en.svg"');
    expect(fr).toContain('src="/assets/screens/geo-board-fr.svg"');
    expect(en).toContain("projected improvement, not historical results");
    expect(fr).toContain("progression projetée, pas un historique");
    expect(siteFile("assets/screens/geo-board-fr.svg")).toContain("Trajectoire du score projetée");
    expect(siteFile("assets/screens/geo-board-en.svg")).toContain("Projected score trajectory");
  });
  it("keeps canonical URLs, privacy and console navigation localized", () => {
    for (const [html, locale, route] of [[en,"en","/"],[fr,"fr","/fr/"]]) {
      expect(html).toContain(`href="https://gtm.kayroslab.com${route}"`);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(`/console/?lang=${locale}#overview`);
      expect(html).toContain('hreflang="en"');
      expect(html).toContain('hreflang="fr"');
    }
    expect(fr).toContain('href="/fr/confidentialite.html"');
    expect(en).toContain('href="/privacy.html"');
    expect(siteFile("console/index.html")).toContain('src="locale-shell.js"');
  });
  it("keeps pilot prices and payment disclosures equivalent", () => {
    for (const html of [fr,en]) { expect(html).toMatch(/39.*€/); expect(html).toMatch(/149.*€/); expect(html).toContain("Mollie"); }
    expect(fr).toContain("HT/TTC"); expect(en).toContain("VAT");
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
