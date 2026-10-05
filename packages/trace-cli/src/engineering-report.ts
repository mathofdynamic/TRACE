import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { dailyWindow } from '@trace/analysis';
import { parseArtifact, type EngineeringReport } from '@trace/schema';
import { normalizeGitHubRemote } from './cloud.js';

const exec = promisify(execFile);
export type ReportRunner = (command: string, args: string[], root: string) => Promise<string>;
const run: ReportRunner = async (command, args, root) =>
  (
    await exec(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout;

export function reportPeriod(
  kind: 'daily' | 'weekly',
  date: string,
  timeZone: string,
  now: Date,
): EngineeringReport['period'] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('Use a valid --date YYYY-MM-DD.');
  // Find a point inside the selected calendar date in the requested zone, including large offsets.
  let point = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(point);
    const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const observed = `${value.year}-${value.month}-${value.day}`;
    if (observed === date) break;
    point = new Date(point.getTime() + (observed < date ? 12 : -12) * 3_600_000);
  }
  const last = dailyWindow(point, timeZone);
  const start =
    kind === 'daily'
      ? last.startUtc
      : dailyWindow(
          new Date(new Date(last.startUtc).getTime() - 6 * 86_400_000 + 12 * 3_600_000),
          timeZone,
        ).startUtc;
  if (new Date(last.startUtc) > now) throw new Error('Cannot report a future period.');
  return {
    kind,
    start,
    end: last.endUtc,
    timeZone,
    asOf: new Date(Math.min(now.getTime(), new Date(last.endUtc).getTime())).toISOString(),
  };
}

