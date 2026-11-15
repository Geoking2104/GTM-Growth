// Admission is checked again by every tool and by the GTM bridge.
import { connectSlackCredentials } from "@vercel/connect/eve";
import { defaultSlackAuth, slackChannel } from "eve/channels/slack";
import { slackIdentity } from "../lib/access.ts";
export default slackChannel({
  credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/gtm-growth"),
  onAppMention(ctx, message) {
    const auth = defaultSlackAuth(message, ctx); return slackIdentity(auth) ? { auth } : null;
  },
  onDirectMessage(ctx, message) {
    const auth = defaultSlackAuth(message, ctx); return slackIdentity(auth) ? { auth } : null;
  },
  onAnswers(ctx) { return slackIdentity(ctx.defaultAuth) ? { auth: ctx.defaultAuth } : null; },
});
