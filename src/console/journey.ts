import { z } from "zod";
import { HtmlDoc } from "../geo/html.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { extractJourneyContext } from "../freeread/journey-context.js";
import { tenantOwnsUrl, type Tenant } from "../tenants/store.js";
import type { Fetcher } from "../geo/http.js";
import type { ConsoleRoute } from "./util.js";

export const journeyReadSchema = z.object({
  pageUrl: z.string().url().max(2048), competitor: z.boolean().default(false),
});
/** Eve and the console use the same bounded public read. The primary page must
 * belong to the selected tenant, including after redirects. Rival pages never
 * access tenant stores or credentials. No search or competitor guessing. */
export async function readJourneyPage(tenant: Tenant, input: z.infer<typeof journeyReadSchema>, fetcher: Fetcher = fetchPublicPage) {
  if (tenant.status !== "active" || (!input.competitor && !tenantOwnsUrl(tenant, input.pageUrl))) throw new Error("Page outside selected workspace");
  const page = await fetcher(input.pageUrl, { timeoutMs: 12000 });
  if (!page.ok || (!input.competitor && !tenantOwnsUrl(tenant, page.url))) throw new Error("Page unavailable or outside selected workspace");
  return { url: page.url, finalUrl: page.url, httpStatus: page.status, journeyContext: extractJourneyContext(HtmlDoc.parse(page.body), page.url) };
}
export const journeyRoutes: ConsoleRoute[] = [{
  path: "/journey/read", needsUrl: false, handler: async ctx => {
    if (!ctx.tenancy?.tenant) throw new Error("Select a workspace");
    return readJourneyPage(ctx.tenancy.tenant, journeyReadSchema.parse(ctx.body));
  },
}];
