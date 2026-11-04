import type { TokenClaims } from "./auth.js";
import type { TenantContext } from "../tenants/context.js";

export type Body = Record<string, unknown>;
export interface HandlerContext { url: string; body: Body; user?: TokenClaims; tenancy?: TenantContext; }
export type Handler = (ctx: HandlerContext) => Promise<unknown>;
export interface ConsoleRoute {
  path: string;
  handler: Handler;
  needsUrl?: boolean;
  /** Restrict to tenant administrators (and the platform super-admin). */
  adminOnly?: boolean;
}

export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
export const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : v === undefined || v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d;
};
