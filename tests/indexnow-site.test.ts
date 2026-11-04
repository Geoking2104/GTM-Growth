import { describe, expect, it } from "vitest";
import { curlCommand, keyFile, makeKey, normalizeHost, submitPayload } from "../site/indexnow.js";

describe("browser key generator", () => {
  it("produces a key inside the protocol grammar", () => {
    for (let i = 0; i < 20; i += 1) {
      const key = makeKey();
      expect(key).toMatch(/^[A-Za-z0-9-]{8,128}$/);
      expect(key).toHaveLength(32);
    }
  });

  it("produces a different key each time", () => {
    const keys = new Set(Array.from({ length: 10 }, () => makeKey()));
    expect(keys.size).toBe(10);
  });

  it("normalises whatever the visitor typed into a host", () => {
    expect(normalizeHost("https://www.Example.com/path?x=1")).toBe("www.example.com");
    expect(normalizeHost("example.com")).toBe("example.com");
    expect(normalizeHost("  https://example.com/  ")).toBe("example.com");
    expect(normalizeHost("")).toBe("");
  });

  it("names the file and the URL the protocol expects", () => {
    const material = keyFile("abcd1234efgh5678", "example.com");
    expect(material.name).toBe("abcd1234efgh5678.txt");
    expect(material.url).toBe("https://example.com/abcd1234efgh5678.txt");
    expect(material.content).toBe("abcd1234efgh5678\n");
  });

  it("falls back to a bare file name when the host is empty", () => {
    expect(keyFile("abcd1234efgh5678", "").url).toBe("abcd1234efgh5678.txt");
  });

  it("builds a POST payload with host, key and urlList", () => {
    const payload = JSON.parse(submitPayload("example.com", "abcd1234efgh5678"));
    expect(payload.host).toBe("example.com");
    expect(payload.key).toBe("abcd1234efgh5678");
    expect(Array.isArray(payload.urlList)).toBe(true);
    expect(payload.urlList[0]).toContain("example.com");
  });

  it("prints a curl command that targets the shared endpoint", () => {
    const command = curlCommand("example.com", "abcd1234efgh5678");
    expect(command).toContain("https://api.indexnow.org/indexnow");
    expect(command).toContain("Content-Type: application/json");
    expect(command).toContain("abcd1234efgh5678");
  });
});
