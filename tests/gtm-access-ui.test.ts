import { afterEach, expect, it, vi } from "vitest";
class Stub {
  children: Stub[] = []; textContent = ""; onclick?: () => Promise<void>; href = ""; type = "";
  constructor(public tagName: string) {}
  append(...nodes: Stub[]) { this.children.push(...nodes); }
  setAttribute() {}
}
const flatten = (node: Stub): Stub[] => [node, ...node.children.flatMap(flatten)];
afterEach(() => vi.unstubAllGlobals());
it("copies the actual service account and gives a manual fallback", async () => {
  vi.stubGlobal("location", { search: "", pathname: "/console/", hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => "fr" });
  vi.stubGlobal("document", { documentElement: { lang: "fr" }, createElement: (tag: string) => new Stub(tag) });
  const write = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
  const { renderGtmAccess } = await import("../site/console/analytics.js");
  const root = renderGtmAccess({ email: "client@example.iam.gserviceaccount.com" }) as unknown as Stub;
  const button = flatten(root).find((node) => node.textContent === "Copier l’adresse"); expect(button).toBeDefined();
  await button!.onclick!(); expect(write).toHaveBeenCalledWith("client@example.iam.gserviceaccount.com");
  write.mockRejectedValueOnce(new Error("denied")); await button!.onclick!();
  expect(flatten(root).some((node) => node.textContent.includes("sélectionnez et copiez"))).toBe(true);
  const missing = renderGtmAccess(null) as unknown as Stub;
  expect(flatten(missing).some((node) => node.textContent.includes("indisponible"))).toBe(true);
  expect(flatten(missing).some((node) => node.textContent === "Copier l’adresse")).toBe(false);
});
