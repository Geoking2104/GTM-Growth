// Adapted from vercel/eve's Apache-2.0 data-agent template; see NOTICE.md.
export type Principal = { authenticator: string; principalId: string; attributes: Record<string, unknown> } | null;
const ids = (value: string | undefined) => (value ?? "").split(",").map(v => v.trim()).filter(Boolean);
export function slackIdentity(auth: Principal, env = process.env) {
  if (!auth || auth.authenticator !== "slack-webhook" || !env.SLACK_TEAM_ID) return null;
  const channelId = auth.attributes.channel_id;
  if (typeof channelId !== "string" || !ids(env.SLACK_ALLOWED_CHANNEL_IDS).includes(channelId)) return null;
  const userId = ids(env.SLACK_ALLOWED_USER_IDS).find(id => auth.principalId === `slack:${env.SLACK_TEAM_ID}:${id}`);
  return userId ? { teamId: env.SLACK_TEAM_ID, channelId, userId } : null;
}
