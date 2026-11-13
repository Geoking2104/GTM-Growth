import { eveChannel } from "eve/channels/eve";
// Slack-only deployment. No anonymous/operator HTTP session can query customer data.
export default eveChannel({ auth: () => null });
