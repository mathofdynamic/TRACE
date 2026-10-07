import { describe, expect, it } from 'vitest';
import { prBriefSummary, prBriefTitle } from '@trace/schema';
import { prBriefChange } from './pr-brief-change';
const pr = {
  number: 7,
  provider: 'github' as const,
  owner: 'example',
  repository: 'project',
  change_scope: 'working_tree' as const,
  changed_files: 0,
  findings: 0,
  material_findings: 0,
  input: {
    branch: 'main',
    head_commit: 'a'.repeat(40),
    working_tree: 'clean' as const,
    stable: true,
  },
};
const metadata = {
  schema_version: '0.1',
  id: 'pr-github-7',
  artifact_type: 'pr_brief',
  repository: { provider: 'github', owner: 'example', name: 'project' },
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
  generator: 'trace-cli/0.2.0',
  execution_origin: 'local',
  source_refs: [{ type: 'commit', locator: pr.input.head_commit }],
  evidence: [{ type: 'check', locator: 'trace:pr-brief-input:v1', metadata: pr.input }],
  review_status: 'draft',
  sensitivity: 'internal',
  sync_policy: 'repository_authoritative',
  dashboard: {
    title: prBriefTitle(pr),
    summary: prBriefSummary(pr),
    branch: 'main',
    head_commit: pr.input.head_commit,
    status: 'draft',
    items: [],
    pull_request: pr,
  },
};
const row = {
  id: 'fixture',
  repositoryId: 'repo',
  metadata,
  generatedAt: new Date(metadata.created_at),
};
describe('source-free PR brief changes', () => {
  it('renders a local draft with known summary, without pretending it is a GitHub webhook snapshot', () => {
    expect(prBriefChange(row, 'example/project')).toMatchObject({
      source: 'local-brief',
      number: 7,
      state: 'local draft',
      url: null,
      authorLogin: null,
      title: 'PR #7 — Local review brief',
    });
  });
  it('fails closed for malformed, unsafe or local-only projections', () => {
    expect(
      prBriefChange(
        { ...row, metadata: { ...metadata, sync_policy: 'local_only' } },
        'example/project',
      ),
    ).toBeUndefined();
    expect(
      prBriefChange(
        {
          ...row,
          metadata: {
            ...metadata,
            dashboard: { ...metadata.dashboard, title: '<script>bad</script>' },
          },
        },
        'example/project',
      ),
    ).toBeUndefined();
  });
});
