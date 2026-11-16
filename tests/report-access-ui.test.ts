import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { renderReportInvitation } from "../site/console/report-invite.js";

afterEach(() => vi.unstubAllGlobals());

describe("public report delivery experience", () => {
  it.each(["fr", "en"] as const)("keeps mail CTA disabled until the server confirms real delivery (%s)", async lang => {
    const { document, window } = parseHTML("<html><body></body></html>");
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", window);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) }));
    const section = renderReportInvitation({ schemaVersion: 1, sourceUrl: "https://example.com/" }, lang);
    expect(section).not.toBeNull();
    document.body.append(section!);
    await vi.waitFor(() => expect(section!.querySelector(".report-invite-feedback")?.textContent).toContain(lang === "fr" ? "pas encore activé" : "not yet activated"));
    expect(section!.querySelector("button")?.disabled).toBe(true);
    expect(section!.querySelector("input")?.getAttribute("type")).toBe("email");
  });

  it("requires a code and recipient email before protected HTML/PDF/MD are shown", () => {
    const html = readFileSync("site/report/index.html", "utf8");
    const js = readFileSync("site/report/access.js", "utf8");
    const css = readFileSync("site/report/access.css", "utf8");
    const { document } = parseHTML(html);
    expect(document.querySelector("meta[name=robots]")?.getAttribute("content")).toContain("noindex");
    expect(document.querySelector("meta[name=referrer]")?.getAttribute("content")).toBe("no-referrer");
    expect(document.querySelector("#report-code-form input[name=email]")?.hasAttribute("required")).toBe(true);
    expect(document.querySelector("#report-code-form input[name=code]")?.getAttribute("pattern")).toBe("[0-9]{6}");
    expect(document.querySelector("#report-ready")?.hasAttribute("hidden")).toBe(true);
    expect(js).toContain("/verify");
    expect(js).toContain("/download?id=");
    expect(js).not.toContain("localStorage");
    expect(css).toContain("@media(max-width:660px)");
  });
});
