import { describe, expect, it } from "vitest";
import { analysePage, runTechAudit, serpPreview, type PageFetcher } from "../src/console/crawler.js";
import { generateMetaDescriptions, generateOutline, generateTitles, generateWithOllama } from "../src/console/generators.js";

const page = (title: string, links: string[], extra = "") => `<html><head><title>${title}</title><meta name="description" content="Une description suffisamment longue pour passer le contrôle de longueur minimale, voilà."><link rel="canonical" href="https://ex.fr/"></head><body><h1>Titre</h1><h3>Saut</h3>${links.map((l) => `<a href="${l}">x</a>`).join("")}${extra}</body></html>`;

const site: Record<string, { status: number; location?: string; body?: string }> = {
  "https://ex.fr/": { status: 200, body: page("Accueil du site exemple très bien", ["/a", "/old", "/missing", "https://ext.com/dead", "mailto:x@y.z"]) },
  "https://ex.fr/a": { status: 200, body: page("Accueil du site exemple très bien", ["/"]) },
  "https://ex.fr/old": { status: 301, location: "/older" },
  "https://ex.fr/older": { status: 302, location: "/a" },
  "https://ex.fr/missing": { status: 404 },
  "https://ext.com/dead": { status: 410 },
};
const fetcher: PageFetcher = async (url) => { const r = site[url] ?? { status: 404 }; return { status: r.status, location: r.location ?? null, contentType: r.body ? "text/html" : "text/plain", body: r.body ?? "" }; };

describe("technical audit", () => {
  it("analyses one page", () => {
    const a = analysePage(page("Court", []), "https://ex.fr/autre");
    const codes = a.issues.map((i) => i.code);
    expect(codes).toContain("title.short");
    expect(codes).toContain("canonical.other");
    expect(codes).toContain("hn.skip");
  });
  it("crawls, follows redirect chains and finds broken links", async () => {
    const r = await runTechAudit({ url: "https://ex.fr/", fetcher });
    expect(r.summary.pages).toBe(4);
    expect(r.redirectChains[0]).toMatchObject({ url: "https://ex.fr/old", hops: 2 });
    expect(r.brokenLinks.map((b) => b.url).sort()).toEqual(["https://ex.fr/missing", "https://ext.com/dead"]);
    expect(r.summary.duplicateTitles).toBe(1);
  });
  it("respects the guard for external links", async () => {
    const r = await runTechAudit({ url: "https://ex.fr/", fetcher, guard: async (u) => !u.includes("ext.com") });
    expect(r.brokenLinks.map((b) => b.url)).toEqual(["https://ex.fr/missing"]);
  });
  it("previews and truncates the SERP snippet", () => {
    const p = serpPreview({ url: "https://ex.fr/blog/article", title: "Un titre ".repeat(15), description: "" });
    expect(p.breadcrumb).toBe("ex.fr › blog › article");
    expect(p.title.endsWith("…")).toBe(true);
    expect(p.warnings.length).toBe(2);
  });
});

describe("generators", () => {
  const input = { keyword: "audit SEO", brand: "KayrosLab", audience: "PME" };
  it("produce bounded titles, metas and an outline", () => {
    expect(generateTitles(input).every((t) => t.chars <= 65)).toBe(true);
    expect(generateMetaDescriptions(input).every((t) => t.chars <= 158)).toBe(true);
    const o = generateOutline({ ...input, existingHeadings: ["Nos tarifs"] });
    expect(o.sections.some((s) => s.h2 === "Nos tarifs")).toBe(true);
    expect(o.faq).toHaveLength(4);
  });
  it("calls a self-hosted Ollama model", async () => {
    let sent: { model?: string } = {};
    const fake = (async (_url: string, init: { body: string }) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ response: " ok " })); }) as unknown as typeof fetch;
    expect(await generateWithOllama("meta", input, { url: "http://ollama:11434", model: "mistral" }, fake)).toBe("ok");
    expect(sent.model).toBe("mistral");
  });
});