type Section = EngineeringReport['sections'][number];
const section = (
  id: Section['id'],
  title: string,
  summary: string,
  items: Section['items'] = [],
): Section => ({ id, title, summary, items: items.slice(0, 100) });
const safeTitle = (value: string) =>
  Array.from(value, (character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .slice(0, 240) || 'Untitled record';

export async function collectEngineeringReport(
  root: string,
  period: EngineeringReport['period'],
  github = false,
  runner: ReportRunner = run,
  headCommit?: string,
): Promise<EngineeringReport> {
  const sources: EngineeringReport['sources'] = [];
  const inPeriod = (date: string) =>
    Number.isFinite(Date.parse(date)) &&
    Date.parse(date) >= Date.parse(period.start) &&
    Date.parse(date) < Date.parse(period.end) &&
    Date.parse(date) <= Date.parse(period.asOf);
  let repository: string | null = null;
  try {
    repository = normalizeGitHubRemote(
      (await runner('git', ['config', '--get', 'remote.origin.url'], root)).trim(),
    );
  } catch {
    /* local Git repository */
  }
  const expectedIdentity = repository ?? `local/${basename(root)}`;
  const expectedProvider = repository ? 'github' : 'git';
  let commits: Section['items'] = [];
  let files: string[] = [];
  const fileEvidence = new Map<string, string[]>();
  let gitComplete = false;
  const versionChanges: Section['items'] = [];
  try {
    const shallow =
      (await runner('git', ['rev-parse', '--is-shallow-repository'], root)).trim() === 'true';
    // Walk reachable history before filtering: date ordering need not follow topology.
    const scope = headCommit ?? (await runner('git', ['rev-parse', 'HEAD'], root)).trim();
    const log = await runner('git', ['log', scope, '--format=%H%x00%cI%x00%s'], root);
    const rows = log
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\0'))
      .filter((row) => inPeriod(new Date(row[1]!).toISOString()));
    const paths = new Set<string>();
    for (const [sha, , subject] of rows) {
      const names = await runner(
        'git',
        ['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', sha!],
        root,
      );
      // Git quoting remains enabled: unusual filenames cannot inject report markup.
      const changedPaths = [...new Set(names.trim().split('\n').filter(Boolean))];
      for (const path of changedPaths) {
        paths.add(path);
        const evidence = fileEvidence.get(path) ?? [];
        if (evidence.length < 20) evidence.push(`commit:${sha}`);
        fileEvidence.set(path, evidence);
      }
      for (const path of changedPaths.filter(
        (path) => /(^|\/)package\.json$/.test(path) && !path.startsWith('"'),
      )) {
        try {
          const current = JSON.parse(await runner('git', ['show', `${sha}:${path}`], root));
          const previous = JSON.parse(await runner('git', ['show', `${sha}^:${path}`], root));
          if (
            typeof current.version === 'string' &&
            typeof previous.version === 'string' &&
            current.version !== previous.version
          )
            versionChanges.push({
              title: safeTitle(`${path}: ${previous.version} → ${current.version}`),
              ...(repository ? { url: `https://github.com/${repository}/commit/${sha}` } : {}),
              evidence: [`commit:${sha}`, `file:${path}`],
            });
        } catch {
          /* Missing parent/manifest cannot prove a version transition. */
        }
      }
      commits.push({
        title: safeTitle(subject!),
        ...(repository ? { url: `https://github.com/${repository}/commit/${sha}` } : {}),
        evidence: [`commit:${sha}`],
      });
    }
    files = [...paths].sort();
    gitComplete = !shallow;
    sources.push({
      name: 'Git',
      status: shallow ? 'partial' : 'available',
      detail: shallow
        ? 'Shallow history: counts are Not available; visible commits are samples.'
        : 'Commits reachable from HEAD, filtered by committer timestamp; changed paths deduplicated across those commits. Merge paths include comparisons with every parent.',
    });
  } catch {
    sources.push({
      name: 'Git',
      status: 'not_available',
      detail: 'Committed Git history could not be read. Counts are Not available.',
    });
    commits = [];
    files = [];
    versionChanges.length = 0;
  }

  let merged: Section['items'] = [],
    open: Section['items'] = [],
    releases: Section['items'] = [];
  let githubComplete = false;
  if (github && repository) {
    try {
      const pages = async (endpoint: string) => {
        const rows: Record<string, unknown>[] = [];
        for (let page = 1; page <= 20; page++) {
          const values: unknown = JSON.parse(
            await runner(
              'gh',
              [
                'api',
                `repos/${repository}/${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
              ],
              root,
            ),
          );
          if (!Array.isArray(values)) throw new Error('Invalid GitHub response');
          rows.push(...values);
          if (values.length < 100) return rows;
        }
        throw new Error('GitHub metadata exceeds bounded pagination');
      };
      const pulls = await pages('pulls?state=all&sort=updated&direction=desc');
      const releaseRows = await pages('releases');
      const prItem = (pr: Record<string, unknown>): Section['items'][number] => ({
        title: safeTitle(`#${pr.number} ${pr.title}`),
        url: String(pr.html_url),
        evidence: [`pull_request:${pr.number}`],
      });
      merged = pulls
        .filter((pr) => typeof pr.merged_at === 'string' && inPeriod(pr.merged_at))
        .map(prItem);
      // Current open inventory is deliberately not presented as historical open state.
      open = pulls.filter((pr) => pr.state === 'open').map(prItem);
      releases = releaseRows
        .filter(
          (r) =>
            r.draft === false && typeof r.published_at === 'string' && inPeriod(r.published_at),
        )
        .map((r) => ({
          title: safeTitle(String(r.name || r.tag_name)),
          url: String(r.html_url),
          evidence: [`release:${r.tag_name}`],
        }));
      githubComplete = true;
      sources.push({
        name: 'GitHub',
        status: 'available',
        detail:
          'Metadata-only GitHub API via the authenticated gh CLI. Merged PRs/releases use event timestamps. Open PRs are the current inventory, not a reconstructed historical state.',
      });
    } catch {
      merged = [];
      open = [];
      releases = [];
      sources.push({
        name: 'GitHub',
        status: 'not_available',
        detail:
          'GitHub metadata could not be completely verified. PR/release counts are Not available.',
      });
    }
  } else
    sources.push({
      name: 'GitHub',
      status: 'not_available',
      detail:
        'Use --github with an authenticated gh CLI and a GitHub remote to include verified PR/release metadata.',
    });

  const local: Record<string, Section['items']> = { findings: [], attention: [], decisions: [] };
  let verifiedAnalyses = 0;
  const allowedTypes = new Set<string>();
  try {
    const config = parseYaml(await readFile(join(root, '.trace', 'config.yml'), 'utf8'));
    if (Array.isArray(config?.sync_policy?.allow))
      for (const type of config.sync_policy.allow)
        if (typeof type === 'string') allowedTypes.add(type);
  } catch {
    /* Missing policy cannot authorize promoting local data into reports. */
  }

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['state', 'reports', 'pull-requests'].includes(entry.name)) await walk(path);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = await readFile(path, 'utf8');
          const { metadata } = parseArtifact(content);
          if (
            !allowedTypes.has(metadata.artifact_type) ||
            metadata.sync_policy === 'local_only' ||
            ['confidential', 'restricted'].includes(metadata.sensitivity) ||
            /```/.test(content)
          )
            continue;
          if (
            metadata.repository.provider !== expectedProvider ||
            `${metadata.repository.owner}/${metadata.repository.name}` !== expectedIdentity
          )
            continue;
          if (metadata.superseded_by || !inPeriod(metadata.updated_at) || !metadata.dashboard)
            continue;
          const type = metadata.artifact_type;
          const target =
            type === 'analysis'
              ? 'findings'
              : ['risk', 'conflict'].includes(type)
                ? 'attention'
                : type === 'decision'
                  ? 'decisions'
                  : null;
          if (!target) continue;
          if (type === 'analysis') {
            const checks = metadata.evidence.filter((e) => e.locator === 'trace:analysis-input:v1');
            if (
              checks.length !== 1 ||
              checks[0]?.metadata?.working_tree !== 'clean' ||
              checks[0]?.metadata?.head_commit !== metadata.dashboard.head_commit ||
              checks[0]?.metadata?.branch !== metadata.dashboard.branch
            )
              continue;
            verifiedAnalyses++;
          }
          for (const item of metadata.dashboard.items)
            local[target]!.push({
              title: safeTitle(item.title),
              detail: item.detail,
              evidence: [`artifact:${metadata.id}`, ...item.evidence].slice(0, 20),
            });
          if (type !== 'analysis' && !metadata.dashboard.items.length)
            local[target]!.push({
              title: safeTitle(metadata.dashboard.title),
              detail: metadata.dashboard.summary,
              evidence: [`artifact:${metadata.id}`],
            });
        } catch {
          /* Invalid or unsupported local records cannot establish facts. */
        }
      }
    }
  };
  try {
    if ((await lstat(join(root, '.trace'))).isSymbolicLink())
      throw new Error('Symlinked TRACE directory');
    await walk(join(root, '.trace'));
  } catch {
    /* unavailable local inventory */
  }
  sources.push({
    name: 'TRACE',
    status: 'partial',
    detail:
      'Available valid local records updated during the period only. Absence is not proof of zero risks or unresolved findings. Analysis counts describe recorded findings, not resolution state; no complete lifecycle ledger is available.',
  });
  const number = (available: boolean, n: number) => (available ? String(n) : 'Not available');
  const summary = `${number(gitComplete, commits.length)} commits · ${number(githubComplete, merged.length)} PRs merged · ${number(gitComplete, files.length)} files changed`;
  const areas = [
    ...new Set(
      files.map((path) =>
        path.includes('/') ? path.split('/').slice(0, 2).join('/') : 'Repository root',
      ),
    ),
  ];
  const displayedAreas: string[] = [];
  for (const area of areas) {
    const label = safeTitle(area);
    if ([...displayedAreas, label].join(', ').length > 2000) break;
    displayedAreas.push(label);
  }
  const areaSummary = `${displayedAreas.join(', ') || 'No changed areas'}${displayedAreas.length < areas.length ? ' (area display limited; total unchanged)' : ''}`;
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('en', { timeZone: period.timeZone, dateStyle: 'medium' }).format(
      new Date(value),
    );
  let freshness =
    'Remote freshness: Not available. This is a historical reporting snapshot, not a claim that every source is complete.';
  if (github && repository) {
    try {
      const repo: unknown = JSON.parse(await runner('gh', ['api', `repos/${repository}`], root));
      if (
        !repo ||
        typeof repo !== 'object' ||
        !('default_branch' in repo) ||
        typeof repo.default_branch !== 'string'
      )
        throw new Error('No verified default branch');
      const remote: unknown = JSON.parse(
        await runner(
          'gh',
          ['api', `repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`],
          root,
        ),
      );
      const head = (await runner('git', ['rev-parse', 'HEAD'], root)).trim();
      const branch = (await runner('git', ['branch', '--show-current'], root)).trim();
      if (
        !remote ||
        typeof remote !== 'object' ||
        !('sha' in remote) ||
        typeof remote.sha !== 'string'
      )
        throw new Error('No verified remote head');
      freshness =
        branch === repo.default_branch && head === remote.sha
          ? 'Current with the GitHub default branch at generation time.'
          : 'Local snapshot differs from the GitHub default branch; refresh or review the branch before publication.';
    } catch {
      /* An unavailable comparison must not claim current freshness. */
    }
  }
  const sections = [
    section(
      'period',
      'Reporting period',
      `${formatDate(period.start)} → ${formatDate(new Date(new Date(period.end).getTime() - 1).toISOString())} (${period.timeZone}). Period totals stop at the earlier of period end or generation time. The last day may still be in progress; open PRs and freshness are current snapshots.`,
    ),
    section('summary', 'Executive summary', summary),
    section(
      'commits',
      'Commits',
      gitComplete
        ? `${commits.length} reachable commits in the period. Counts are project-level facts, not individual productivity scores.`
        : 'Not available — complete history was not verified.',
      commits,
    ),
    section(
      'pull-requests',
      'Merged / open PRs',
      githubComplete
        ? `${merged.length} merged during the period; ${open.length} open now. Historical open-PR state is Not available.`
        : 'Not available',
      [
        ...merged.map((p) => ({ ...p, detail: 'Merged during reporting period' })),
        ...open.map((p) => ({ ...p, detail: 'Open at generation time' })),
      ],
    ),
    section(
      'files',
      'Files / areas changed',
      gitComplete
        ? `${files.length} unique paths across ${areas.length} areas. Areas: ${areaSummary}.`
        : 'Not available',
      files.map((path) => ({
        title: safeTitle(path),
        evidence: fileEvidence.get(path)!,
      })),
    ),
    section(
      'engineering',
      'Important engineering changes',
      'Recorded commit subjects and merged PR titles; importance, intent and outcomes are not inferred.',
      [...merged, ...commits],
    ),
    section(
      'findings',
      'Findings',
      verifiedAnalyses
        ? `${local.findings!.length} recorded findings in ${verifiedAnalyses} clean analysis artifacts. Resolution status: Not available.`
        : 'Not available — no verified clean analysis for this period.',
      local.findings,
    ),
    section(
      'attention',
      'Risks / conflicts / attention',
      local.attention!.length
        ? `${local.attention!.length} recorded local items; completeness and current resolution are Not available.`
        : 'Not available — no verified risk/conflict ledger.',
      local.attention,
    ),
    section(
      'decisions',
      'Decisions',
      local.decisions!.length
        ? `${local.decisions!.length} available local decision records.`
        : 'Not available',
      local.decisions,
    ),
    section(
      'releases',
      'Releases / version changes',
      githubComplete
        ? `${releases.length} published GitHub releases in the period; ${gitComplete ? `${versionChanges.length} verified package version transitions in local history.` : 'Version transitions: Not available.'}`
        : `Published releases: Not available. ${gitComplete ? `${versionChanges.length} verified package version transitions in local history.` : 'Version transitions: Not available.'}`,
      [...releases, ...versionChanges],
    ),
    section(
      'freshness',
      'Current freshness / status',
      freshness +
        ' Working-tree edits are excluded from period totals; sync status is verified separately by TRACE.',
    ),
  ];
  for (const s of sections)
    if (s.items.length === 100)
      s.summary +=
        ' Display is limited to the first 100 evidence items; totals refer to the collected inventory.';
  return { version: 1, period, sources, sections };
}
