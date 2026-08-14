import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import {
  checksum,
  isSafeTraceRelativePath,
  parseArtifact,
  syncManifestSchema,
  type SyncArtifactManifest,
  type SyncManifest,
} from '@trace/schema';

const run = promisify(execFile);
const DEFAULT_SERVER = 'https://trace-code.pages.dev';

export type TraceEnvironment = 'Production' | 'Staging' | 'Custom';
export type CloudTarget = { server: string; environment: TraceEnvironment };

export type Credential = {
  server: string;
  accessToken: string;
  connectionId: string;
  savedAt: string;
};
export type RepositoryBinding = {
  server: string;
  repositoryId: string;
  repository: string;
  workspaceId: string;
  workspaceName: string;
  connectedAt: string;
};

function configRoot() {
  return (
    process.env.TRACE_CONFIG_HOME ??
    (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? homedir(), 'TRACE')
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'trace'))
  );
}

function credentialPath() {
  return join(
    configRoot(),
    process.platform === 'win32' ? 'credentials.dpapi' : 'credentials.json',
  );
}

function bindingPath(root: string) {
  return join(root, '.trace', 'state', 'dashboard.json');
}

async function writePrivateJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

async function protectWindows(value: string) {
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $plain=[Convert]::FromBase64String($env:TRACE_CREDENTIAL_INPUT); $protected=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($protected)`;
  const result = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      windowsHide: true,
      env: {
        ...process.env,
        TRACE_CREDENTIAL_INPUT: Buffer.from(value, 'utf8').toString('base64'),
      },
    },
  );
  return result.stdout.trim();
}

async function unprotectWindows(value: string) {
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $protected=[Convert]::FromBase64String($env:TRACE_CREDENTIAL_INPUT); $plain=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Text.Encoding]::UTF8.GetString($plain)`;
  const result = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      windowsHide: true,
      env: { ...process.env, TRACE_CREDENTIAL_INPUT: value },
    },
  );
  return result.stdout.trim();
}

export async function writeCredential(value: Credential) {
  const path = credentialPath();
  if (process.platform !== 'win32') return writePrivateJson(path, value);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${await protectWindows(JSON.stringify(value))}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function readCredential(): Promise<Credential | null> {
  try {
    const source = (await readFile(credentialPath(), 'utf8')).trim();
    const value = JSON.parse(
      process.platform === 'win32' ? await unprotectWindows(source) : source,
    ) as Credential;
    return value.accessToken?.startsWith('trc_') && value.server ? value : null;
  } catch {
    return null;
  }
}

export async function logout() {
  await unlink(credentialPath()).catch(() => undefined);
  return {
    signedOut: true,
    note: 'The local credential was removed. Revoke the device in Dashboard Settings if the token may have been exposed.',
  };
}

function cleanServer(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('TRACE server must use HTTP or HTTPS.');
  return url.toString().replace(/\/$/, '');
}

function configuredEnvironment(): TraceEnvironment | undefined {
  const value = process.env.TRACE_ENVIRONMENT?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'production') return 'Production';
  if (value === 'staging') return 'Staging';
  if (value === 'custom') return 'Custom';
  throw new Error('TRACE_ENVIRONMENT must be production, staging, or custom.');
}

export function resolveCloudTarget(server?: string): CloudTarget {
  const normalized = cleanServer(server ?? process.env.TRACE_CLOUD_URL ?? DEFAULT_SERVER);
  const environment = configuredEnvironment();
  if (environment === 'Staging' && normalized === DEFAULT_SERVER) {
    throw new Error(
      'TRACE_ENVIRONMENT=staging requires TRACE_CLOUD_URL or --server; refusing the production default.',
    );
  }
  return {
    server: normalized,
    environment: environment ?? (normalized === DEFAULT_SERVER ? 'Production' : 'Custom'),
  };
}

export function cloudEnvironmentForServer(server: string): TraceEnvironment {
  const normalized = cleanServer(server);
  const configuredServer = process.env.TRACE_CLOUD_URL
    ? cleanServer(process.env.TRACE_CLOUD_URL)
    : undefined;
  const environment = configuredEnvironment();
  if (environment && configuredServer === normalized) return environment;
  return normalized === DEFAULT_SERVER ? 'Production' : 'Custom';
}

