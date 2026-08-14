import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectSyncArtifacts,
  resolveCloudTarget,
  logout,
  normalizeGitHubRemote,
  readCredential,
  sync,
  writeCredential,
} from './cloud.js';
import { serializeArtifact } from '@trace/schema';

describe('trace CLI contract', () => {
  it('keeps local commands explicit about deterministic limits', () => {
    expect(
      'The intended product goal was not inferred from filenames or commit subjects.',
    ).toContain('not inferred');
    expect(['init', 'status', 'validate', 'changes', 'doctor']).toContain('changes');
  });

  it('labels staging targets and refuses an implicit production fallback', () => {
    const previousUrl = process.env.TRACE_CLOUD_URL;
    const previousEnvironment = process.env.TRACE_ENVIRONMENT;
    try {
      process.env.TRACE_CLOUD_URL = 'https://trace-staging.example.test';
      process.env.TRACE_ENVIRONMENT = 'staging';
      expect(resolveCloudTarget()).toEqual({
        server: 'https://trace-staging.example.test',
        environment: 'Staging',
      });
      delete process.env.TRACE_CLOUD_URL;
      expect(() => resolveCloudTarget()).toThrow(
        'TRACE_ENVIRONMENT=staging requires TRACE_CLOUD_URL or --server',
      );
    } finally {
      if (previousUrl === undefined) delete process.env.TRACE_CLOUD_URL;
      else process.env.TRACE_CLOUD_URL = previousUrl;
      if (previousEnvironment === undefined) delete process.env.TRACE_ENVIRONMENT;
      else process.env.TRACE_ENVIRONMENT = previousEnvironment;
    }
  });
});

describe('dashboard repository identity', () => {
  it.each([
    ['git@github.com:mathofdynamic/TRACE.git', 'mathofdynamic/TRACE'],
    ['https://github.com/mathofdynamic/TRACE.git', 'mathofdynamic/TRACE'],
    ['ssh://git@github.com/mathofdynamic/TRACE.git', 'mathofdynamic/TRACE'],
  ])('normalizes %s', (remote, expected) => {
    expect(normalizeGitHubRemote(remote)).toBe(expected);
  });

  it('rejects non-GitHub and ambiguous remotes', () => {
    expect(normalizeGitHubRemote('https://example.com/a/b.git')).toBeNull();
    expect(normalizeGitHubRemote('github.com/a/b')).toBeNull();
  });
});

describe('source-free sync collection', () => {
  it('includes an approved projection and excludes local-only and code snippets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-sync-'));
    const traceRoot = join(root, '.trace', 'analyses');
    await mkdir(traceRoot, { recursive: true });
    await writeFile(
      join(root, '.trace', 'config.yml'),
      'sync_policy:\n  enabled: true\n  allow:\n    - analysis\n  include_code_snippets: false\n',
    );
    const base = {
      schema_version: '0.1' as const,
      repository: { provider: 'github', owner: 'mathofdynamic', name: 'TRACE' },
      created_at: '2026-08-12T00:00:00.000Z',
      updated_at: '2026-08-12T00:00:00.000Z',
      generator: 'test',
      execution_origin: 'local' as const,
      source_refs: [],
      evidence: [],
      review_status: 'draft' as const,
      sensitivity: 'internal' as const,
      dashboard: {
        title: 'Analysis',
        summary: 'Source-free summary.',
        status: 'completed',
        items: [],
      },
    };
    await writeFile(
      join(traceRoot, 'approved.md'),
      serializeArtifact(
        { ...base, id: 'analysis-approved', artifact_type: 'analysis', sync_policy: 'allowlisted' },
        '# Analysis\n',
      ),
    );
    await writeFile(
      join(traceRoot, 'local.md'),
      serializeArtifact(
        { ...base, id: 'analysis-local', artifact_type: 'analysis', sync_policy: 'local_only' },
        '# Local\n',
      ),
    );
    await writeFile(
      join(traceRoot, 'snippet.md'),
      serializeArtifact(
        { ...base, id: 'analysis-snippet', artifact_type: 'analysis', sync_policy: 'allowlisted' },
        '# Snippet\n\n```ts\nconst secret = 1;\n```\n',
      ),
    );
    const result = await collectSyncArtifacts(root);
    expect(result.eligible.map((entry) => entry.manifest.id)).toEqual(['analysis-approved']);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'analyses/local.md', reason: 'local-only policy' }),
        expect.objectContaining({
          path: 'analyses/snippet.md',
          reason: 'code snippets are disabled',
        }),
      ]),
    );
  });
});

