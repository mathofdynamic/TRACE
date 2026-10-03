import { mkdtemp, mkdir, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { validateTraceDirectory } from '@trace/schema';
import { main } from './cli.js';
import { connect } from './cloud.js';

const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/trace-project/.trace/', import.meta.url),
);
const scaffold = ['README.md', 'config.yml', 'schema-version'];

describe('durable fresh-init fixture', () => {
  it('matches real initialization, preserves existing files and validates', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'trace-init-fixture-'));
    const root = join(parent, 'trace-project');
    const previous = process.cwd();
    try {
      await mkdir(root);
      process.chdir(root);
      expect((await main(['init', '--yes'])).code).toBe(0);
      const traceRoot = join(root, '.trace');
      const entries = await readdir(fixture, { recursive: true, withFileTypes: true });
      expect(
        entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort(),
      ).toEqual(scaffold);
      expect(entries.some((entry) => entry.isSymbolicLink())).toBe(false);
      for (const file of scaffold) {
        expect(await readFile(join(traceRoot, file), 'utf8')).toBe(
          await readFile(join(fixture, file), 'utf8'),
        );
      }
      for (const directory of [
        'reports/daily',
        'reports/weekly',
        'pull-requests',
        'decisions',
        'risks',
        'debt',
        'state',
        'indexes',
      ]) {
        await expect(access(join(traceRoot, directory))).resolves.toBeUndefined();
      }
      await expect(validateTraceDirectory(fixture)).resolves.toEqual([]);
      await expect(validateTraceDirectory(traceRoot)).resolves.toEqual([]);
      expect((await main(['init', '--yes'])).code).toBe(0);
      expect(await readFile(join(traceRoot, 'config.yml'), 'utf8')).toBe(
        await readFile(join(fixture, 'config.yml'), 'utf8'),
      );
    } finally {
      process.chdir(previous);
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('contains only deterministic safe config and no runtime credentials', async () => {
    expect(await readFile(join(fixture, 'schema-version'), 'utf8')).toBe('0.1\n');
    const config = parse(await readFile(join(fixture, 'config.yml'), 'utf8'));
    expect(config).toEqual({
      schema_version: '0.1',
      execution_mode: 'local',
      repository: { provider: 'git', name: 'trace-project' },
      git_write_policy: 'disabled',
      sync_policy: {
        enabled: true,
        default: 'local_only',
        allow: [
          'analysis',
          'daily_report',
          'weekly_report',
          'pr_brief',
          'decision',
          'risk',
          'conflict',
        ],
        include_code_snippets: false,
      },
    });
    for (const file of scaffold) {
      expect(await readFile(join(fixture, file), 'utf8')).not.toMatch(
        /-----BEGIN|gh[pousr]_|github_pat_|access[_-]?token|client[_-]?secret|password\s*[:=]|dashboard\.json|workers\.dev|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    }
  });

  it('rejects connect before credentials/network/state writes when uninitialized', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-uninitialized-'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(connect(root, 'https://github.com/mathofdynamic/TRACE.git')).rejects.toThrow(
        'TRACE is not initialized in this repository. Run `trace init --yes` first.',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(access(join(root, '.trace'))).rejects.toThrow();
    } finally {
      fetchSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
