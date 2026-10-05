import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ArtifactMetadata } from '@trace/schema';

const run = promisify(execFile);
export const analysisInputCheck = 'trace:analysis-input:v1';
export type GitSnapshot = { branch: string; headCommit: string; workingTree: 'clean' | 'dirty' };
export async function gitSnapshot(root: string): Promise<GitSnapshot> {
  const git = async (args: string[]) => (await run('git', args, { cwd: root })).stdout.trim();
  return {
    branch: await git(['branch', '--show-current']),
    headCommit: await git(['rev-parse', 'HEAD']),
    workingTree: (await git([
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ]))
      ? 'dirty'
      : 'clean',
  };
}
export function sameSnapshot(a: GitSnapshot, b: GitSnapshot) {
  return a.branch === b.branch && a.headCommit === b.headCommit && a.workingTree === b.workingTree;
}
export function analysisAttributionIssue(metadata: ArtifactMetadata, target: GitSnapshot | null) {
  if (!target) return 'analysis Git context is unavailable';
  if (target.workingTree !== 'clean') return 'analysis requires a clean working tree';
  if (metadata.dashboard?.head_commit !== target.headCommit)
    return 'historical analysis: commit differs from current HEAD';
  if ((metadata.dashboard?.branch ?? '') !== target.branch)
    return 'historical analysis: branch differs from current branch';
  const checks = metadata.evidence.filter(
    (item) => item.type === 'check' && item.locator === analysisInputCheck,
  );
  if (checks.length !== 1)
    return 'analysis input provenance is unverified; run trace analyze from a clean checkout';
  const input = checks[0]!.metadata;
  if (input?.working_tree !== 'clean')
    return 'analysis was not generated from a clean working tree; regenerate it';
  if (input.head_commit !== target.headCommit || input.branch !== target.branch)
    return 'analysis input provenance does not match current branch and HEAD';
  return null;
}
