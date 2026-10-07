import { artifactMetadataSchema } from '@trace/schema';
import type { DashboardChange } from './dashboard';

export function prBriefChange(
  artifact: { id: string; repositoryId: string; metadata: unknown; generatedAt: Date },
  repositoryName: string,
): DashboardChange | undefined {
  const parsed = artifactMetadataSchema.safeParse(artifact.metadata);
  if (!parsed.success || parsed.data.artifact_type !== 'pr_brief') return;
  const d = parsed.data.dashboard;
  const p = d?.pull_request;
  if (
    !d ||
    !p ||
    parsed.data.sync_policy === 'local_only' ||
    `${p.owner}/${p.repository}`.toLowerCase() !== repositoryName.toLowerCase()
  )
    return;
  return {
    source: 'local-brief',
    id: artifact.id,
    repositoryId: artifact.repositoryId,
    repositoryName,
    number: p.number,
    title: d.title,
    state: 'local draft',
    url: null,
    authorLogin: null,
    updatedAt: artifact.generatedAt.toISOString(),
    branch: d.branch ?? null,
    headSha: d.head_commit ?? null,
    intent: d.summary,
  };
}
