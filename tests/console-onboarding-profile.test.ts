import { describe, expect, it } from "vitest";
import { HtmlDoc } from "../src/geo/html.js";
import { extractOnboardingProfile } from "../src/console/onboarding-profile.js";

const page = (body: string) => `
<!doctype html><html lang="fr"><head>
<title>Opendpe — Diagnostics énergétiques</title>
<meta name="description" content="Opendpe réalise vos diagnostics immobiliers partout en France, sous 48 h.">
<meta property="og:site_name" content="Opendpe">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Opendpe SAS", description: "Diagnostics immobiliers réglementaires.", sameAs: ["https://www.linkedin.com/company/opendpe"] })}</script>
</head><body><h1>Opendpe</h1>${body}</body></html>`;

describe("onboarding — pré-remplissage du profil de marque (sans LLM)", () => {
  it("lit le nom, la description, la langue et le schema de la page d'accueil", () => {
    const profile = extractOnboardingProfile(HtmlDoc.parse(page("<p>Bonjour</p>")), "https://www.opendpe.net/", 200);
    expect(profile.siteName).toBe("Opendpe SAS");
    expect(profile.siteNameSource).toBe("schema");
    expect(profile.description).toContain("diagnostics immobiliers");
    expect(profile.lang).toBe("fr");
    expect(profile.schemaTypes).toContain("Organization");
    expect(profile.sameAs).toContain("https://www.linkedin.com/company/opendpe");
  });

  it("retombe sur og:site_name puis la meta description sans JSON-LD nommé", () => {
    const bare = `<!doctype html><html lang="en"><head><title>Acme tools</title>
      <meta property="og:site_name" content="Acme">
      <meta property="og:description" content="Acme builds accounting tools.">
      </head><body><h1>Acme</h1></body></html>`;
    const profile = extractOnboardingProfile(HtmlDoc.parse(bare), "https://acme.example/", 200);
    expect(profile.siteName).toBe("Acme");
    expect(profile.siteNameSource).toBe("meta");
    expect(profile.description).toBe("Acme builds accounting tools.");
    expect(profile.schemaTypes).toEqual([]);
  });

  it("reste utilisable sur une page vide", () => {
    const profile = extractOnboardingProfile(HtmlDoc.parse("<html><head></head><body></body></html>"), "https://x.example/", 200);
    expect(profile.siteName).toBeNull();
    expect(profile.description).toBeNull();
    expect(profile.siteNameSource).toBeNull();
  });
});
