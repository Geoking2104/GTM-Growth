import {
  type Campaign,
  type Creator,
  type Post,
  type Observation,
} from "./model.js";
export function postPolicy(
  post: Pick<Post, "variants" | "productUrl" | "scheduledAt">,
  campaign: Campaign,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  if (!campaign.products.some((p) => p.url === post.productUrl))
    errors.push("PRODUCT_CONTEXT_REQUIRED");
  if (
    new Set(post.variants.map((v) => v.accountId)).size !== post.variants.length
  )
    errors.push("DUPLICATE_ACCOUNT");
  if (
    Date.parse(post.scheduledAt) < Date.parse(campaign.start) ||
    Date.parse(post.scheduledAt) > Date.parse(campaign.end)
  )
    errors.push("OUTSIDE_CAMPAIGN");
  for (const v of post.variants) {
    if (
      !v.caption
        .toLowerCase()
        .includes(
          campaign.products
            .find((p) => p.url === post.productUrl)
            ?.name.toLowerCase() || "\u0000",
        )
    )
      errors.push("PRODUCT_NAME_REQUIRED");
    const limits: Record<string, number> = {
      x: 280,
      bluesky: 300,
      threads: 500,
      mastodon: 500,
      linkedin: 3000,
      "linkedin-page": 3000,
      instagram: 2200,
      "instagram-standalone": 2200,
    };
    if (
      limits[v.platform] &&
      [...(v.caption + (v.link ? "\n" + v.link : ""))].length >
        limits[v.platform]
    )
      errors.push("CAPTION_TOO_LONG");
    if (
      [
        "instagram",
        "instagram-standalone",
        "tiktok",
        "youtube",
        "pinterest",
      ].includes(v.platform) &&
      !v.media.length
    )
      errors.push("MEDIA_REQUIRED");
    if (v.link) {
      const u = new URL(v.link);
      if (
        !u.searchParams.get("utm_source") ||
        u.searchParams.get("utm_medium") !== "social" ||
        u.searchParams.get("utm_campaign") !== campaign.id
      ) {
        (campaign.utmRequired ? errors : warnings).push("UTM_REQUIRED");
      }
    } else warnings.push("NO_ATTRIBUTION_LINK");
  }
  return {
    passed: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
export function scoreCreator(
  c:
    | Creator
    | Omit<Creator, "score" | "id" | "version" | "status" | "createdBy">,
): Creator["score"] {
  const complete = c.posts.filter((p) =>
    [p.likes, p.comments, p.shares, p.saves].every((v) => v !== null),
  );
  const rates =
    c.followers && complete.length
      ? complete
          .map(
            (p) =>
              ((p.likes! + p.comments! + p.shares! + p.saves!) / c.followers!) *
              100,
          )
          .sort((a, b) => a - b)
      : [];
  const trimmed = rates.length >= 10 ? rates.slice(1, -1) : rates;
  return {
    engagement: trimmed.length
      ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length
      : null,
    fit: c.fitEvidence.trim() ? c.fit : null,
    composite: null,
    coverage: `${complete.length}/${c.posts.length}`,
    flags: [
      ...(complete.length < c.posts.length ? ["INCOMPLETE_METRICS"] : []),
      ...(!c.followers ? ["FOLLOWERS_UNAVAILABLE"] : []),
      "GROWTH_NOT_MEASURED",
      "AUTHENTICITY_NOT_ESTABLISHED",
    ],
  };
}
/** Latest correction wins, independently per post/platform/account/day/source. Never sum reach across audiences. */
export function analytics(rows: Observation[], from: string, to: string) {
  const latest = new Map<string, Observation>();
  for (const r of rows.filter((r) => r.date >= from && r.date <= to)) {
    const key = [r.postId, r.accountId, r.date, r.kind, r.source].join(":");
    if (!latest.has(key) || latest.get(key)!.revision < r.revision)
      latest.set(key, r);
  }
  const values = [...latest.values()];
  const ratio = (n: number | null, d: number | null) =>
    n !== null && d !== null && d > 0 ? (n / d) * 100 : null;
  return {
    rows: values.map((r) => ({
      ...r,
      ctr: ratio(r.clicks, r.impressions),
      engagementRate: [r.likes, r.comments, r.shares, r.saves].every(
        (x) => x !== null,
      )
        ? ratio(r.likes! + r.comments! + r.shares! + r.saves!, r.impressions)
        : null,
    })),
    reachTotal: null,
    note: "Different platforms, sources and audiences are not added together.",
  };
}
