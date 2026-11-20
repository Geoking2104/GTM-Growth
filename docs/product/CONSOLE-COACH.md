# Console coach and contextual understanding

The console starts with a visible guide that helps a customer choose a useful next action. The guide follows the current workspace, selected goal and screen. It explains the information already available in the console and points to existing workflows.

The design answers four questions throughout the journey:

1. **What am I looking at?** A plain-language purpose and an illustrated stage.
2. **Where does this come from?** The source, selected scope, collection state and timing.
3. **What is it connected to?** Related analyses, settings, evidence and review workflows.
4. **What changes if I act?** The direct effect, the next verification and the limits of any inference.

## Customer journey

### 1. Start with a goal

The coach is visible when an authenticated customer opens the console. It can be collapsed and reopened without losing access to the screen. Its recommendations use the customer's existing personal goal: traffic, leads, sales, AI visibility or local visibility.

Changing a goal is an explicit preference update. It does not change workspace membership, provider permissions or account-level configuration. Existing role, audience, lifecycle stage and personal target preferences are preserved.

### 2. Follow an explained next step

The guide links to the next useful action in the existing console. A missing source produces a connection or evidence-gathering step. An available audit produces a path to reviewing evidence, preparing work and measuring the result.

Configured sources, verified access and measured outcomes remain separate states. The coach must not infer that a configured GA4 property has working tracking, that a completed readiness audit demonstrates AI citations, or that a planned campaign has generated revenue.

### 3. Understand the current screen

The five primary areas have distinct colours, icons and written labels:

| Area | Visual family | Customer question |
| --- | --- | --- |
| Cockpit and priorities | Violet | What should I do next? |
| Diagnosis and opportunities | Blue/cyan | What is happening and what proves it? |
| Studio and approvals | Amber | What should we prepare and review? |
| Impact and revenue | Green | What results have actually been observed? |
| Sources and workspace | Slate | What is connected and who can act? |

Colour reinforces the labels; it never carries status or meaning alone. Illustrations are local vector assets. They explain the role of a stage rather than pretending to show a customer's site, product or results.

### 4. Inspect an element in context

The contextual inspector explains cards, indicators, charts, fields and actions with the same structure: **origin**, **relationships**, **consequences** and **freshness**. Related links open existing console routes.

Metric explanations distinguish common interpretations. For example, impressions are opportunities to be seen, clicks are observed search interactions, a CTR is a ratio, and position is an average for a particular scope. A change in one indicator does not establish the cause of a change in another.

For an editable field or action, the explanation describes the affected scope and the next verification. Planning dates and owners organise work; they do not schedule native publishing. An approval is separate from execution. Changing a reporting period changes the observation window rather than the source data.

### 5. Follow actual activity and freshness

The interface exposes actual load states and timestamps. A loading, disconnected, failed or stale source is not rendered as zero. A successful refresh means that a response was obtained; it does not prove that a provider produced new observations at that moment.

The coach reuses the current screen's data and background progress. It does not generate new audit evidence or make a paid model request merely because a user opens its help or navigates between screens.

The activity panel reads the saved operations inventory every 30 seconds while visible. It distinguishes the last successful read from the timestamp of the latest recorded collection. The dedicated GA4 realtime screen rereads the actual realtime endpoint on the same interval and identifies its 30-minute observation window. Each panel also offers an explicit refresh control.

These loops pause on hidden or offline pages, refuse results from obsolete workspace scopes and stop when their view is disposed. A failed refresh is labelled unavailable and any retained prior response is identified as previous data. Regular search and audience charts keep their original reporting periods and provider delays; the interface does not relabel those charts as real time.

### 6. Ask about the data

The existing data assistant remains available for explicit questions. Its answers identify the source and period, retain caveats and point back to the detailed analysis. Guided questions do not imply an unrestricted generative chat or an autonomous agent with publication rights.

## Interaction and accessibility

- The welcome guide is non-blocking; users can continue with the console immediately.
- Collapse, reopen, goal selection and help actions work with the keyboard.
- Contextual help uses an accessible dialog. Escape closes it and focus returns to its trigger.
- Controls retain visible focus indicators, usable touch targets and text labels.
- The layout adapts to a 390 px viewport without horizontal page overflow.
- Motion follows `prefers-reduced-motion`; an animation is never the only indication of progress.
- French and English contain the same concepts, controls and recovery paths.
- Local images, scripts and styles work with the production content security policy.

