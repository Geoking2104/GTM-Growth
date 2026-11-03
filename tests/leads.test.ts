import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendLead, normalizeWebsite, readLeads, validateLead } from "../src/leads/store.js";

const valid = {
  name: "Geoff",
  email: "geoff@example.com",
  website: "example.com",
  goal: "Full GEO audit",
  source: "landing",
  elapsedMs: 5000,
};

describe("lead capture", () => {
  it("accepts a normal submission and normalises the website", () => {
    const result = validateLead({ ...valid, website: "https://example.com/path?utm_source=x#top" });
    expect(result.ok).toBe(true);
    expect(result.lead?.website).toBe("https://example.com/path");
    expect(result.lead?.email).toBe("geoff@example.com");
    expect(result.lead?.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("adds https to a bare domain", () => {
    expect(normalizeWebsite("acme.fr")).toBe("https://acme.fr/");
  });

  it("rejects an invalid email", () => {
    const result = validateLead({ ...valid, email: "not-an-email" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("email");
  });

  it("rejects a missing name or website", () => {
    expect(validateLead({ ...valid, name: "" }).errors).toContain("name");
    expect(validateLead({ ...valid, website: "  " }).errors).toContain("website");
  });

  it("drops an unknown goal to the safe default", () => {
    const result = validateLead({ ...valid, goal: "<script>alert(1)</script>" });
    expect(result.ok).toBe(true);
    expect(result.lead?.goal).toBe("Not sure yet");
  });

  it("accepts a French goal", () => {
    const result = validateLead({ ...valid, goal: "Audit GEO complet" });
    expect(result.lead?.goal).toBe("Audit GEO complet");
  });

  it("silently rejects a filled honeypot", () => {
    const result = validateLead({ ...valid, company: "ACME Corp" });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["rejected"]);
  });

  it("rejects an instant post", () => {
    const result = validateLead({ ...valid, elapsedMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["rejected"]);
  });

  it("appends leads as JSON lines and reads them back", () => {
    const file = path.join(os.tmpdir(), `leads-${Date.now()}.jsonl`);
    const lead = validateLead(valid).lead!;
    appendLead(lead, file);
    appendLead({ ...lead, id: "second", email: "second@example.com" }, file);
    const rows = readLeads(file);
    expect(rows).toHaveLength(2);
    expect(rows[1].email).toBe("second@example.com");
    expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
    fs.unlinkSync(file);
  });

  it("returns an empty list for a missing file", () => {
    expect(readLeads(path.join(os.tmpdir(), "does-not-exist.jsonl"))).toEqual([]);
  });
});
