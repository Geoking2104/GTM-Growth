import { describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_MAX_URLS,
  explainStatus,
  generateKey,
  keyMaterial,
  submitUrls,
  validateSubmission,
  verifyKeyFile,
  IndexNowError,
  KEY_PATTERN,
} from "../src/indexnow/client.js";

describe("IndexNow key", () => {
  it("generates a key inside the protocol grammar", () => {
    const key = generateKey(() => "123e4567-e89b-12d3-a456-426614174000");
    expect(key).toBe("123e4567e89b12d3a456426614174000");
    expect(KEY_PATTERN.test(key)).toBe(true);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it("rejects a key outside the grammar", () => {
    expect(() => keyMaterial("short", "example.com")).toThrow(IndexNowError);
    expect(() => keyMaterial("bad key with spaces", "example.com")).toThrow(/invalid key/);
  });

  it("builds the file name, URL and content the protocol expects", () => {
    const material = keyMaterial("abcd1234efgh5678", "https://www.Example.com/");
    expect(material.fileName).toBe("abcd1234efgh5678.txt");
    expect(material.fileUrl).toBe("https://www.example.com/abcd1234efgh5678.txt");
    expect(material.content).toBe("abcd1234efgh5678\n");
    expect(material.headers["Content-Type"]).toContain("text/plain");
  });
});

describe("IndexNow verification", () => {
  const fetchReturning = (status: number, body: string) =>
    vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

  it("passes when the file contains the key", async () => {
    const result = await verifyKeyFile("abcd1234efgh5678", "example.com", {
      fetcher: fetchReturning(200, "abcd1234efgh5678\n"),
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("fails with the right fix when the file is a 404", async () => {
    const result = await verifyKeyFile("abcd1234efgh5678", "example.com", {
      fetcher: fetchReturning(404, "not found"),
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("404");
    expect(result.nextStep).toContain("Publish");
  });

  it("fails when the file contains something else", async () => {
    const result = await verifyKeyFile("abcd1234efgh5678", "example.com", {
      fetcher: fetchReturning(200, "<!doctype html><html>"),
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/HTML|not the key/);
  });

  it("fails when the file is empty", async () => {
    const result = await verifyKeyFile("abcd1234efgh5678", "example.com", {
      fetcher: fetchReturning(200, "   \n"),
    });
    expect(result.ok).toBe(false);
  });

  it("reports a network failure instead of throwing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const result = await verifyKeyFile("abcd1234efgh5678", "example.com", { fetcher: failing });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("could not be fetched");
  });
});

describe("IndexNow submission", () => {
  it("requires confirm=true before any network call", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      submitUrls({ host: "example.com", key: "abcd1234efgh5678", urls: ["https://example.com/a"], confirm: false }, { fetcher }),
    ).rejects.toThrow(/confirm=true/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects URLs that do not belong to the host", () => {
    const problems = validateSubmission({
      host: "example.com",
      key: "abcd1234efgh5678",
      urls: ["https://other.com/page"],
    });
    expect(problems.join(" ")).toContain("not on example.com");
  });

  it("rejects more than 10 000 URLs", () => {
    const urls = Array.from({ length: INDEXNOW_MAX_URLS + 1 }, (_, index) => `https://example.com/${index}`);
    const problems = validateSubmission({ host: "example.com", key: "abcd1234efgh5678", urls });
    expect(problems.join(" ")).toContain("10000");
  });

  it("posts the documented JSON body and maps a 200", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        host: "example.com",
        key: "abcd1234efgh5678",
        urlList: ["https://example.com/a", "https://example.com/b"],
      });
      expect(init.method).toBe("POST");
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await submitUrls(
      { host: "example.com", key: "abcd1234efgh5678", urls: ["https://example.com/a", "https://example.com/b"], confirm: true },
      { fetcher },
    );
    expect(result.status).toBe(200);
    expect(result.outcome).toBe("accepted");
    expect(result.submitted).toBe(true);
  });

  it("sends keyLocation when the key lives outside the root", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.keyLocation).toBe("https://example.com/keys/abcd1234efgh5678.txt");
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    await submitUrls(
      {
        host: "example.com",
        key: "abcd1234efgh5678",
        urls: ["https://example.com/a"],
        keyLocation: "https://example.com/keys/abcd1234efgh5678.txt",
        confirm: true,
      },
      { fetcher },
    );
  });

  it("treats 403 as a key-file problem, not a network fluke", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const result = await submitUrls(
      { host: "example.com", key: "abcd1234efgh5678", urls: ["https://example.com/a"], confirm: true },
      { fetcher },
    );
    expect(result.submitted).toBe(false);
    expect(result.outcome).toBe("key-not-valid");
    expect(result.fix).toContain("key");
  });
});

describe("status explanations", () => {
  it("covers every documented code", () => {
    for (const status of [200, 202, 400, 403, 422, 429]) {
      const explained = explainStatus(status);
      expect(explained.meaning.length).toBeGreaterThan(10);
      expect(explained.outcome).toBeTruthy();
    }
  });

  it("never claims indexing on 200", () => {
    expect(explainStatus(200).meaning).toContain("not indexing");
  });

  it("explains 202 as asynchronous validation", () => {
    expect(explainStatus(202).outcome).toBe("pending-key-validation");
  });
});