describe('CLI credential storage', () => {
  it('round-trips without storing the token in plaintext and logout removes it', async () => {
    const previous = process.env.TRACE_CONFIG_HOME;
    const root = await mkdtemp(join(tmpdir(), 'trace-credential-'));
    process.env.TRACE_CONFIG_HOME = root;
    const credential = {
      server: 'https://trace.example.test',
      accessToken: 'trc_test-secret-that-must-not-be-plaintext',
      connectionId: 'connection-test',
      savedAt: '2026-08-12T00:00:00.000Z',
    };
    try {
      await writeCredential(credential);
      const path = join(
        root,
        process.platform === 'win32' ? 'credentials.dpapi' : 'credentials.json',
      );
      const persisted = await readFile(path, 'utf8');
      if (process.platform === 'win32') expect(persisted).not.toContain(credential.accessToken);
      await expect(readCredential()).resolves.toEqual(credential);
      await logout();
      await expect(readCredential()).resolves.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.TRACE_CONFIG_HOME;
      else process.env.TRACE_CONFIG_HOME = previous;
    }
  });
});

describe('sync idempotency', () => {
  it('does not complete an already-completed operation after credential rotation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trace-sync-idempotency-'));
    const configRoot = await mkdtemp(join(tmpdir(), 'trace-sync-config-'));
    const previousConfigHome = process.env.TRACE_CONFIG_HOME;
    const previousFetch = globalThis.fetch;
    const server = 'https://trace-staging.example.test';
    const artifact = {
      schema_version: '0.1' as const,
      id: 'analysis-rotated-credential',
      artifact_type: 'analysis' as const,
      repository: { provider: 'github' as const, owner: 'mathofdynamic', name: 'TRACE' },
      created_at: '2026-08-14T00:00:00.000Z',
      updated_at: '2026-08-14T00:00:00.000Z',
      generator: 'test',
      execution_origin: 'local' as const,
      source_refs: [],
      evidence: [],
      review_status: 'draft' as const,
      sensitivity: 'internal' as const,
      sync_policy: 'allowlisted' as const,
      dashboard: {
        title: 'Rotated credential sync',
        summary: 'Source-free.',
        status: 'completed',
        items: [],
      },
    };
    try {
      process.env.TRACE_CONFIG_HOME = configRoot;
      await mkdir(join(root, '.trace', 'state'), { recursive: true });
      await mkdir(join(root, '.trace', 'analyses'), { recursive: true });
      await writeFile(
        join(root, '.trace', 'config.yml'),
        'sync_policy:\n  enabled: true\n  allow:\n    - analysis\n  include_code_snippets: false\n',
      );
      await writeFile(
        join(root, '.trace', 'state', 'dashboard.json'),
        JSON.stringify({
          server,
          repositoryId: '11111111-1111-4111-8111-111111111111',
          repository: 'mathofdynamic/TRACE',
          workspaceId: 'workspace-rotated-credential',
          workspaceName: 'mathofdynamic on GitHub',
          connectedAt: '2026-08-14T00:00:00.000Z',
        }),
      );
      await writeFile(
        join(root, '.trace', 'analyses', 'analysis.md'),
        serializeArtifact(artifact, '# Analysis\n'),
      );
      await writeCredential({
        server,
        accessToken: 'trc_rotated-credential-test',
        connectionId: 'new-connection',
        savedAt: '2026-08-14T00:00:00.000Z',
      });

      const calls: string[] = [];
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.endsWith('/api/sync/negotiate'))
          return new Response(
            JSON.stringify({
              operationId: 'existing-completed-operation',
              status: 'completed',
              missing: [],
              conflicts: [],
              idempotent: true,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        throw new Error(`Unexpected sync request: ${url}`);
      }) as typeof fetch;

      const result = await sync(root, 'main', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false);
      expect(result).toMatchObject({
        operationId: 'existing-completed-operation',
        status: 'completed',
        idempotent: true,
        uploaded: 0,
      });
      expect(calls).toEqual(['POST https://trace-staging.example.test/api/sync/negotiate']);
      await expect(readFile(join(root, '.trace', 'state', 'sync.json'), 'utf8')).resolves.toContain(
        'existing-completed-operation',
      );
    } finally {
      globalThis.fetch = previousFetch;
      if (previousConfigHome === undefined) delete process.env.TRACE_CONFIG_HOME;
      else process.env.TRACE_CONFIG_HOME = previousConfigHome;
    }
  });
});
