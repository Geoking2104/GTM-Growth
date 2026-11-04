import type { TokenClaims } from "./auth.js";

export type Body = Record<string, unknown>;
export type Handler = (ctx: { url: string; body: Body; user?: TokenClaims }) => Promise<unknown>;
export interface ConsoleRoute { path: string; handler: Handler; needsUrl?: boolean; }

export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
export const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : v === undefined || v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d;
};