async function api<T>(server: string, path: string, init: RequestInit = {}, token?: string) {
  const url = `${cleanServer(server)}${path}`;
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  if (!response) {
    const reason = lastError instanceof Error ? lastError.message : 'network unavailable';
    throw new Error(
      `TRACE dashboard is unavailable (${reason}). Local .trace files are unchanged.`,
    );
  }
  const body = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as T & {
    error?: string;
  };
  if (!response.ok && response.status !== 202) {
    const requestId = response.headers.get('x-trace-request-id');
    const message = body.error ?? `TRACE server returned ${response.status}.`;
    throw new Error(requestId ? `${message} Request ID: ${requestId}.` : message);
  }
  return { status: response.status, body };
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function login(args: string[]) {
  const target = resolveCloudTarget(option(args, '--server'));
  const server = target.server;
  const label = option(args, '--label') ?? `TRACE CLI on ${process.platform}`;
  let body: {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    interval: number;
    expiresIn: number;
  };
  try {
    ({ body } = await api<typeof body>(server, '/api/cli/device/start', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }));
  } catch (error) {
    throw new Error(
      `TRACE environment ${target.environment}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!args.includes('--no-open')) {
    const command =
      process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const openArgs =
      process.platform === 'win32'
        ? ['/c', 'start', '', body.verificationUriComplete]
        : [body.verificationUriComplete];
    run(command, openArgs, { windowsHide: true }).catch(() => undefined);
  }
  process.stdout.write(
    `Open ${body.verificationUri}\nEnter code: ${body.userCode}\nWaiting for approval…\n`,
  );
  const deadline = Date.now() + body.expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(2, body.interval) * 1000));
    const result = await api<{ status: string; accessToken?: string; connectionId?: string }>(
      server,
      '/api/cli/device/token',
      { method: 'POST', body: JSON.stringify({ deviceCode: body.deviceCode }) },
    );
    if (result.status === 202) continue;
    if (!result.body.accessToken || !result.body.connectionId)
      throw new Error('TRACE did not return a CLI credential.');
    await writeCredential({
      server,
      accessToken: result.body.accessToken,
      connectionId: result.body.connectionId,
      savedAt: new Date().toISOString(),
    } satisfies Credential);
    return {
      signedIn: true,
      environment: target.environment,
      server,
      connectionId: result.body.connectionId,
      credentialStorage: credentialPath(),
    };
  }
  throw new Error('Device authorization expired. Run trace login again.');
}

export async function whoami() {
  const credential = await readCredential();
  if (!credential) {
    const target = resolveCloudTarget();
    return {
      signedIn: false,
      environment: target.environment,
      server: target.server,
      message: 'Run trace login.',
    };
  }
  const { body } = await api<Record<string, unknown>>(
    credential.server,
    '/api/cli/me',
    {},
    credential.accessToken,
  );
  return {
    signedIn: true,
    ...body,
    environment: cloudEnvironmentForServer(credential.server),
    server: credential.server,
  };
}

export function normalizeGitHubRemote(remote: string) {
  const trimmed = remote.trim();
  const scp = trimmed.match(/^git@github\.com:([^/\s]+)\/([^\s]+)$/i);
  let owner: string | undefined;
  let name: string | undefined;
  if (scp) [, owner, name] = scp;
  else {
    try {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== 'github.com') return null;
      [owner, name] = url.pathname.replace(/^\//, '').split('/');
    } catch {
      return null;
    }
  }
  if (!owner || !name) return null;
  name = name.replace(/\.git$/i, '');
  return /^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(name)
    ? `${owner}/${name}`
    : null;
}

export async function connect(root: string, remote: string) {
  const repository = normalizeGitHubRemote(remote);
  if (!repository)
    throw new Error('remote.origin.url is not an unambiguous GitHub repository URL.');
  const credential = await readCredential();
  if (!credential) {
    const target = resolveCloudTarget();
    throw new Error(
      `TRACE environment ${target.environment}\nRun trace login before trace connect.`,
    );
  }
  const { body } = await api<{
    workspace?: { id: string; name: string };
    repositories?: Array<{ id: string; fullName: string }>;
  }>(credential.server, '/api/cli/me', {}, credential.accessToken);
  const matches = (body.repositories ?? []).filter(
    (candidate) => candidate.fullName.toLowerCase() === repository.toLowerCase(),
  );
  if (matches.length !== 1 || !body.workspace) {
    throw new Error(
      matches.length
        ? 'Repository identity is ambiguous.'
        : `${repository} is not selected in this TRACE workspace.`,
    );
  }
  const binding: RepositoryBinding = {
    server: credential.server,
    repositoryId: matches[0]!.id,
    repository: matches[0]!.fullName,
    workspaceId: body.workspace.id,
    workspaceName: body.workspace.name,
    connectedAt: new Date().toISOString(),
  };
  await writePrivateJson(bindingPath(root), binding);
  return { ...binding, environment: cloudEnvironmentForServer(binding.server) };
}

export async function readBinding(root: string): Promise<RepositoryBinding | null> {
  try {
    return JSON.parse(await readFile(bindingPath(root), 'utf8')) as RepositoryBinding;
  } catch {
    return null;
  }
}

async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

export async function collectSyncArtifacts(root: string) {
  const traceRoot = join(root, '.trace');
  const traceRootReal = await (await import('node:fs/promises'))
    .realpath(traceRoot)
    .catch(() => traceRoot);
  const configSource = await readFile(join(traceRoot, 'config.yml'), 'utf8').catch(() => '');
  const config = configSource
    ? ((await import('yaml')).parse(configSource) as {
        sync_policy?: { enabled?: boolean; allow?: string[]; include_code_snippets?: boolean };
      })
    : {};
  const configuredPolicy = config.sync_policy;
  const syncEnabled = configuredPolicy?.enabled === true;
  const allow = new Set(configuredPolicy?.allow ?? []);
  const eligible: Array<{ manifest: SyncArtifactManifest; content: string }> = [];
  const excluded: Array<{ path: string; reason: string }> = [];
  for (const path of await markdownFiles(traceRoot)) {
    const relativePath = relative(traceRoot, path).replaceAll('\\', '/');
    if (relativePath === 'README.md') continue;
    let content: string;
    try {
      const candidateReal = await (await import('node:fs/promises')).realpath(path);
      if (
        candidateReal !== traceRootReal &&
        !candidateReal.startsWith(`${traceRootReal}${process.platform === 'win32' ? '\\' : '/'}`)
      ) {
        excluded.push({ path: relativePath, reason: 'symlink escapes .trace' });
        continue;
      }
      content = await readFile(path, 'utf8');
      const artifact = parseArtifact(content);
      const metadata = artifact.metadata;
      const bytes = new TextEncoder().encode(content).byteLength;
      const reason = !isSafeTraceRelativePath(relativePath)
        ? 'unsafe path'
        : !syncEnabled
          ? 'sync is disabled in .trace/config.yml'
          : !allow.has(metadata.artifact_type)
            ? 'artifact type is not allowlisted'
            : metadata.execution_origin !== 'local'
              ? 'not locally generated'
              : metadata.sync_policy === 'local_only'
                ? 'local-only policy'
                : ['confidential', 'restricted'].includes(metadata.sensitivity)
                  ? 'sensitivity policy'
                  : !metadata.dashboard
                    ? 'no dashboard projection'
                    : configuredPolicy?.include_code_snippets === true ||
                        /```/.test(content) ||
                        content
                          .split('\n')
                          .filter((line) =>
                            /^\s*(?:import|export|const|let|var|function|class|interface|enum)\b/.test(
                              line,
                            ),
                          ).length >= 2
                      ? 'code snippets are disabled'
                      : bytes > 262_144
                        ? 'artifact exceeds 256 KiB'
                        : null;
      if (reason) excluded.push({ path: relativePath, reason });
      else
        eligible.push({
          content,
          manifest: {
            id: metadata.id,
            type: metadata.artifact_type as SyncArtifactManifest['type'],
            path: relativePath,
            sha256: checksum(content),
            size: bytes,
            schemaVersion: metadata.schema_version,
            sensitivity: metadata.sensitivity,
            revision: metadata.updated_at,
          },
        });
    } catch (error) {
      excluded.push({
        path: relativePath,
        reason: error instanceof Error ? error.message : 'invalid artifact',
      });
    }
  }
  return { eligible, excluded };
}