## Implementation

| Component | Responsibility |
| --- | --- |
| `site/console/coach-model.js` | Pure bilingual guide catalogue, element explanations and evidence-based next-step selection |
| `site/console/coach.js` | Visible coach, personal goal controls and contextual inspector |
| `site/console/coach.css` | Coach layout, area colours, responsive treatment and accessible focus/motion rules |
| `site/assets/coach/` | Locally served illustrations for the stages |
| `site/console/context-help.js` | Keyboard-accessible help controls for rendered and asynchronously loaded elements |
| `site/console/journey-board.js` | Illustrated journey and source status grounded in the current workspace |
| `site/console/console-live.js` | Bounded, read-only operations and GA4 realtime refresh loops |
| `site/console/app.js` | Workspace and route integration, actual source data and lifecycle cleanup |
| Existing `/data-agent/context` and `/data-agent/profile` routes | Tenant-scoped personal context and explicit preference persistence |
| Existing data assistant | Explicit supported questions against authorised data |

The model functions do not fetch data or mutate state. `getCoachGuide` explains a route, `getElementGuide` explains an element in that route, and `buildCoachPlan` selects steps from the profile and currently supplied observations.

The UI receives context from the host application. It must discard stale asynchronous results after disposal or a workspace change. Browser presentation preferences are scoped to the customer and user rather than shared across tenants.

No additional SaaS subscription, embedded third-party support widget or production credential is needed for this layer. Existing source and billing permissions still apply to the actions reached from the guide.

## Verification

Run the dedicated browser acceptance script from the repository root:

```sh
node scripts/qa-console-coach.mjs
```

Set `CHROMIUM_BIN` if Chromium is installed outside Playwright's normal location. Set `CONSOLE_COACH_QA_OUTPUT_DIR` to choose the directory for screenshots and the machine-readable acceptance result. Output is test evidence and is not served by the application.

The script opens the actual console under a strict content security policy, with synthetic authentication and deterministic API responses. It runs French and English at desktop and mobile widths. It exercises a first-ever welcome without a blocking wizard, collapse/reopen controls, an explicit goal change, route-aware contextual help, source errors, workspace switching and keyboard behaviour. It checks both an operations refresh and an updated GA4 realtime measurement. All network traffic remains local to the fixture; the test does not use production credentials or paid provider calls.

Unit coverage checks route coverage, goal-dependent priorities, missing and restricted sources, and metric/field/action explanations. Browser coverage verifies integration rather than only checking that explanatory strings exist in files.

Production verification should confirm the deployed asset types, the public console shell and service health. A full authenticated customer acceptance run requires an authorised workspace with its actual connections; synthetic screenshots are not evidence of customer performance.

## Design references

These references informed interaction patterns. The implementation uses GTM Growth's own visual identity and data contracts.

| Reference | Relevant pattern | Application in GTM Growth |
| --- | --- | --- |
| [HubSpot — Use Breeze Assistant](https://knowledge.hubspot.com/ai/use-breeze-assistant) | The assistant uses account context and respects user permissions. | Context follows the selected customer, goal and screen; suggested actions retain native permissions. |
| [Salesforce — Guidance Center](https://trailhead.salesforce.com/content/learn/modules/guidance-center-quick-look/get-to-know-the-guidance-center-for-admins) | Guidance and learning resources are available during work and can align with experience and business goals. | Help is available in the screen where a user must decide, with a visible next step. |
| [Customer.io — Automation workflow builder](https://docs.customer.io/messaging/send/workflows/builder/) | A visual canvas makes relationships between workflow steps inspectable. | The journey connects evidence, preparation, review and measurement through explicit route links and illustrations. |
| [Amplitude — Metrics](https://amplitude.com/docs/analytics/metrics) | A metric has a definition, related uses and a history, in addition to its chart. | Indicator help explains provenance, relationships, interpretation and freshness. |

Reference review: 20 November 2026. These are product patterns rather than a claim of feature parity with the referenced services.

## Deliberate limits

The coach explains available evidence and guides existing workflows. It does not infer unavailable revenue, invent live observations, approve work on a user's behalf or replace an organisation's permission model. Planning suggestions are not commitments about future performance. Provider data retains its own reporting delay and consent requirements.
