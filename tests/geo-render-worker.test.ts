import { describe, expect, it } from "vitest";
import { readSnapshotInput } from "../src/render/worker.js";

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield new TextEncoder().encode(value);
}

describe("Playwright worker input bounds", () => {
  it("accepts JSON split over multiple input chunks", async () => {
    const input = await readSnapshotInput(chunks('{"snapshot":', '{"format":"gtm-geo-snapshot-v1"}}'));
    expect(input.snapshot.format).toBe("gtm-geo-snapshot-v1");
  });

  it("rejects oversized input before parsing", async () => {
    async function* huge() { yield new Uint8Array(40 * 1024 * 1024 + 1); }
    await expect(readSnapshotInput(huge())).rejects.toThrow("40 MiB");
  });

  it("rejects malformed JSON", async () => {
    await expect(readSnapshotInput(chunks("not JSON"))).rejects.toThrow();
  });
});