export async function buildManifest(
  root: string,
  binding: RepositoryBinding,
  branch: string,
  headCommit: string,
) {
  const { eligible, excluded } = await collectSyncArtifacts(root);
  const acknowledgedState = await readFile(join(root, '.trace', 'state', 'sync.json'), 'utf8')
    .then(
      (source) =>
        JSON.parse(source) as {
          operationId?: string;
          repository?: string;
        },
    )
    .catch(() => null);
  const baseOperationId =
    acknowledgedState?.repository?.toLowerCase() === binding.repository.toLowerCase() &&
    typeof acknowledgedState.operationId === 'string'
      ? acknowledgedState.operationId
      : null;
  const manifest: SyncManifest = syncManifestSchema.parse({
    protocolVersion: '0.1',
    schemaVersion: '0.1',
    syncId: randomUUID(),
    repositoryId: binding.repositoryId,
    repository: binding.repository,
    executionOrigin: 'local',
    traceVersion: '0.1.0',
    createdAt: new Date().toISOString(),
    baseOperationId,
    git: { branch, headCommit },
    artifacts: eligible.map((item) => item.manifest),
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  });
  return {
    manifest,
    eligible,
    excluded,
    manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  };
}

export async function sync(root: string, branch: string, headCommit: string, dryRun: boolean) {
  const binding = await readBinding(root);
  if (!binding && dryRun) {
    const plan = await collectSyncArtifacts(root);
    const target = resolveCloudTarget();
    return {
      dryRun: true,
      connected: false,
      environment: target.environment,
      server: target.server,
      repository: null,
      eligible: plan.eligible.map((item) => item.manifest),
      excluded: plan.excluded,
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
      totalBytes: plan.eligible.reduce((sum, item) => sum + item.manifest.size, 0),
      next: 'Run trace login and trace connect before the actual sync.',
    };
  }
  if (!binding) throw new Error('Run trace connect before trace sync.');
  const plan = await buildManifest(root, binding, branch, headCommit);
  if (dryRun)
    return {
      dryRun: true,
      environment: cloudEnvironmentForServer(binding.server),
      server: binding.server,
      repository: binding.repository,
      eligible: plan.eligible.map((item) => item.manifest),
      excluded: plan.excluded,
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
      totalBytes: plan.eligible.reduce((sum, item) => sum + item.manifest.size, 0),
    };
  const credential = await readCredential();
  if (!credential || credential.server !== binding.server)
    throw new Error('Run trace login for the server configured by trace connect.');
  const negotiated = await api<{
    operationId: string;
    missing: string[];
    conflicts: unknown[];
    status: string;
  }>(
    binding.server,
    '/api/sync/negotiate',
    { method: 'POST', body: JSON.stringify(plan.manifest) },
    credential.accessToken,
  );
  if (negotiated.body.conflicts.length)
    throw new Error('Dashboard divergence requires review; no local files were changed.');
  const missing = new Set(negotiated.body.missing);
  if (negotiated.body.status === 'completed') {
    await writePrivateJson(join(root, '.trace', 'state', 'sync.json'), {
      ...negotiated.body,
      completed: true,
      manifestSha256: plan.manifestSha256,
      repository: binding.repository,
    });
    return {
      ...negotiated.body,
      completed: true,
      environment: cloudEnvironmentForServer(binding.server),
      server: binding.server,
      uploaded: 0,
      excluded: plan.excluded,
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    };
  }
  for (const item of plan.eligible.filter((artifact) => missing.has(artifact.manifest.id))) {
    await api(
      binding.server,
      '/api/sync/artifact',
      {
        method: 'POST',
        body: JSON.stringify({
          operationId: negotiated.body.operationId,
          artifact: item.manifest,
          content: item.content,
        }),
      },
      credential.accessToken,
    );
  }
  const completed = await api<Record<string, unknown>>(
    binding.server,
    '/api/sync/complete',
    { method: 'POST', body: JSON.stringify({ operationId: negotiated.body.operationId }) },
    credential.accessToken,
  );
  await writePrivateJson(join(root, '.trace', 'state', 'sync.json'), {
    ...completed.body,
    manifestSha256: plan.manifestSha256,
    repository: binding.repository,
  });
  return {
    ...completed.body,
    environment: cloudEnvironmentForServer(binding.server),
    server: binding.server,
    uploaded: missing.size,
    excluded: plan.excluded,
    sourceCodeIncluded: false,
    codeSnippetsIncluded: false,
  };
}

