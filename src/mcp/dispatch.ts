import { withCredential } from "../auth/service-account.js";
import { handleToolCall } from "../tools/index.js";
import { assertTenantScope, currentMcpAuth, runWithMcpAuth } from "./context.js";

export async function dispatchMcpTool(name: string, args: Record<string, unknown>) {
  const ctx = currentMcpAuth();
  if (ctx) assertTenantScope(ctx, args ?? {});
  const run = () => handleToolCall(name, args ?? {});
  if (ctx?.mode === "oauth") return withCredential(ctx.tenant?.googleCredential, run);
  return run();
}

export function withRequestAuth<T>(ctx: ReturnType<typeof currentMcpAuth>, fn: () => T): T {
  return ctx ? runWithMcpAuth(ctx, fn) : fn();
}
