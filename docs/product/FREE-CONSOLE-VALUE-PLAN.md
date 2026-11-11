# Free public console — conversion and evidence plan

Status: first UI/API implementation on `feat/free-console-recommendations`; deployment and live end-to-end verification are separate release steps. Language priority: English and French must remain equivalent.

## Positioning

**A public URL should produce a first useful correction, not just a score.** The user sees the measured fact, a clear next step, plausible technical benefit, effort and a safe follow-up CTA. We do **not** promise search rank, AI citations, revenue uplift, automatic publication or a 100/100 result.

## Competitive baseline (official vendor pages, November 2026)

| Product | Free value offered | Design implication |
|---|---|---|
| [Sorank](https://www.sorank.com/fr/logiciel-geo/extension-seo-chrome-gratuite) (France) | Chrome extension with SEO/GEO scores, on-page issues, robots.txt, sitemap, llms.txt and PDF export | Give users a readable multi-signal read with prioritised next steps |
| [Ahrefs Webmaster Tools](https://ahrefs.com/webmaster-tools/) | Site audit with 170+ technical/on-page issue types, additional credits for verified owners | Make evidence and practical fixes tangible |
| [Semrush Free](https://www.semrush.com/blog/what-can-i-do-with-a-free-account-from-semrush/) | 100 URLs/month in free Site Audit | Expand the useful free diagnostic within bounded costs |
| [Seobility](https://www.seobility.net/en/free-seo-tools/) | Free on-page checker and plain-language issue explanations | Explain each failure in non-expert language |
| [HubSpot AI Search Grader](https://www.hubspot.fr/ai-search-grader) | Free one-time AI-brand visibility snapshot and clear upgrade path | Give a specific first result, then ask for identity only when useful |

## Screen-by-screen improvement (the public `/console/#c-public-read` page)

1. **Before the result — the hero:** place a prominent free-URL field under the headline. Explain that no account or Search Console connection is required and that only the entered public page is read. **Implemented.**
2. **Summary card:** replace the apparent certainty of “projected 100/100” with a v1 page-only readiness score, count of passed / improvable controls and theoretical recoverable points. Avoid conflating score gains with traffic gains. **Implemented.**
3. **Evidence:** surface a four-signal snapshot (title, canonical, indexation, sitemap) before the technical tables; retain an expandable, fully localised evidence list. **Implemented.**
4. **Action choices:** add the AI recommendation button with three ranking modes and up to six evidence-backed choices; each has effort, rubric-point effect if available, proof and CTA to the guided workspace. The algorithm runs on measured fail/partial checks and puts hard indexing blockers first. **Implemented.**
5. **Engine references:** use recognisable Google, Bing, ChatGPT, Gemini, Perplexity and Claude marks, with text names and a clear disclosure that they were not queried individually. **Implemented.**
6. **Social references:** report discovered outbound social profiles and sameAs values; never invent incoming backlinks. **Implemented.**

## Follow-up conversion experiments (proposed, not shipped)

| Experiment | Free experience | CTA / differentiation | Guardrail |
|---|---|---|---|
| Search-snippet preview | Render the measured title/description as a Google-style, clearly labelled **simulated** snippet | “Improve this snippet” | No claim to reproduce a live SERP |
| One-page proof sheet | Download a local PDF of the public checks and ranked top fixes | “Save my plan” | No invented traffic or position data |
| Re-audit comparison | Allow a user to rerun a page and visually compare two measurements | “Track progress” in Cloud Solo | History only with user account and consent |
| Content answer examples | Show a sample H1/FAQ rewrite based solely on measured page facts | “Review a suggested edit” | Preview only; user must approve writing |
| Engine coverage map | Explain which checks affect access, discovery, schema, content, and reporting | “Connect verified properties” | Logos do not imply direct measurement |
| Competitor gap scan | Bounded comparison for two supplied public URLs | “Track competitors” in paid cloud | Clear scope, rate limits, robots and anti-SSRF |
| Verified multi-page analysis | Crawl owned sites with the isolated Playwright worker | “Verify my domain” | DNS TXT / HTTPS proof, resource limits, no public unverified Playwright |

## Free vs Cloud boundary

- **Public free:** one public URL, inspect accessible technical SEO/GEO signals, evidence, bounded recommendations, brand/social outgoing links, no login.
- **Open source:** full self-hosted software under Apache-2.0 remains free.
- **Cloud pilot:** €39 Solo / €149 Agency monthly, subject to pre-launch legal, VAT, quotas and Mollie validation. Reserved value: connected first-party analytics, verified-domain multi-page audits, monitoring, repeat comparisons, reports, collaboration and approved corrections.

## Acceptance and measurement

- FR and EN contain the same sections, logos and controls; no English marketing sentence leaks into the French UI. Raw technical evidence is labelled as such and may retain original field values.
- Every recommendation comes from a failing/partial audit check. Critical indexing blocks rank ahead of cosmetic gains. Zero-point blockers never pretend to earn GEO points.
- No public score publication, remote site modification, social backlink inference or “live AI visibility” claim.
- Test 1440px and mobile (375px/390px) for legibility, focus, tap size and no horizontal overflow.
- Monitor: free-analysis starts, successful reports, recommendation-button opens, mode changes, evidence expands, guided sign-ins. Do not add tracking without consent controls.

## Screenshot slots

Capture the actual production **FR** and **EN** public console at the URL-field, summary, expanded recommendation choices and evidence accordion after release; avoid illustrating a French screen with an English example. Any sample page shown must be labelled with its URL and capture date. Keep the original screenshots as release QA evidence, not fabricated website screenshots.
