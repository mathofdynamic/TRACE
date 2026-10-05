import { engineeringReportSchema, parseArtifact, reportEvidenceLocator } from '@trace/schema';

export function readEngineeringReport(content: string) {
  try {
    const artifact = parseArtifact(content);
    const markers = artifact.metadata.evidence.filter((e) => e.locator === reportEvidenceLocator);
    if (markers.length !== 1) return undefined;
    const result = engineeringReportSchema.safeParse(markers[0]?.metadata?.document);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
