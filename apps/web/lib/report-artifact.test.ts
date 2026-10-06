import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  serializeArtifact,
  engineeringReportSchema,
  reportSectionIds,
  type EngineeringReport,
} from '@trace/schema';
import { readEngineeringReport, readEngineeringReportMetadata } from './report-artifact';
import { ReportDetailView } from '../app/(app)/app/_components/report-detail-view';
import type { DashboardSyncedRecord } from './dashboard';

const serialize = (artifact: {
  metadata: Parameters<typeof serializeArtifact>[0];
  markdown: string;
}) => serializeArtifact(artifact.metadata, artifact.markdown);

const document: EngineeringReport = {
  version: 1,
  period: {
    kind: 'weekly',
    start: '2026-09-29T00:00:00.000Z',
    end: '2026-10-06T00:00:00.000Z',
    timeZone: 'UTC',
    asOf: '2026-10-05T12:00:00.000Z',
  },
  sources: [{ name: 'GitHub', status: 'not_available', detail: 'Not available — offline' }],
  sections: [
    {
      id: 'summary',
      title: 'Executive summary',
      summary: '2 commits · Not available PRs merged',
      items: [
        {
          title: 'Verified engineering change',
          url: 'https://github.com/a/b/commit/abcdef1',
          evidence: ['commit:abcdef1'],
        },
      ],
    },
  ],
};
document.sections.push(
  ...reportSectionIds
    .filter((id) => id !== 'summary')
    .map((id) => ({ id, title: id, summary: 'Not available', items: [] })),
);
const metadata = {
  schema_version: '0.1' as const,
  id: 'weekly-2026-10-05',
  artifact_type: 'weekly_report' as const,
  repository: { provider: 'github', owner: 'a', name: 'b' },
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
  generator: 'trace-cli/0.1',
  execution_origin: 'local' as const,
  source_refs: [],
  evidence: [
    { type: 'check' as const, locator: 'trace:engineering-report:v1', metadata: { document } },
  ],
  review_status: 'draft' as const,
  sensitivity: 'internal' as const,
  sync_policy: 'allowlisted' as const,
};

