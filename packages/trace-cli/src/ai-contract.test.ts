import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { main } from './cli.js';
import { collectSyncArtifacts, buildManifest } from './cloud.js';
import { parseArtifact } from '@trace/schema';
const run = promisify(execFile);
let root: string;
let previous: string;
const secret = 'PROVIDER_SECRET_SENTINEL_0123456789';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trace-ai-contract-'));
  previous = process.cwd();
  await run('git', ['init', '-b', 'main'], { cwd: root });
  await run('git', ['remote', 'add', 'origin', 'https://github.com/example/project.git'], {
    cwd: root,
  });
  await writeFile(join(root, '.gitignore'), '.trace/\n');
  await writeFile(
    join(root, 'sample.ts'),
    "export const PRIVATE_SOURCE_SENTINEL = 'private source';\n",
  );
  await run('git', ['add', '.'], { cwd: root });
  await run(
    'git',
    [
      '-c',
      'user.name=TRACE fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-m',
      'PRIVATE_COMMIT_SENTINEL',
    ],
    { cwd: root },
  );
  process.chdir(root);
  await main(['init', '--yes']);
  for (const name of [
    'TRACE_AI_PROVIDER',
    'TRACE_AI_BASE_URL',
    'TRACE_AI_MODEL',
    'TRACE_AI_API_KEY',
    'TRACE_AI_DATA_POLICY',
  ])
    vi.stubEnv(name, undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.chdir(previous);
  await rm(root, { recursive: true, force: true });
});
it('requires explicit provider configuration and never falls back to fake semantic output', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(await main(['analyze', '--with-ai'])).toMatchObject({
    code: 2,
    value: { errorCode: 'AI_NOT_CONFIGURED' },
  });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(access(join(root, '.trace/analyses'))).rejects.toMatchObject({ code: 'ENOENT' });
});
const configure = () => {
  vi.stubEnv('TRACE_AI_PROVIDER', 'openai-compatible');
  vi.stubEnv('TRACE_AI_BASE_URL', 'https://provider.example.test/v1');
  vi.stubEnv('TRACE_AI_MODEL', 'fixture-model');
  vi.stubEnv('TRACE_AI_API_KEY', secret);
  vi.stubEnv('TRACE_AI_DATA_POLICY', 'metadata-only');
};
const semantic = {
  summary: 'Only aggregate metadata was reviewed; implementation behavior cannot be assessed.',
  intent: null,
  affectedBehaviors: [],
  incompleteWork: [],
  conflictCandidates: [],
  questions: [],
};
const response = (value: unknown = semantic) =>
  new Response(
    JSON.stringify({
      model: 'fixture-model',
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );
it('invokes the configured adapter with metadata only and persists safe provenance', async () => {
  configure();
  const fetcher = vi.fn(async (_url, init) => {
    expect(String(_url)).toBe('https://provider.example.test/v1/chat/completions');
    expect(init.headers.authorization).toBe(`Bearer ${secret}`);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('fixture-model');
    const input = JSON.parse(body.messages[1].content);
    expect(Object.keys(input).sort()).toEqual(['counts', 'evidence', 'inputScope', 'workingTree']);
    for (const forbidden of [
      secret,
      root,
      'PRIVATE_SOURCE_SENTINEL',
      'PRIVATE_COMMIT_SENTINEL',
      'sample.ts',
      'private source',
    ])
      expect(init.body).not.toContain(forbidden);
    return response();
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await main(['analyze', '--with-ai']);
  expect(result.code).toBe(0);
  const content = await readFile(
    (
      result.value as {
        artifact: { path: string };
        analysis: { provenance: Record<string, unknown> };
      }
    ).artifact.path,
    'utf8',
  );
  expect(content).not.toContain(secret);
  expect(content).not.toContain('PRIVATE_SOURCE_SENTINEL');
  expect(content).not.toContain(root);
  expect(
    (
      result.value as {
        artifact: { path: string };
        analysis: { provenance: Record<string, unknown> };
      }
    ).analysis.provenance,
  ).toMatchObject({
    semanticEnabled: true,
    semanticProvider: 'openai-compatible',
    semanticModel: 'fixture-model',
    providerInput: 'metadata-only-v1',
    sourceCodeSentToProvider: false,
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  });
  expect(
    parseArtifact(content).metadata.evidence.some(
      (x) => x.locator === 'trace:semantic-analysis:v1',
    ),
  ).toBe(true);
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(1);
  const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const plan = await buildManifest(
    root,
    {
      server: 'https://trace.example.test',
      repositoryId: '11111111-1111-4111-8111-111111111111',
      repository: 'example/project',
      workspaceId: 'fixture',
      workspaceName: 'Fixture',
      connectedAt: new Date().toISOString(),
    },
    'main',
    head,
  );
  expect(plan.manifest).toMatchObject({ sourceCodeIncluded: false, codeSnippetsIncluded: false });
  expect(JSON.stringify(plan)).not.toContain(secret);
  const preview = await main(['sync', '--dry-run']);
  expect(preview.value).toMatchObject({ sourceCodeIncluded: false, codeSnippetsIncluded: false });
  expect(JSON.stringify(preview)).not.toContain(secret);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [401, 'AI_AUTH_FAILED'],
  [429, 'AI_RATE_LIMITED'],
  [503, 'AI_UNAVAILABLE'],
  [400, 'AI_UNSUPPORTED_MODEL'],
])('fails safely on provider HTTP %i', async (status, errorCode) => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(secret, { status: status as number })),
  );
  const result = await main(['analyze', '--with-ai']);
  expect(result).toMatchObject({ code: 1, value: { errorCode } });
  expect(JSON.stringify(result)).not.toContain(secret);
  await expect(access(join(root, '.trace/analyses'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it.each([
  { ...semantic, summary: secret },
  { ...semantic, summary: 'const privateCode = 42;' },
  { ...semantic, summary: '/tmp/private/path' },
  { ...semantic, summary: '# Review https://attacker.example' },
  { ...semantic, summary: 'console.log(42);' },
  {
    ...semantic,
    affectedBehaviors: [{ statement: 'Unverified observation.', evidenceIds: ['invented'] }],
  },
  { summary: 'Missing required fields.' },
])('rejects unsafe or malformed semantic output before persistence', async (value) => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response(value)),
  );
  const result = await main(['analyze', '--with-ai']);
  expect(result).toMatchObject({ code: 1, value: { errorCode: 'AI_INVALID_RESPONSE' } });
  expect(JSON.stringify(result)).not.toContain(secret);
  await expect(access(join(root, '.trace/analyses'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('keeps deterministic analysis unchanged without invoking a configured provider', async () => {
  configure();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const result = await main(['analyze']);
  expect(result.code).toBe(0);
  expect(
    (
      result.value as {
        artifact: { path: string };
        analysis: { provenance: Record<string, unknown> };
      }
    ).analysis.provenance,
  ).toMatchObject({
    semanticEnabled: false,
    providerInput: 'none',
    sourceCodeSentToProvider: false,
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps AI analysis of dirty input local after edits are reverted', async () => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
  await writeFile(join(root, 'dirty.txt'), 'exploratory');
  const result = await main(['analyze', '--with-ai']);
  expect(
    parseArtifact(
      await readFile(
        (
          result.value as {
            artifact: { path: string };
            analysis: { provenance: Record<string, unknown> };
          }
        ).artifact.path,
        'utf8',
      ),
    ).metadata.sync_policy,
  ).toBe('local_only');
  await rm(join(root, 'dirty.txt'));
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
});
it('rejects unsupported AI command surfaces instead of ignoring the flag', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const args of [
    ['pr', '7', '--with-ai'],
    ['report', 'daily', '--with-ai'],
  ])
    expect((await main(args)).code).toBe(2);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects unsupported provider selection through the public CLI', async () => {
  configure();
  vi.stubEnv('TRACE_AI_PROVIDER', 'fake');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(await main(['analyze', '--with-ai'])).toMatchObject({
    code: 2,
    value: { errorCode: 'AI_INVALID_CONFIG' },
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves a valid deterministic artifact when provider output fails', async () => {
  const prior = await main(['analyze']);
  const path = (prior.value as { artifact: { path: string } }).artifact.path;
  const content = await readFile(path, 'utf8');
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response({ summary: secret })),
  );
  expect((await main(['analyze', '--with-ai'])).code).toBe(1);
  expect(await readFile(path, 'utf8')).toBe(content);
});
it('keeps changing-HEAD input non-authoritative during a model request', async () => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await run(
        'git',
        [
          '-c',
          'user.name=TRACE fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '--allow-empty',
          '-m',
          'Changed during request',
        ],
        { cwd: root },
      );
      return response();
    }),
  );
  const result = await main(['analyze', '--with-ai']);
  expect(
    parseArtifact(
      await readFile((result.value as { artifact: { path: string } }).artifact.path, 'utf8'),
    ).metadata.sync_policy,
  ).toBe('local_only');
  expect((await collectSyncArtifacts(root)).eligible).toHaveLength(0);
});
