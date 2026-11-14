#!/usr/bin/env node
/** Browser QA of actual Social components. All accounts and figures are labelled test fixtures. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const root = path.resolve("site"),
  output = path.resolve(process.env.SOCIAL_QA_OUTPUT_DIR || "qa-social");
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!file.startsWith(root + path.sep)) throw new Error();
    res.setHeader(
      "content-type",
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
      await page.route("**/social-fixture*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/console/social.css"><body style="background:#edf1f7;margin:0"><main style="max-width:1120px;margin:24px auto;padding:0 12px"><p style="color:#58657a;font:12px sans-serif">GTM Growth · ${lang === "fr" ? "Données de test — aucun compte réel" : "Test data — no real accounts"}</p><div id="fixture"></div></main></body></html>`,
        }),
      );
      await page.goto(`${origin}/social-fixture?lang=${lang}`);
      await page.evaluate(async () => {
        const { renderSocial } = await import("/console/social.js");
        const start = new Date().toISOString(),
          end = new Date(Date.now() + 30 * 86400000).toISOString(),
          date = new Date(Date.now() + 86400000).toISOString();
        const c = {
          id: "campaign1",
          name: "Bel Air · autumn collection",
          brand: "Maison Atelier",
          website: "https://example.com",
          language: "en",
          objective: "LEADS",
          audience: "Buyers looking for handmade leather shoes",
          brief:
            "Explain the material, craftsmanship and product fit from verified facts.",
          products: [
            {
              name: "Bel Air",
              url: "https://example.com/bel-air",
              facts: "Leather shoes made in France.",
            },
          ],
          start,
          end,
          status: "ACTIVE",
          version: 1,
        };
        const post = {
          id: "post1",
          campaignId: c.id,
          title: "Bel Air · craftsmanship",
          productUrl: c.products[0].url,
          variants: [
            {
              platform: "linkedin",
              accountId: "atelier-linkedin",
              caption: "Bel Air — leather shoes made in France.",
              link: "https://example.com/bel-air?utm_source=linkedin&utm_medium=social&utm_campaign=campaign1",
              media: [],
            },
          ],
          scheduledAt: date,
          status: "PENDING_APPROVAL",
          version: 1,
          policy: { passed: true, errors: [], warnings: [] },
          targets: [],
        };
        window.fixture = {
          actor: "reviewer",
          role: "admin",
          campaigns: [c],
          posts: [post],
          approvals: [
            {
              id: "approval1",
              type: "POST_APPROVE",
              entityId: post.id,
              status: "PENDING",
              requestedBy: "writer",
              expiresAt: end,
              digest: "a".repeat(64),
              context: { post, campaign: c },
            },
          ],
          creators: [
            {
              id: "creator1",
              campaignId: c.id,
              name: "Leather craft journal",
              platform: "youtube",
              handle: "craft-journal",
              url: "https://youtube.com/@craft-journal",
              source: "https://youtube.com/@craft-journal",
              observedAt: start,
              followers: null,
              posts: [],
              fit: null,
              fitEvidence: "",
              status: "DISCOVERED",
              version: 1,
              score: { engagement: null, fit: null, composite: null },
            },
          ],
          outreach: [],
          accounts: [
            {
              id: "atelier-linkedin",
              name: "Maison Atelier",
              platform: "linkedin",
              status: "ACTIVE",
              observedAt: start,
            },
          ],
          jobs: [],
          audit: [],
          capabilities: {
            postiz: true,
            publishing: true,
            zenml: true,
            youtube: false,
            accounts: [{ id: "atelier-linkedin", platform: "linkedin" }],
          },
        };
        window.calls = [];
        window.mount = async (tab) => {
          document.querySelector("#fixture").replaceChildren(
            await renderSocial({
              tab,
              me: {
                tenant: { name: "Maison Atelier", domains: ["example.com"] },
              },
              api: async (route, body) => {
                window.calls.push({ route, body });
                if (route === "/social/state")
                  return structuredClone(window.fixture);
                if (route === "/social/analytics")
                  return { rows: [], providerMetrics: [] };
                if (route === "/social/approval/decide") {
                  const a = window.fixture.approvals[0];
                  a.status = "APPROVED";
                  a.decision = { comment: body.input.comment };
                  window.fixture.posts[0].status = "APPROVED";
                }
                return {};
              },
            }),
          );
        };
        await window.mount("campaigns");
      });
      for (const tab of [
        "campaigns",
        "posts",
        "calendar",
        "approvals",
        "analytics",
        "creators",
        "connections",
        "runs",
      ]) {
        await page.evaluate((tab) => window.mount(tab), tab);
        await page.waitForSelector(".social-workspace");
        assert.equal(await page.locator(".social-stats>div").count(), 4);
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.ok(
          dimensions.scroll <= width + 1,
          `${tab} ${width}: ${JSON.stringify(dimensions)}`,
        );
        if (["campaigns", "posts", "approvals", "creators"].includes(tab))
          await page.screenshot({
            path: path.join(output, `social-${tab}-${lang}-${width}.png`),
            fullPage: true,
          });
        if (tab === "posts") {
          const composer = page
            .locator(".social-card")
            .filter({
              has: page.getByRole("heading", {
                name:
                  lang === "fr"
                    ? "Préparer un brouillon adapté"
                    : "Prepare a contextual draft",
                exact: true,
              }),
            });
          await composer
            .getByLabel(lang === "fr" ? "Titre interne" : "Internal title", {
              exact: true,
            })
            .fill("Bel Air test draft");
          const date = composer.locator('input[type="datetime-local"]');
          await date.fill("2026-11-15T10:30");
          const network = composer.locator(".social-variants details").first();
          await network.locator("summary").click();
          await network
            .getByRole("button", {
              name:
                lang === "fr"
                  ? "Reprendre les faits du produit"
                  : "Use product facts",
              exact: true,
            })
            .click();
          await composer
            .getByRole("button", {
              name: lang === "fr" ? "Enregistrer le brouillon" : "Save draft",
              exact: true,
            })
            .click();
          await page.waitForFunction(() =>
            window.calls.some((c) => c.route === "/social/post"),
          );
          const saved = await page.evaluate(
            () =>
              window.calls.find((c) => c.route === "/social/post").body.input
                .post,
          );
          assert.equal(saved.scheduledAt, "2026-11-15T02:30:00.000Z");
          assert.equal(saved.variants[0].accountId, "atelier-linkedin");
          assert.match(saved.variants[0].caption, /Bel Air/);
          assert.match(saved.variants[0].link, /utm_campaign=campaign1/);
        }
        if (tab === "approvals") {
          await page
            .locator(".social-card input")
            .first()
            .fill(
              lang === "fr"
                ? "Texte, compte et date vérifiés."
                : "Copy, account and date checked.",
            );
          await page
            .getByRole("button", {
              name:
                lang === "fr"
                  ? "Approuver cette version"
                  : "Approve this version",
              exact: true,
            })
            .click();
          await page.waitForFunction(
            () => window.fixture.approvals[0].status === "APPROVED",
          );
          const call = await page.evaluate(() =>
            window.calls.find((c) => c.route === "/social/approval/decide"),
          );
          assert.equal(call.body.input.digest, "a".repeat(64));
          assert.equal(call.body.input.decision, "APPROVE");
        }
        if (tab === "creators") {
          assert.match(
            await page.locator(".social-workspace").innerText(),
            lang === "fr" ? /aucun score global/ : /no composite score/,
          );
          assert.equal(
            await page
              .getByRole("button", {
                name:
                  lang === "fr" ? "Rechercher sur YouTube" : "Search YouTube",
                exact: true,
              })
              .isDisabled(),
            true,
          );
        }
      }
      await page.evaluate(async () => {
        window.fixture.role = "viewer";
        await window.mount("posts");
      });
      assert.equal(
        await page
          .getByRole("button", {
            name: lang === "fr" ? "Enregistrer le brouillon" : "Save draft",
            exact: true,
          })
          .count(),
        0,
      );
      assert.equal(
        await page.evaluate(() =>
          window.calls.some((c) => c.route === "/social/publish"),
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
  console.log(
    "Social FR/EN desktop/mobile: all eight views, exact review request, read-only state and missing-data labels passed.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
