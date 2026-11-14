#!/usr/bin/env node
/** Actual CRM UI, synthetic records only. Exercises both languages and responsive layouts. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const root = path.resolve("site"),
  output = path.resolve(process.env.CRM_QA_OUTPUT_DIR || "qa-crm");
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!file.startsWith(root + path.sep)) throw new Error();
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_BIN ||
      (existsSync(chromium.executablePath())
        ? chromium.executablePath()
        : "/usr/bin/chromium"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const lang of ["en", "fr"])
    for (const width of [1280, 390]) {
      const page = await browser.newPage({
          viewport: { width, height: 1000 },
          timezoneId: "Asia/Shanghai",
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/crm-fixture*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/console/crm.css"><body style="background:#edf1f7;margin:0"><main style="max-width:1180px;margin:24px auto;padding:0 12px"><p style="color:#58657a;font:12px sans-serif">GTM Growth · ${lang === "fr" ? "Données de test — aucun compte réel" : "Test data — no real accounts"}</p><div id="fixture"></div></main></body></html>`,
        }),
      );
      await page.goto(`${origin}/crm-fixture?lang=${lang}`);
      await page.evaluate(async () => {
        const { renderCrm } = await import("/console/crm.js");
        const fr = new URL(location.href).searchParams.get("lang") === "fr";
        const at = "2026-11-01T10:00:00Z";
        window.calls = [];
        const contacts = [
          {
            id: "contact-001",
            label: fr
              ? "Contact 001 · Collection Bel Air"
              : "Contact 001 · Bel Air collection",
            status: "active",
            mode: "native",
            version: 1,
            createdAt: at,
            updatedAt: at,
          },
          {
            id: "contact-002",
            label: fr
              ? "Contact 002 · Autre fiche"
              : "Contact 002 · Another contact",
            status: "active",
            mode: "plugin",
            version: 1,
            createdAt: at,
            updatedAt: at,
          },
        ];
        const settings = { enabled: true, mode: "native", roles: {} };
        const events = ["web", "social", "manual", "shopify", "prestashop"].map(
          (channel, i) => ({
            id: "event-" + i,
            eventId: "source-event-" + i,
            channel,
            type:
              channel === "web"
                ? "page_view"
                : channel === "social"
                  ? "social_message"
                  : channel === "manual"
                    ? "call"
                    : "order_status",
            summary: (fr
              ? [
                  "Page Bel Air consultée",
                  "Question reçue sur le cuir",
                  "Conseil téléphonique sur la pointure",
                  "Commande confirmée dans Shopify",
                  "Statut de commande reçu de PrestaShop",
                ]
              : [
                  "Bel Air product page viewed",
                  "Leather question received",
                  "Phone advice about sizing",
                  "Shopify order confirmed",
                  "PrestaShop order status received",
                ])[i],
            occurredAt: `2026-11-0${i + 1}T10:00:00Z`,
            receivedAt: `2026-11-0${i + 1}T10:05:00Z`,
            source: channel === "manual" ? "manual:advisor" : "client-source",
            provenance:
              channel === "manual"
                ? "human_declared"
                : i > 2
                  ? "commerce_observed"
                  : "source_asserted",
            timeBasis: i === 4 ? "observed" : "source",
            identityKind: "web_user",
            identityScope: "example.com",
            proof: {
              reference: fr
                ? "Référence source vérifiée dans ce scénario fictif"
                : "Reviewed source reference in this synthetic scenario",
            },
            authorization: i < 2 ? "synthetic-receipt-001" : undefined,
            sourceUrl: "https://example.com/records/" + i,
            details:
              i > 2
                ? {
                    orderNumber: String(1000 + i),
                    orderStatus: "paid",
                    amount: 120,
                    currency: "EUR",
                  }
                : {},
            match: {
              profileId: "contact-001",
              method: "human_declared",
              proof: {
                reference: fr
                  ? "Association de compte confirmée"
                  : "Confirmed account association",
              },
              linkedAt: at,
            },
          }),
        );
        events.push({
          ...events[0],
          id: "unlinked",
          eventId: "unlinked-source",
          summary: fr
            ? "Interaction sans identité reliée"
            : "Interaction without a linked identity",
          match: null,
        });
        events.push({
          ...events[0],
          id: "other-contact",
          eventId: "other-source",
          summary: "Contact 002 only",
          match: { ...events[0].match, profileId: "contact-002" },
        });
        const timeline = (body) => {
          let rows = events.filter(
            (e) =>
              (!body.profileId || e.match?.profileId === body.profileId) &&
              (!body.unlinked || !e.match) &&
              (!body.channel ||
                body.channel === "all" ||
                e.channel === body.channel) &&
              (!body.from || e.occurredAt >= body.from) &&
              (!body.to || e.occurredAt <= body.to),
          );
          rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
          return {
            events: rows,
            nextCursor: null,
            sync: { imported: 0, failed: 0 },
          };
        };
        const api = async (route, body = {}) => {
          window.calls.push({ route, body });
          if (route === "/crm/overview")
            return {
              settings,
              role: "admin",
              contacts: body.offset
                ? [{ ...contacts[1], id: "contact-003", label: "Contact 003" }]
                : contacts.filter(
                    (c) => !body.search || c.label.includes(body.search),
                  ),
              hasMore: !body.offset,
              counts: { contacts: 3, linked: 6, unlinked: 1 },
              capabilities: { configured: true, plugins: [] },
              audit: [],
            };
          if (route === "/crm/timeline") return timeline(body);
          if (route === "/crm/contact/detail" || route === "/crm/export")
            return {
              contact: contacts.find((c) => c.id === body.profileId),
              bindings: [
                {
                  id: "binding1",
                  kind: "web_user",
                  scope: "example.com",
                  method: "human_declared",
                  proof: {
                    reference: "Synthetic reviewed account association",
                  },
                  at,
                },
              ],
              ...timeline(body),
            };
          if (route === "/crm/configure") {
            Object.assign(settings, body.input);
            return { saved: true };
          }
          if (route === "/crm/manual") {
            events.push({
              ...events[2],
              id: "manual-new",
              summary: body.input.summary,
              occurredAt: body.input.occurredAt,
              proof: body.input.proof,
            });
            return { accepted: true };
          }
          throw new Error("Unexpected QA route " + route);
        };
        window.mount = async (tab) =>
          document.getElementById("fixture").replaceChildren(
            await renderCrm({
              api,
              me: {
                tenant: {
                  name: fr
                    ? "Maison Atelier · espace fictif"
                    : "Maison Atelier · synthetic workspace",
                },
              },
              tab,
            }),
          );
        await window.mount("timeline");
      });
      const L = (fr, en) => (lang === "fr" ? fr : en);
      await page.getByRole("button", { name: /Contact 001/ }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 5,
      );
      assert.ok(
        !(await page.locator(".crm-timeline").innerText()).includes(
          "Contact 002 only",
        ),
      );
      assert.ok(
        (await page.locator(".crm-workspace").innerText()).includes(
          "Asia/Shanghai",
        ),
      );
      await page.locator(".crm-event summary").first().click();
      assert.equal(
        await page
          .locator(".crm-event")
          .first()
          .locator("details")
          .getAttribute("open"),
        "",
      );
      const link = page
        .locator(".crm-event")
        .first()
        .getByRole("link", {
          name: L("Ouvrir la source", "Open source") + " ↗",
        });
      assert.equal(
        await link.getAttribute("href"),
        "https://example.com/records/4",
      );
      assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
      assert.ok(
        (await page.locator(".crm-event").first().innerText()).includes(
          L("date d’observation", "observation time"),
        ),
      );
      assert.match(
        await page.locator(".crm-event time").first().innerText(),
        /18:00|6:00\s*PM/,
        "10:00 UTC displays as 18:00 / 6:00 PM in Asia/Shanghai",
      );
      await page.screenshot({
        path: path.join(output, `crm-timeline-${lang}-${width}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: L("Contacts suivants", "More contacts"),
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".crm-contact-list .crm-contact").length ===
          3,
      );
      await page
        .getByLabel(L("Canal", "Channel"), { exact: true })
        .selectOption("social");
      await page
        .getByRole("button", {
          name: L("Filtrer", "Apply filters"),
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 1,
      );
      assert.equal(
        await page.locator(".crm-event").getAttribute("data-channel"),
        "social",
      );
      await page
        .getByLabel(L("Canal", "Channel"), { exact: true })
        .selectOption("all");
      await page
        .getByRole("button", {
          name: L("Filtrer", "Apply filters"),
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 5,
      );
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: L("Exporter cette fiche", "Export this contact"),
        })
        .click();
      const download = await downloadPromise;
      const exported = JSON.parse(
        await readFile(await download.path(), "utf8"),
      );
      assert.equal(exported.contact.id, "contact-001");
      assert.equal(exported.events.length, 5);
      await page
        .getByRole("button", {
          name: L("Tous les événements", "All events"),
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 7,
      );
      await page
        .getByRole("button", {
          name: L("À rapprocher", "Unlinked"),
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 1,
      );
      assert.ok(
        (await page.locator(".crm-event").innerText()).includes(
          L("Non relié", "Unlinked"),
        ),
      );
      await page.getByRole("button", { name: /Contact 001/ }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 5,
      );
      const manual = page
        .locator(".crm-disclosure")
        .filter({
          has: page.locator("summary", {
            hasText: L(
              "Ajouter un appel, un rendez-vous ou une note",
              "Add a call, meeting or note",
            ),
          }),
        })
        .first();
      await manual.locator("summary").first().click();
      await manual
        .getByLabel(L("Résumé", "Summary"), { exact: true })
        .fill("Synthetic follow-up");
      await manual
        .getByLabel(L("Référence de la déclaration", "Declaration reference"))
        .fill("Test advisor record");
      await manual
        .getByRole("button", {
          name: L("Ajouter l’interaction", "Add interaction"),
        })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll(".crm-event").length === 6,
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.calls.find((c) => c.route === "/crm/manual").body.input
              .profileId,
        ),
        "contact-001",
      );
      assert.equal(
        await page.locator(".crm-contact-list .crm-contact").count(),
        2,
        "A fresh reload resets pagination without duplicate contacts",
      );
      await page.evaluate(() => window.mount("connections"));
      await page
        .getByLabel(L("Mode principal", "Primary mode"))
        .selectOption("plugin");
      await page
        .getByRole("button", {
          name: L(
            "Enregistrer le mode et la collecte",
            "Save mode and collection",
          ),
        })
        .click();
      await page.waitForFunction(() =>
        window.calls.some((c) => c.route === "/crm/configure"),
      );
      assert.equal(
        await page.getByLabel(L("Mode principal", "Primary mode")).inputValue(),
        "plugin",
      );
      assert.ok(
        (await page.locator(".crm-workspace").innerText()).includes(
          L("Aucun plugin configuré", "No plugin configured"),
        ),
      );
      await page.screenshot({
        path: path.join(output, `crm-connections-${lang}-${width}.png`),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        "No horizontal overflow",
      );
      assert.deepEqual(errors, []);
      await page.goto(
        `${origin}/${lang === "fr" ? "fr/index.html" : "index.html"}`,
      );
      await page
        .getByRole("button", { name: L("Refuser", "Reject"), exact: true })
        .click();
      await page.locator("#crm-global").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#crm-global details").count(), 5);
      await page.locator("#crm-global summary").nth(1).click();
      assert.ok(
        await page
          .locator("#crm-global details")
          .nth(1)
          .evaluate((e) => e.open),
      );
      await page.locator("#crm-global").screenshot({
        path: path.join(output, `crm-website-${lang}-${width}.png`),
        // The full-height section crop must not include an unrelated sticky header.
        style: ".site-header { visibility: hidden !important; }",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await page.close();
    }
  console.log(
    "CRM browser QA passed: FR/EN, desktop/mobile, exact contact scope, filters, source evidence, export, manual form, both CRM modes and public illustration.",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