export async function syncStatus(root: string, acceptDashboardBase = false) {
  const binding = await readBinding(root);
  const credential = await readCredential();
  if (!binding) {
    const target = resolveCloudTarget();
    return {
      connected: false,
      environment: target.environment,
      server: target.server,
      message: 'Run trace connect.',
    };
  }
  if (!credential)
    return {
      connected: true,
      authenticated: false,
      environment: cloudEnvironmentForServer(binding.server),
      binding,
      message: 'Run trace login.',
    };
  const { body } = await api<Record<string, unknown>>(
    binding.server,
    `/api/sync/status?repositoryId=${encodeURIComponent(binding.repositoryId)}`,
    {},
    credential.accessToken,
  );
  const lastSync = body.lastSync as { operationId?: unknown } | null | undefined;
  if (acceptDashboardBase) {
    if (typeof lastSync?.operationId !== 'string') {
      throw new Error('The dashboard has no completed sync to acknowledge.');
    }
    await writePrivateJson(join(root, '.trace', 'state', 'sync.json'), {
      operationId: lastSync.operationId,
      repository: binding.repository,
      acceptedDashboardBaseAt: new Date().toISOString(),
    });
  }
  return {
    connected: true,
    authenticated: true,
    environment: cloudEnvironmentForServer(binding.server),
    binding,
    dashboard: body,
    dashboardBaseAccepted: acceptDashboardBase,
  };
}
