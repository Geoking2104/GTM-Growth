import { HtmlDoc } from "../../geo/html.js";
import { canonicalJson, sha256 } from "./calculate.js";
import { verifySnapshotEnvelope } from "../../geo/proof/snapshot.js";
import type { SnapshotEnvelope } from "../../geo/proof/snapshot.js";
import type { RenderEvidence } from "../../render/offline.js";
import type { CoverageObservation } from "./coverage.js";

const normalize = (html: string): string =>
  HtmlDoc.parse(html).bodyText().replace(/\s+/g, " ").trim();

const unknown = (id: string, reason: string): CoverageObservation =>
  ({ controlId: id, status: "unknown", reason });

/**
 * Convert an ALREADY-CAPTURED offline Playwright result into v2 evidence.
 * This function never launches a browser and performs no network access.
 *
 * The caller must independently enforce verified-domain authorization and
 * renderer isolation. A user-supplied RenderEvidence is not a trusted grant.
 */
export async function mapOfflineRenderingToV2(
  envelope: SnapshotEnvelope,
  evidence: RenderEvidence,
): Promise<CoverageObservation[]> {
  await verifySnapshotEnvelope(envelope);
  if (evidence.snapshotHash !== envelope.snapshotHash) {
    throw new Error("Render evidence snapshot hash mismatch");
  }
  const source = envelope.snapshot.resources[0]?.response;
  const ids = ["P01", "P02", "P03", "P04"];
  if (!source || (source.status !== 200 && source.status !== 203)) {
    return ids.map(id => unknown(id, "Initial page response unavailable"));
  }
  if (evidence.status !== "measured" || !evidence.renderedHtml || !evidence.renderedHtmlHash) {
    return ids.map(id => unknown(id, `Playwright render incomplete: ${evidence.reason ?? evidence.status}`));
  }
  const actualHash = await sha256(canonicalJson(evidence.renderedHtml));
  if (actualHash !== evidence.renderedHtmlHash) {
    throw new Error("Rendered HTML hash mismatch");
  }
  const before = normalize(source.body);
  const after = normalize(evidence.renderedHtml);
  if (before.length !== evidence.initialTextLength || after.length !== evidence.renderedTextLength) {
    throw new Error("Render evidence text lengths mismatch");
  }
  if (evidence.blockedRequests.length > 0) {
    return ids.map(id => unknown(id, "Blocked subresources prevent definitive rendering comparison"));
  }

  const prefix: CoverageObservation[] = [];
  const proof = (value: string): CoverageObservation["proof"] => ({
    type: "extract", url: envelope.snapshot.url, value,
  });
  // P01: only strict positive parity or a proven client-only empty initial
  // body is decisive. Other differences cannot prove "essential" content.
  if (before && before === after) {
    prefix.push({ controlId: "P01", status: "measured", earned: 4,
      proof: proof(`Initial and rendered body text identical (${before.length} chars); DOM hash ${actualHash}`) });
  } else if (!before && after) {
    prefix.push({ controlId: "P01", status: "measured", earned: 0,
      proof: proof(`Client-only page: initial body 0 chars, rendered body ${after.length} chars`) });
  } else {
    prefix.push(unknown("P01", "Partial initial content requires a semantic essential-content comparison"));
  }

  // P02 is a strict DOM/HTML text parity check; a measured difference is a
  // discrepancy, not an assumed crawler block.
  prefix.push({
    controlId: "P02", status: "measured",
    earned: before === after && Boolean(after) ? 3 : 0,
    proof: proof(`Initial text ${before.length} chars; rendered text ${after.length} chars; exact parity ${before === after}`),
  });

  // Offline replay does not test a real search crawler identity, JS console,
  // or long-term timing stability; those require independent instruments.
  prefix.push(unknown("P03", "Offline replay does not establish live crawler accessibility"));
  prefix.push(unknown("P04", "No validated console-error and timing observations"));
  return prefix;
}
