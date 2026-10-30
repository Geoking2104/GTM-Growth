# Example reports (for marketers)

These are output shapes, not live account results. Bracketed text is a placeholder to replace only with tool results or a clearly labeled estimate. Never present example values as the user's data.

## 1. Weekly briefing

**GA4 property:** `[property id]`

**Period:** `[start date] – [end date]` vs `[comparison start] – [comparison end]`

| Metric | Current | Previous | Change | Source |
|---|---:|---:|---:|---|
| Users | `[API result]` | `[API result]` | `[calculated]` | GA4 |
| Sessions | `[API result]` | `[API result]` | `[calculated]` | GA4 |
| Top channel | `[channel + sessions]` | `[channel + sessions]` | `[calculated]` | GA4 |
| Top page | `[page + sessions]` | `[page + sessions]` | `[calculated]` | GA4 |

**Actions**

1. `[Evidence-backed finding]` → `[action]` → measure `[KPI]`.
2. `[Evidence-backed finding]` → `[action]` → measure `[KPI]`.
3. `[Evidence-backed finding]` → `[action]` → measure `[KPI]`.

## 2. SEO & performance table

| Page | Search clicks | Impressions / CTR | CrUX field vitals | PageSpeed lab | Priority |
|---|---:|---:|---|---|---|
| `[URL]` | `[API result]` | `[API result]` | `[API result or no data]` | `[API result]` | `[reason]` |

Clearly label CrUX as field data and PageSpeed as lab data. Explain why the page is prioritized; do not infer conversion impact from a lab score alone.

## 3. Detailed growth dashboard

**Decision:** `[healthy / needs work / urgent issue + one-sentence evidence]`

**Scope:** `[property ids, dates, comparison dates, sources used/unavailable]`

**Confidence:** `[high / medium / low + reason]`

| KPI | Current | Comparison | Change | Source / confidence |
|---|---:|---:|---:|---|
| Sessions / users | `[API result]` | `[API result]` | `[calculated]` | GA4 |
| Qualified conversions / revenue | `[API result or N/D]` | `[API result or N/D]` | `[calculated or N/D]` | GA4 / ecommerce |
| Organic clicks / CTR / position | `[API result]` | `[API result]` | `[calculated]` | Search Console |
| Mobile LCP / INP / CLS | `[CrUX result or N/D]` | `[CrUX result or N/D]` | `[calculated or N/D]` | CrUX field data |

### Watch points (minimum 10 for a full audit)

Fill each row from the actual account evidence. These are coverage prompts, not assumed defects.

| # | Area | Evidence and period | Why it matters | Change / monitor | KPI and effect estimate |
|---:|---|---|---|---|---|
| 1 | Acquisition mix | `[GA4 channel change]` | `[business relevance]` | `[action]` | `[KPI; formula or not yet quantifiable]` |
| 2 | Landing page performance | `[GA4 top/declining pages]` | `[business relevance]` | `[action]` | `[KPI; formula or not yet quantifiable]` |
| 3 | Conversion funnel | `[GA4 event counts/rates]` | `[largest evidenced drop]` | `[action]` | `[KPI; formula or not yet quantifiable]` |
| 4 | Event tracking quality | `[GTM audit / GA4 event evidence]` | `[measurement risk]` | `[repair/validate]` | `[coverage or reconciliation KPI]` |
| 5 | Search demand | `[Search Console impressions/query trend]` | `[demand opportunity/risk]` | `[action]` | `[clicks = impressions × CTR gap, if justified]` |
| 6 | Organic CTR | `[clicks, impressions, position]` | `[page/query opportunity]` | `[snippet/content test]` | `[formula + site-specific target]` |
| 7 | Indexation | `[URL inspection / sitemap result]` | `[affected valuable URLs]` | `[technical fix/check]` | `[indexed eligible URLs; quantify only from API data]` |
| 8 | Mobile experience | `[CrUX PHONE result]` | `[field-user impact]` | `[action]` | `[affected sessions and CWV target]` |
| 9 | Page speed lab diagnostics | `[PageSpeed URL/strategy result]` | `[likely bottleneck, not causal proof]` | `[technical test]` | `[lab metric target; revenue only after experiment]` |
| 10 | Segment / device difference | `[GA4 or Search Console breakdown]` | `[which segment differs]` | `[action]` | `[segment KPI with volume]` |
| 11 | Data coverage / freshness | `[missing source, stale date, or threshold]` | `[confidence limit]` | `[access/measurement fix]` | `[coverage/freshness target]` |

If a category has no evidence, label it “à vérifier / hypothèse” and list the data needed. Do not state it as a finding.

### Three priorities

| Horizon | Priority and owner | Implementation | Success measure | Expected effect / calculation | Confidence |
|---|---|---|---|---|---|
| Short term (0–30 days) | `[highest evidenced opportunity; role]` | `[steps, effort, dependencies]` | `[baseline → target; review date]` | `[defensible range, formula, and assumptions; or target only]` | `[level + reason]` |
| Medium term (1–3 months) | `[next opportunity; role]` | `[steps, effort, dependencies]` | `[baseline → target; review date]` | `[defensible range, formula, and assumptions; or target only]` | `[level + reason]` |
| Long term (3–12 months) | `[structural opportunity; role]` | `[steps, effort, dependencies]` | `[baseline → target; review date]` | `[defensible range, formula, and assumptions; or target only]` | `[level + reason]` |

For ecommerce, a scenario may use `eligible sessions × tested conversion-rate change × average order value`. For lead generation, use `eligible sessions × tested conversion-rate change`; do not estimate revenue without lead-to-sale and value data. For SEO CTR, use `impressions × (site-specific target CTR − current CTR)`. Show estimates as scenarios, never guarantees, and do not add overlapping opportunities.

## 4. GEO / AI search readiness audit

Report the score and band first, then only the categories losing points, then the fix order exactly as returned. Never re-sort recommendations by opinion — priority and recoverable points are already computed.

| Category | Points | Max | Finding |
|---|---:|---:|---|
| robots.txt | `[x]` | 18 | `[citation bots explicit or wildcard-only; any blocked bots]` |
| llms.txt | `[x]` | 18 | `[words, sections, links, /llms-full.txt]` |
| Schema JSON-LD | `[x]` | 16 | `[types found, richness, incomplete types]` |
| Meta tags | `[x]` | 14 | `[title/description length, canonical, OG]` |
| Content | `[x]` | 12 | `[words, H2/H3, lists, front-loading, numbers]` |
| Brand & Entity | `[x]` | 10 | `[KG pillars, about/contact, name coherence]` |
| Signals | `[x]` | 6 | `[lang, RSS, freshness]` |
| AI discovery | `[x]` | 6 | `[which endpoints 404]` |

| # | Priority | Check | +Pts | Action |
|---|---|---|---:|---|
| 1 | `[priority]` | `[check id]` | `[points]` | `[action returned by the tool]` |

Rules: blockers first (`meta.x_robots_noindex`, `meta.noai`); quote the check evidence instead of restating it; say "readiness", never "citations". A worked example with real numbers (78/100 for stripe.com, 8 categories, 6 fixes) is in the repository README, section 8 — "Example GEO report".

## Thresholds to mention

| Metric | Good | Needs work | Poor |
|---|---|---|---|
| LCP | ≤ 2,5 s | ≤ 4,0 s | > 4,0 s |
| INP | ≤ 200 ms | ≤ 500 ms | > 500 ms |
| CLS | ≤ 0,1 | ≤ 0,25 | > 0,25 |
| Lighthouse | ≥ 90 | 50–89 | < 50 |
