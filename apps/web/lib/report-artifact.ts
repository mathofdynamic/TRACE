import {
  artifactMetadataSchema,
  parseArtifact,
  reportEvidenceLocator,
  type ArtifactMetadata,
  type EngineeringReport,
} from '@trace/schema';

function documentFromMetadata(metadata: ArtifactMetadata) {
  const markers = metadata.evidence.filter((e) => e.locator === reportEvidenceLocator);
  if (markers.length !== 1) return undefined;
  // artifactMetadataSchema validates this exact document and its period/type
  // relationship in superRefine; no second validation/copy is needed.
  return markers[0]?.metadata?.document as EngineeringReport | undefined;
}

// Sync validates and persists this JSON alongside the canonical artifact.
// Reads retain the same schema checks without reparsing large YAML documents
// on every dashboard request. The original content remains available as provenance.
export function readEngineeringReportMetadata(metadata: unknown) {
  const result = artifactMetadataSchema.safeParse(metadata);
  return result.success ? documentFromMetadata(result.data) : undefined;
}

export function readEngineeringReport(content: string) {
  try {
    const artifact = parseArtifact(content);
    return documentFromMetadata(artifact.metadata);
  } catch {
    return undefined;
  }
}
