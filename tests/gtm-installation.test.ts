import { describe, expect, it } from "vitest";
import {
  auditGtmHtml,
  auditGtmInstallation,
  extractContainerIds,
  generateGtmSnippet,
} from "../src/google/gtm-installation.js";
import type { Fetcher } from "../src/geo/http.js";
import { gtmTools } from "../src/tools/gtm.js";

const CONTAINER = "GTM-ABC1234";

function page(options: { loaderInBody?: boolean; secondContainer?: boolean; dataLayerAfter?: boolean; noscript?: boolean } = {}) {
  const dataLayer = "<script>window.dataLayer = window.dataLayer || [];</script>";
  const consent = `<script>gtag('consent', 'default', {ad_storage: 'denied', analytics_storage: 'denied'});</script>`;
  const loader = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':0777,event:'gtm.js'});j.src='https://www.googletagmanager.com/gtm.js?id='+i;})(window,document,'script','dataLayer','${CONTAINER}');</script>`;
  const duplicate = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ZZZ9999"></script>`;
  const noscript = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${CONTAINER}"></iframe></noscript>`;

  const head = `<head>${options.dataLayerAfter ? "" : dataLayer}${consent}${
    options.loaderInBody ? "" : loader
  }${options.secondContainer ? duplicate : ""}</head>`;
  const body = `<body>${options.dataLayerAfter ? dataLayer : ""}${options.noscript === false ? "" : noscript}${
    options.loaderInBody ? loader : ""
  }</body>`;
  return `<!doctype html><html>${head}${body}</html>`;
}

describe("GTM installation audit", () => {
  it("passes a correctly installed container", () => {
    const { containerIds, checks } = auditGtmHtml(page());
    expect(containerIds).toEqual([CONTAINER]);
    expect(checks.filter((check) => check.required && check.status !== "pass")).toEqual([]);
    expect(checks.find((check) => check.id === "gtm.consent_default")?.status).toBe("pass");
  });

  it("fails when the loader sits in the body", () => {
    const { checks } = auditGtmHtml(page({ loaderInBody: true }));
    const head = checks.find((check) => check.id === "gtm.head_snippet");
    expect(head?.status).toBe("fail");
    expect(head?.evidence).toMatch(/outside <head>/);
  });

  it("fails when the noscript fallback is missing", () => {
    const { checks } = auditGtmHtml(page({ noscript: false }));
    expect(checks.find((check) => check.id === "gtm.noscript")?.status).toBe("fail");
  });

  it("fails when dataLayer is initialized after the loader", () => {
    const { checks } = auditGtmHtml(page({ dataLayerAfter: true }));
    const order = checks.find((check) => check.id === "gtm.datalayer_order");
    expect(order?.status).toBe("fail");
    expect(order?.evidence).toMatch(/after the GTM loader/);
  });

  it("fails when two containers are installed", () => {
    const { containerIds, checks } = auditGtmHtml(page({ secondContainer: true }));
    expect(containerIds.sort()).toEqual([CONTAINER, "GTM-ZZZ9999"].sort());
    const single = checks.find((check) => check.id === "gtm.single_container");
    expect(single?.status).toBe("fail");
    expect(single?.evidence).toMatch(/Multiple containers/);
  });

  it("reports a page with no GTM at all as failing every required check", () => {
    const { containerIds, checks } = auditGtmHtml("<html><head><title>x</title></head><body></body></html>");
    expect(containerIds).toEqual([]);
    expect(checks.filter((check) => check.required && check.status === "fail")).toHaveLength(4);
  });

  it("extracts ids case-insensitively and de-duplicates", () => {
    expect(
      extractContainerIds("gtm-abc1234 GTM-ABC1234 GTM-ZZZ9999")
    ).toEqual([CONTAINER, "GTM-ZZZ9999"]);
  });

  it("ignores GTM-like strings that are not container ids", () => {
    expect(
      extractContainerIds('{"event":"GTM-INIT"} GTM-ABCD GTM-K7GFJTV')
    ).toEqual(["GTM-K7GFJTV"]);
  });

  it("audits a live page through the injected fetcher", async () => {
    const fetcher: Fetcher = async (url) => ({
      url,
      status: 200,
      ok: true,
      headers: {},
      body: page(),
    });
    const result = await auditGtmInstallation({ url: "https://example.com", fetcher });
    expect(result.score).toBe(100);
    expect(result.containerIds).toEqual([CONTAINER]);
    expect(result.error).toBeUndefined();
  });

  it("returns an error instead of throwing when the page is unreachable", async () => {
    const offline: Fetcher = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await auditGtmInstallation({ url: "https://nope.example", fetcher: offline });
    expect(result.score).toBe(0);
    expect(result.error).toBeTruthy();
  });
});

describe("GTM snippet generator", () => {
  it("normalizes the container id and emits head + body snippets", () => {
    const snippet = generateGtmSnippet({ containerId: "gtm-abc1234" });
    expect(snippet.containerId).toBe(CONTAINER);
    expect(snippet.head).toContain(`'${CONTAINER}'`);
    expect(snippet.head).toContain("googletagmanager.com/gtm.js");
    expect(snippet.body).toContain(`ns.html?id=${CONTAINER}`);
    expect(snippet.dataLayer).toContain("window.dataLayer = window.dataLayer || []");
    expect(snippet.all.indexOf("dataLayer")).toBeLessThan(snippet.all.indexOf("gtm.start"));
  });

  it("can omit the dataLayer block", () => {
    const snippet = generateGtmSnippet({ containerId: CONTAINER, includeDataLayer: false });
    expect(snippet.dataLayer).toBeUndefined();
    expect(snippet.head).toContain("googletagmanager.com/gtm.js");
  });

  it("emits a default consent block when asked", () => {
    const snippet = generateGtmSnippet({
      containerId: CONTAINER,
      consentDefault: { ad_storage: "denied", analytics_storage: "granted" },
    });
    expect(snippet.consent).toContain("'consent'");
    expect(snippet.consent).toContain("'default'");
    expect(snippet.consent).toContain('"analytics_storage": "granted"');
    expect(snippet.all.indexOf("'consent'")).toBeLessThan(snippet.all.indexOf("gtm.start"));
  });

  it("rejects an invalid container id", () => {
    expect(() => generateGtmSnippet({ containerId: "GTM-12" })).toThrow(/Invalid GTM container id/);
    expect(() => generateGtmSnippet({ containerId: "UA-12345-1" })).toThrow(/Invalid GTM container id/);
  });
});

describe("GTM installation tools", () => {
  it("are registered on the server", () => {
    const names = gtmTools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["gtm_audit_installation", "gtm_generate_snippet"]));
  });

  it("rejects an invalid container id through the tool handler", async () => {
    const tool = gtmTools.find((entry) => entry.name === "gtm_generate_snippet");
    const result = await tool!.handler({ containerId: "nope" });
    expect(JSON.stringify(result)).toMatch(/Invalid GTM container id/);
  });
});
