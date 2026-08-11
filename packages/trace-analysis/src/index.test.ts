import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeChanges,
  createPullRequestBrief,
  mergeManagedBrief,
  renderPullRequestBrief,
  selectPublishedFindings,
} from './index.js';

describe('TRACE analysis pipeline', () => {
  it('extracts TypeScript symbols and emits deterministic checks without a model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-analysis-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, 'src', 'feature.ts'),
      'export function ship(value: string) { return value.trim(); }\n',
    );
    const result = await analyzeChanges({
      root,
      changeSet: {
        repository: { provider: 'git', name: 'fixture', root },
        headRef: 'fixture-head',
        commits: [],
        changedFiles: [{ path: 'src/feature.ts', status: 'modified' }],
        additions: 1,
        deletions: 0,
        workingTree: 'dirty',
        evidence: [{ type: 'file', locator: 'src/feature.ts' }],
      },
    });
    expect(result.parserCoverage.symbols).toBeGreaterThan(0);
    expect(result.graph.nodes.some((node) => node.id.includes('ship'))).toBe(true);
    expect(result.findings.some((finding) => finding.checkId === 'tests.related')).toBe(true);
    expect(result.timings.every((timing) => timing.status !== 'failed')).toBe(true);
  });

  it('keeps semantic execution explicit and records provider data policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-analysis-semantic-'));
    await writeFile(join(root, 'README.md'), '# fixture\n');
    const result = await analyzeChanges({
      root,
      withSemantic: true,
      changeSet: {
        repository: { provider: 'git', name: 'fixture', root },
        commits: [],
        changedFiles: [{ path: 'README.md', status: 'modified' }],
        additions: 1,
        deletions: 0,
        workingTree: 'dirty',
        evidence: [{ type: 'file', locator: 'README.md' }],
      },
    });
    expect(result.semantic?.summary).toContain('deterministic evidence');
    expect(result.provenance.semanticProvider).toBe('fake');
    expect(result.provenance.sourceCodeSentToProvider).toBe(false);
  });

  it('renders an updateable PR brief without publishing uncertain findings inline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-analysis-pr-'));
    await writeFile(join(root, 'feature.js'), 'export const feature = true;\n');
    const analysis = await analyzeChanges({
      root,
      changeSet: {
        repository: { provider: 'git', name: 'fixture', root },
        headRef: 'feature',
        commits: [],
        changedFiles: [{ path: 'feature.js', status: 'modified' }],
        additions: 1,
        deletions: 0,
        workingTree: 'dirty',
        evidence: [{ type: 'file', locator: 'feature.js' }],
      },
    });
    const brief = createPullRequestBrief(
      {
        provider: 'github',
        owner: 'acme',
        repository: 'fixture',
        number: 7,
        title: 'Feature',
        baseRef: 'main',
        headRef: 'feature',
        baseSha: 'base',
        headSha: 'head',
        trigger: 'manual',
      },
      analysis,
    );
    const markdown = renderPullRequestBrief(brief);
    expect(markdown).toContain('TRACE:managed-pr-brief:start');
    expect(mergeManagedBrief('Human context', markdown)).toContain('Human context');
    expect(
      selectPublishedFindings([
        { ...analysis.findings[0]!, severity: 'low', classification: 'uncertain' },
      ]),
    ).toHaveLength(0);
  });
});
