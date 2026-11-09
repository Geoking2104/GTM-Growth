import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ApplyRegistry } from "../src/apply/registry.js";
import { applyPrincipalFromSession, type ApplyPrincipal } from "../src/apply/principal.js";
import { createFileApplyPreview } from "../src/apply/preview.js";
import { decodeApplyKey, openText, sealText, SNAPSHOT_LIMIT_BYTES } from "../src/apply/sealed-payload.js";
import type { TenantContext } from "../src/tenants/context.js";
import type { TokenClaims } from "../src/console/auth.js";

const now = new Date("2026-11-09T12:00:00Z");
const before = "User-agent: *\nAllow: /\n# PRIVATE_TEST_MARKER_SHOULD_NOT_BE_ON_DISK\n";
const after = `${before}User-agent: OAI-SearchBot\nAllow: /\n`;
const reader: ApplyPrincipal = { tenantId: "acme", actorId: "oidc-reader", role: "reader" };
const approver: ApplyPrincipal = { tenantId: "acme", actorId: "oidc-approver", role: "approver" };
const other: ApplyPrincipal = { tenantId: "other", actorId: "oidc-other", role: "admin" };
const registries: ApplyRegistry[] = [];
afterEach(() => { for (const registry of registries.splice(0)) registry.close(); });

