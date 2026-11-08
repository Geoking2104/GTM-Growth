/** One-shot offline renderer. Run only inside the networkless geo-render container. */
import { chromium } from "playwright-core";
import { renderOfflineSnapshot } from "./offline.js";
import { verifySnapshotEnvelope } from "../geo/proof/snapshot.js";
import type { SnapshotEnvelope } from "../geo/proof/snapshot.js";

const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export async function readSnapshotInput(input: AsyncIterable<Uint8Array>): Promise<SnapshotEnvelope> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of input) {
    size += chunk.byteLength;
    if (size > MAX_INPUT_BYTES) throw new Error("Snapshot input exceeds 40 MiB");
    chunks.push(chunk);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(data)) as SnapshotEnvelope;
}

export async function main(): Promise<void> {
  const envelope = await readSnapshotInput(process.stdin);
  await verifySnapshotEnvelope(envelope);
  // Never disable the Chromium sandbox for convenience. Failure is explicit.
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const evidence = await renderOfflineSnapshot(envelope, browser);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Render failed"}\n`);
    process.exitCode = 1;
  });
}