describe('engineering report artifact and reader', () => {
  it('round-trips the single validated document through the portable artifact', () => {
    const content = serialize({
      metadata,
      markdown: '# Weekly report\n\n## Executive summary\n\nHuman readable summary.',
    });
    expect(readEngineeringReport(content)).toEqual(document);
    expect(() =>
      serialize({
        metadata: { ...metadata, artifact_type: 'daily_report' },
        markdown: 'wrong period',
      }),
    ).toThrow();
    expect(() =>
      serialize({
        metadata: { ...metadata, evidence: [...metadata.evidence, ...metadata.evidence] },
        markdown: 'duplicate',
      }),
    ).toThrow();
  });
  it('reads the identical report from persisted metadata without YAML content', () => {
    expect(readEngineeringReportMetadata(metadata)).toEqual(document);
  });
  it('keeps metadata-only reads fail-closed for duplicate, mismatched or unsafe documents', () => {
    expect(
      readEngineeringReportMetadata({
        ...metadata,
        evidence: [...metadata.evidence, ...metadata.evidence],
      }),
    ).toBeUndefined();
    expect(
      readEngineeringReportMetadata({ ...metadata, artifact_type: 'daily_report' }),
    ).toBeUndefined();
    expect(
      readEngineeringReportMetadata({
        ...metadata,
        evidence: [
          {
            ...metadata.evidence[0],
            metadata: { document: { ...document, debug: 'private source' } },
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      readEngineeringReportMetadata({
        ...metadata,
        evidence: [
          {
            ...metadata.evidence[0],
            metadata: {
              document: {
                ...document,
                sections: document.sections.map((section) => ({
                  ...section,
                  items: [
                    {
                      title: 'Unsafe link',
                      evidence: ['synthetic'],
                      url: 'https://private.example/source',
                    },
                  ],
                })),
              },
            },
          },
        ],
      }),
    ).toBeUndefined();
    expect(readEngineeringReportMetadata(null)).toBeUndefined();
  });
  it('handles period reports with 100 evidence items using the persisted JSON contract', () => {
    const large = {
      ...document,
      sections: document.sections.map((section) =>
        section.id === 'commits'
          ? {
              ...section,
              items: Array.from({ length: 100 }, (_, index) => ({
                title: `Verified synthetic commit ${index}`,
                evidence: [`commit:synthetic-${index}`],
                url: `https://github.com/a/b/commit/${index.toString(16).padStart(40, '0')}`,
              })),
            }
          : section,
      ),
    };
    const persisted = {
      ...metadata,
      evidence: [{ ...metadata.evidence[0], metadata: { document: large } }],
    };
    expect(readEngineeringReportMetadata(persisted)).toEqual(large);
  });
  it('rejects unknown fields, invalid boundaries and unsafe evidence links', () => {
    expect(engineeringReportSchema.safeParse({ ...document, debug: 'source' }).success).toBe(false);
    expect(
      engineeringReportSchema.safeParse({
        ...document,
        period: { ...document.period, end: document.period.start },
      }).success,
    ).toBe(false);
    expect(
      engineeringReportSchema.safeParse({
        ...document,
        sections: [
          {
            ...document.sections[0],
            items: [{ title: 'Unsafe', url: 'javascript:alert(1)', evidence: [] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('renders linked readable sections without YAML, artifact metadata, raw hashes or unrelated current PRs', () => {
    vi.stubGlobal('React', React);
    const content = serialize({
      metadata,
      markdown: '# Weekly report\n\nRaw metadata stays in provenance.',
    });
    const report: DashboardSyncedRecord = {
      id: 'runtime-id',
      artifactId: metadata.id,
      artifactType: 'weekly_report',
      repositoryId: 'r',
      repositoryName: 'a/b',
      title: 'Weekly report',
      summary: 'Verified period summary',
      status: 'completed',
      items: [],
      generatedAt: metadata.created_at,
      syncedAt: metadata.created_at,
      origin: 'local',
      content,
      path: 'reports/weekly/2026-10-05.md',
      freshness: 'current',
      analyzedCommit: 'a'.repeat(40),
      remoteHeadCommit: 'a'.repeat(40),
      engineeringReport: document,
    };
    const html = renderToStaticMarkup(
      React.createElement(ReportDetailView, { report, relatedChanges: [], relatedFindings: [] }),
    );
    expect(html).toContain('Executive summary');
    expect(html).toContain('Verified engineering change');
    expect(html).toContain('https://github.com/a/b/commit/abcdef1');
    expect(html).not.toContain('schema_version');
    expect(html).not.toContain('runtime-id');
    expect(html).not.toContain('a'.repeat(40));
    expect(html).not.toContain('trace:engineering-report:v1');
    expect(html).toContain('Not available');
    expect(html).toContain('Verification &amp; Provenance');
    const staleHtml = renderToStaticMarkup(
      React.createElement(ReportDetailView, {
        report: { ...report, freshness: 'needs-refresh' },
        relatedChanges: [],
        relatedFindings: [],
      }),
    );
    expect(staleHtml).toContain('trace report weekly --date 2026-10-05 --timezone UTC --yes');
    vi.unstubAllGlobals();
  });
  it('keeps legacy front matter out of the readable document', () => {
    vi.stubGlobal('React', React);
    const report: DashboardSyncedRecord = {
      id: 'r',
      artifactId: 'r',
      artifactType: 'daily_report',
      repositoryId: 'r',
      repositoryName: 'a/b',
      title: 'Daily report',
      summary: 'Legacy',
      status: 'completed',
      items: [],
      generatedAt: metadata.created_at,
      syncedAt: metadata.created_at,
      origin: 'local',
      content:
        '---\nschema_version: "0.1"\nchecksum: private-debug-value\n---\n# Daily report\n\n## Known\n\n- Verified readable fact.',
    };
    const html = renderToStaticMarkup(
      React.createElement(ReportDetailView, { report, relatedChanges: [], relatedFindings: [] }),
    );
    expect(html).toContain('Verified readable fact');
    expect(html).not.toContain('private-debug-value');
    expect(html).not.toContain('schema_version');
    vi.unstubAllGlobals();
  });
});