function createFixture(retentionDays = 30) {
  const file = join(mkdtempSync(join(tmpdir(), "apply-registry-")), "apply.sqlite3");
  const key = randomBytes(32);
  const grant = { hostname: "example.com", status: "verified" as const,
    verifiedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" };
  const lookup = { activeGrant: vi.fn((tenantId: string, hostname: string, _at: Date) =>
    tenantId === "acme" && hostname === "example.com" ? grant : undefined) };
  const registry = new ApplyRegistry(file, key, lookup, retentionDays);
  registries.push(registry);
  const preview = createFileApplyPreview({ tenantId: "acme", fixId: "robots-ai", kind: "robots",
    siteUrl: "https://example.com", sourceUrl: "https://example.com/robots.txt",
    observedStatus: 200, before, after, now });
  return { file, key, lookup, registry, preview };
}

describe("Apply Mode sealed payloads and operator key", () => {
  it("requires a canonical 32-byte key, with no weak default", () => {
    const key = randomBytes(32);
    expect(decodeApplyKey(key.toString("base64"))).toEqual(key);
    expect(() => decodeApplyKey(undefined)).toThrow("APPLY_DATA_KEY_B64");
    expect(() => decodeApplyKey("incorrect")).toThrow("APPLY_DATA_KEY_B64");
    expect(() => new ApplyRegistry("unused.sqlite", Buffer.alloc(16), { activeGrant: () => undefined }))
      .toThrow("32-byte key");
  });

  it("authenticates ciphertext, tenant context, digest and length", () => {
    const key = randomBytes(32);
    const sealed = sealText(key, "proposal:v1:acme:id", "confidential-content");
    expect(openText(key, "proposal:v1:acme:id", sealed)).toBe("confidential-content");
    expect(sealed.ciphertext.includes(Buffer.from("confidential-content"))).toBe(false);
    expect(() => openText(key, "proposal:v1:other:id", sealed)).toThrow("authentication failed");
    expect(() => openText(randomBytes(32), "proposal:v1:acme:id", sealed)).toThrow("authentication failed");
    expect(() => openText(key, "proposal:v1:acme:id", { ...sealed, tag: Buffer.alloc(16) }))
      .toThrow("authentication failed");
    expect(() => sealText(key, "backup:v1", "x".repeat(SNAPSHOT_LIMIT_BYTES + 1), SNAPSHOT_LIMIT_BYTES))
      .toThrow("oversized");
  });
});

describe("Apply Mode SQLite registry", () => {
  it("encrypts the proposal, records one idempotent event and never exposes other tenants", () => {
    const { file, registry, preview } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    expect(registry.recordPreview(reader, preview, now)).toBe(id);
    expect(registry.state(reader, id)).toBe("previewed");
    expect(registry.readPreview(reader, id)).toEqual(preview);
    expect(registry.readPreview(other, id)).toBeNull();
    expect(registry.state(other, id)).toBeNull();
    expect(registry.auditEvents(approver).map(e => e.action)).toEqual(["preview_recorded"]);
    expect(registry.auditEvents(other)).toHaveLength(0);
    expect(registry.verifyJournal("acme")).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file).includes(Buffer.from("PRIVATE_TEST_MARKER_SHOULD_NOT_BE_ON_DISK"))).toBe(false);
  });

  it("requires a server-scoped exact verified grant, approver role, reviewed diff and consent", () => {
    const { registry, preview, lookup } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    const approveAt = new Date(now.getTime() + 30_000);
    expect(() => registry.approve(reader, id, preview.diffSha256, true, approveAt)).toThrow("approver");
    expect(() => registry.approve(approver, id, preview.diffSha256, false, approveAt)).toThrow("Explicit");
    expect(() => registry.approve(approver, id, "0".repeat(64), true, approveAt)).toThrow("diff differs");
    expect(() => registry.approve(other, id, preview.diffSha256, true, approveAt)).toThrow("No pending");
    expect(registry.auditEvents(approver)).toHaveLength(1);
    const approval = registry.approve(approver, id, preview.diffSha256, true, approveAt);
    expect(lookup.activeGrant).toHaveBeenCalledWith("acme", "example.com", approveAt);
    expect(approval).toMatchObject({ confirmed: true, actorId: "oidc-approver", consumedAt: null });
    expect(registry.trustedApproval(approver, id)).toEqual(approval);
    expect(registry.state(approver, id)).toBe("approved");
    expect(() => registry.approve(approver, id, preview.diffSha256, true, approveAt)).toThrow("No pending");
    expect(registry.auditEvents(approver).map(e => e.action)).toEqual(["preview_recorded", "approval_recorded"]);
  });

  it("refuses revoked, wrong-domain and expired grants or conflicted previews", () => {
    const { registry, preview, lookup } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    lookup.activeGrant.mockReturnValueOnce(undefined);
    expect(() => registry.approve(approver, id, preview.diffSha256, true, new Date(now.getTime() + 1000)))
      .toThrow("domain verification grant");
    lookup.activeGrant.mockReturnValueOnce({ hostname: "other.com", status: "verified",
      verifiedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" });
    expect(() => registry.approve(approver, id, preview.diffSha256, true, new Date(now.getTime() + 2000)))
      .toThrow("exact verified");
    expect(() => registry.approve(approver, id, preview.diffSha256, true, new Date(now.getTime() + 20 * 60_000)))
      .toThrow("expired");
    const conflict = createFileApplyPreview({ tenantId: "acme", fixId: "robots-ai", kind: "robots",
      siteUrl: "https://example.com", sourceUrl: "https://example.com/robots.txt", observedStatus: 200,
      before, after, manualReview: ["Owner blocked crawler"], now });
    registry.recordPreview(reader, conflict, now);
    expect(() => registry.approve(approver, conflict.proposalId, conflict.diffSha256, true,
      new Date(now.getTime() + 3000))).toThrow("conflicted");
  });

  it("backs up only the exact observed bytes, encrypts them and supports scoped restore", () => {
    const { registry, file, preview } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    const approvedAt = new Date(now.getTime() + 30_000);
    registry.approve(approver, id, preview.diffSha256, true, approvedAt);
    expect(() => registry.backup(approver, id, "changed content", approvedAt)).toThrow("drifted");
    const backupAt = new Date(now.getTime() + 60_000);
    expect(registry.backup(approver, id, before, backupAt)).toMatch(/^[0-9a-f-]{36}$/);
    expect(registry.state(approver, id)).toBe("backed_up");
    expect(registry.readBackup(approver, id, backupAt)).toBe(before);
    expect(() => registry.readBackup(reader, id, backupAt)).toThrow("approver");
    expect(() => registry.readBackup(other, id, backupAt)).toThrow("absent");
    expect(() => registry.backup(approver, id, before, backupAt)).toThrow("unexpired trusted approval");
    expect(readFileSync(file).includes(Buffer.from("PRIVATE_TEST_MARKER_SHOULD_NOT_BE_ON_DISK"))).toBe(false);
    expect(registry.auditEvents(approver).map(e => e.action))
      .toEqual(["preview_recorded", "approval_recorded", "snapshot_encrypted"]);
  });

  it("revokes a pending approved proposal and preserves the proof of the revocation", () => {
    const { registry, preview } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    const at = new Date(now.getTime() + 30_000);
    registry.approve(approver, id, preview.diffSha256, true, at);
    registry.revokeApproval(approver, id, new Date(now.getTime() + 60_000));
    expect(registry.trustedApproval(approver, id)).toBeNull();
    expect(registry.state(approver, id)).toBe("failed");
    expect(registry.auditEvents(approver).at(-1)?.action).toBe("approval_revoked");
    expect(registry.verifyJournal("acme")).toBe(true);
    expect(() => registry.backup(approver, id, before, at)).toThrow();
  });

  it("detects journal and ciphertext tampering without leaking plaintext", () => {
    const { registry, file, preview } = createFixture();
    const id = registry.recordPreview(reader, preview, now);
    registry.approve(approver, id, preview.diffSha256, true, new Date(now.getTime() + 30_000));
    registry.backup(approver, id, before, new Date(now.getTime() + 60_000));
    const db = new Database(file);
    db.prepare("UPDATE apply_snapshots SET ciphertext=zeroblob(length(ciphertext)) WHERE proposal_id=?").run(id);
    db.close();
    expect(() => registry.readBackup(approver, id, new Date(now.getTime() + 60_000)))
      .toThrow("authentication failed");
    const db2 = new Database(file);
    db2.prepare("UPDATE apply_audit_events SET action='tampered' WHERE proposal_id=? AND action='approval_recorded'").run(id);
    db2.close();
    expect(registry.verifyJournal("acme")).toBe(false);
    expect(() => registry.auditEvents(approver)).toThrow("audit journal authentication failed");
  });

  it("purges expired encrypted backup and proposal payloads while retaining audit metadata", () => {
    const { registry, preview } = createFixture(1);
    const id = registry.recordPreview(reader, preview, now);
    registry.approve(approver, id, preview.diffSha256, true, new Date(now.getTime() + 30_000));
    registry.backup(approver, id, before, new Date(now.getTime() + 60_000));
    const later = new Date(now.getTime() + 2 * 24 * 60 * 60_000);
    expect(registry.pruneExpiredPayloads("acme", later)).toEqual({ snapshots: 1, previews: 1 });
    expect(registry.pruneExpiredPayloads("acme", later)).toEqual({ snapshots: 0, previews: 0 });
    expect(registry.readPreview(reader, id)).toBeNull();
    expect(() => registry.readBackup(approver, id, later)).toThrow("past retention");
    expect(registry.state(approver, id)).toBe("backed_up");
    expect(registry.auditEvents(approver).map(e => e.action).slice(-2))
      .toEqual(["snapshot_expired", "preview_redacted"]);
    expect(registry.verifyJournal("acme")).toBe(true);
  });
});

describe("Apply Mode role mapping from trusted Keycloak context", () => {
  const tenancy = { tenant: { id: "acme", mode: "organization", status: "active" },
    role: "tenant-user", platformAdmin: false } as TenantContext;
  const claims = { sub: "oidc-reader", groups: ["/tenants/acme/tenant-user"] };

  it("keeps tenant users read-only and recognizes only exact scoped Apply groups", () => {
    expect(applyPrincipalFromSession(claims, tenancy).role).toBe("reader");
    expect(applyPrincipalFromSession({ ...claims,
      groups: [...claims.groups, "/tenants/other/apply-approver"] }, tenancy).role).toBe("reader");
    expect(applyPrincipalFromSession({ ...claims,
      groups: [...claims.groups, "/tenants/acme/apply-editor"] }, tenancy).role).toBe("editor");
    expect(applyPrincipalFromSession({ ...claims,
      groups: [...claims.groups, "/tenants/acme/apply-approver"] }, tenancy).role).toBe("approver");
  });

  it("maps existing tenant admins and selected platform admins to admin", () => {
    expect(applyPrincipalFromSession(claims, { ...tenancy, role: "tenant-admin" }).role).toBe("admin");
    expect(applyPrincipalFromSession(claims, { ...tenancy, role: "platform-admin", platformAdmin: true }).role)
      .toBe("admin");
  });

  it("supports a dedicated realm role only in a resolved realm tenant", () => {
    const realm = { ...tenancy, tenant: { ...tenancy.tenant!, mode: "realm" } } as TenantContext;
    const user = { ...claims, realm_access: { roles: ["apply-approver"] } } as TokenClaims;
    expect(applyPrincipalFromSession(user, realm).role).toBe("approver");
    expect(applyPrincipalFromSession(user, tenancy).role).toBe("reader");
    expect(() => applyPrincipalFromSession(user, { ...tenancy, tenant: null })).toThrow("authenticated");
  });
});
