import { describe, expect, it } from "vitest";
import type { Dataset } from "../src/console/ai-visibility.js";
import { aeoWriterRoutes } from "../src/console/aeo-writer.js";

/* R8 routes: local reads gated on the active tenant; nothing stored. */

const dataset: Dataset = {
  id: "panel-1",
  createdAt: "2026-11-01T00:00:00Z",
  brands: [{ name: "Acme", aliases: ["Acme"], website: "https://acme.example/" }],
  observations: [
    { id: "r0", prompt: "comment faire un audit GEO sérieux", answer: "réponse", source: "imported", observedAt: "2026-11-05T00:00:00Z", citations: [], citationSpans: [], mentions: [] },
  ],
} as unknown as Dataset;

const routes = (loader: (tenantId: string, id: string | null) => Dataset | undefined) => new Map(aeoWriterRoutes({ dataset: loader }).map((r) => [r.path, r]));

const ctx = (body: Record<string, unknown> = {}, tenancy = { tenant: { id: "t1", name: "T", status: "active", mode: "organization", domains: [], createdAt: "2026-01-01" } }) =>
  ({ body, tenancy, user: { sub: "user" } }) as never;

describe("AEO Writer routes (R8)", () => {
  it("requires an active tenant", async () => {
    const r = routes((id) => dataset);
    const handler = r.get("/aeo-writer/score")!.handler;
    await expect(handler(ctx({ content: "x".repeat(50) }, {} as never))).rejects.toThrow("Un tenant actif est requis");
  });

  it("refuses a missing panel with a French error", async () => {
    const r = routes(() => undefined);
    await expect(r.get("/aeo-writer/score")!.handler(ctx({ content: "x".repeat(50) }))).rejects.toThrow("Panneau de visibilité IA introuvable");
  });

  it("bounds the content length on the score route", async () => {
    const r = routes(() => dataset);
    await expect(r.get("/aeo-writer/score")!.handler(ctx({ content: "court" }))).rejects.toThrow("Contenu requis");
    await expect(r.get("/aeo-writer/score")!.handler(ctx({ content: "y".repeat(25000) }))).rejects.toThrow("Contenu requis");
  });

  it("scores a valid content against the stored panel", async () => {
    const r = routes(() => dataset);
    const scored = await r.get("/aeo-writer/score")!.handler(ctx({ content: "L'audit GEO sérieux demande du schema, des statistiques et des listes. ".repeat(3) }));
    const value = scored as Record<string, unknown>;
    expect(value.datasetId).toBe("panel-1");
    expect(value.brand).toBe("Acme");
    expect(value.provenance).toMatchObject({ source: "stored-panel", content: "tenant-supplied" });
    expect(Array.isArray(value.rows)).toBe(true);
  });

  it("generates drafts, with or without content", async () => {
    const r = routes(() => dataset);
    const withContent = await r.get("/aeo-writer/drafts")!.handler(ctx({ content: "Contenu sans rapport réel avec la question posée. ".repeat(4) }));
    expect((withContent as Record<string, unknown>).drafts).toEqual((withContent as { drafts: unknown[] }).drafts);
    expect(((withContent as { drafts: unknown[] }).drafts).length).toBe(1);
    const noContent = await r.get("/aeo-writer/drafts")!.handler(ctx({}));
    expect(((noContent as { drafts: unknown[] }).drafts).length).toBe(1);
  });

  it("passes the requested dataset id to the loader", async () => {
    let seen: (string | null)[] = [];
    const r = routes((tenantId, id) => { seen.push(id); return dataset; });
    await r.get("/aeo-writer/score")!.handler(ctx({ datasetId: "panel-9", content: "Un texte assez long pour passer la borne minimale du contenu. " }));
    expect(seen[seen.length - 1]).toBe("panel-9");
    await r.get("/aeo-writer/score")!.handler(ctx({ content: "Un texte assez long pour passer la borne minimale du contenu. " }));
    expect(seen[seen.length - 1]).toBeNull();
  });
});
