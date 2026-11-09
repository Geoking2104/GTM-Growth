import { authorizeVerifiedAuditTarget } from "../../rendering/verified-domain.js";
import type { VerifiedDomainGrant } from "../../rendering/verified-domain.js";
import { replaySnapshot, verifySnapshotEnvelope } from "../../proof/snapshot.js";
import type { SnapshotEnvelope } from "../../proof/snapshot.js";
import { runGeoAudit } from "../../audit.js";
import type { RenderEvidence } from "../../../render/offline.js";
import { collectAutomaticV2 } from "./automatic.js";
import { mapOfflineRenderingToV2 } from "./render-evidence.js";
import type { V2CoverageScore } from "./coverage.js";

/**
 * Offline, same-snapshot GEO v2 replay that binds rendering proof to the
 * verified owner scope. This must be called only with a grant loaded from the
 * trusted registry and evidence emitted by the isolated worker.
 *
 * No live fetch, no Chromium launch, no deployment or job scheduling.
 */
export async function replayVerifiedV2Rendering(
  envelope: SnapshotEnvelope,
  renderEvidence: RenderEvidence,
  trustedGrant: VerifiedDomainGrant,
  now: Date = new Date(),
): Promise<V2CoverageScore> {
  authorizeVerifiedAuditTarget(envelope.snapshot.url, trustedGrant, now);
  await verifySnapshotEnvelope(envelope);
  const renderFindings = await mapOfflineRenderingToV2(envelope, renderEvidence);
  const fetcher = await replaySnapshot(envelope);
  const audit = await runGeoAudit({
    url: envelope.snapshot.url,
    fetcher,
  });
  // Reuse the exact source HTML authenticated by the snapshot envelope.
  // Never substitute renderer HTML for raw-document v2 evidence.
  const source = envelope.snapshot.resources[0]?.response;
  return collectAutomaticV2(audit, renderFindings, {
    ...(source && (source.status === 200 || source.status === 203) ? { pageHtml: source.body } : {}),
  });
}
