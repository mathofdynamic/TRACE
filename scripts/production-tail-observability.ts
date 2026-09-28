import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type TailFailureClass =
  | 'AUTHORIZATION_FAILURE'
  | 'WORKER_TARGET_FAILURE'
  | 'CONFIGURATION_FAILURE'
  | 'NETWORK_FAILURE'
  | 'WRANGLER_FAILURE'
  | 'UNKNOWN_FAILURE';

export type TailCommandKind = 'simple' | 'config';

export type TailExit = { code: number | null; signal: NodeJS.Signals | null };

export function buildWranglerTailArgs(
  kind: TailCommandKind,
  workerName: string,
  versionId: string,
  configPath?: string,
) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(workerName)) {
    throw new Error('Tail Worker name is invalid.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) {
    throw new Error('Tail version ID is invalid.');
  }
  const args = ['exec', 'wrangler', 'tail', workerName];
  if (kind === 'config') {
    if (!configPath) throw new Error('Config tail requires a generated Wrangler config path.');
    args.push('--config', configPath, '--env', 'production');
  } else if (configPath !== undefined) {
    throw new Error('Simple tail must not receive a Wrangler config path.');
  }
  args.push('--format', 'json', '--status', 'error', '--version-id', versionId);
  return args;
}

export function sanitizeTailDiagnostic(input: string, token: string, maxBytes = 8 * 1024) {
  const boundedBytes = Math.max(0, Math.min(maxBytes, 8 * 1024));
  const redacted = input
    .replace(token ? new RegExp(escapeRegExp(token), 'g') : /$^/, '[REDACTED]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/(authorization\s*[:=]\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/(api[_ -]?token\s*[:=]\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(
      /((?:client|webhook|auth)[_ -]?secret|private[_ -]?key|jwt)\s*[:=]\s*[^\r\n]*/gi,
      '$1=[REDACTED]',
    )
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|cf_[A-Za-z0-9_-]{40,})\b/g, '[REDACTED_CREDENTIAL]');
  const bytes = Buffer.from(redacted, 'utf8');
  if (bytes.length <= boundedBytes) return redacted;
  const marker = '[TRUNCATED]';
  if (boundedBytes <= Buffer.byteLength(marker)) return marker.slice(0, boundedBytes);
  const prefix = bytes
    .subarray(0, Math.max(0, boundedBytes - Buffer.byteLength(marker)))
    .toString('utf8')
    .replace(/\uFFFD+$/g, '');
  return `${prefix}${marker}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyTailFailure(diagnostic: string, exit: TailExit) {
  const text = diagnostic.toLowerCase();
  if (
    /http\s*(401|403)|\b(unauthorized|forbidden|permission denied|insufficient permission)\b/.test(
      text,
    )
  ) {
    return 'AUTHORIZATION_FAILURE' as const;
  }
  if (/http\s*404|worker[^\n]*(not found|does not exist)|script[^\n]*not found/.test(text)) {
    return 'WORKER_TARGET_FAILURE' as const;
  }
  if (
    /unknown option|unknown argument|invalid config|configuration error|could not find.*config|wrangler\.json/.test(
      text,
    )
  ) {
    return 'CONFIGURATION_FAILURE' as const;
  }
  if (/econn|enotfound|etimedout|timeout|websocket|socket hang up|network/.test(text)) {
    return 'NETWORK_FAILURE' as const;
  }
  if (
    text.includes('wrangler') ||
    (exit.code !== null && exit.code !== 0) ||
    exit.signal !== null
  ) {
    return 'WRANGLER_FAILURE' as const;
  }
  return 'UNKNOWN_FAILURE' as const;
}

export async function reportBeforeCleanup<T>(
  report: () => T | Promise<T>,
  cleanup: () => void | Promise<void>,
) {
  try {
    return await report();
  } finally {
    await cleanup();
  }
}

export async function runOnlyAfterTailReady<T>(ready: Promise<boolean>, action: () => Promise<T>) {
  if (!(await ready)) throw new Error('Tail readiness was not established; probes were not run.');
  return action();
}

type TailRecord = { id?: unknown; expires_at?: unknown; url?: unknown };

function parseTailRecords(value: unknown): TailRecord[] {
  const records = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return records.filter((record): record is TailRecord => !!record && typeof record === 'object');
}

async function readActiveTailIds(options: {
  accountId: string;
  workerName: string;
  token: string;
  fetchImplementation: typeof fetch;
}) {
  let response: Response;
  try {
    response = await options.fetchImplementation(
      `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/workers/scripts/${options.workerName}/tails`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${options.token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    throw new Error('Cloudflare GET Worker tails failed before a response.');
  }
  if (!response.ok) {
    let code = 'unavailable';
    try {
      const body = (await response.json()) as { errors?: Array<{ code?: unknown }> };
      const first = body.errors?.[0]?.code;
      if (typeof first === 'number') code = String(first);
    } catch {
      // Keep diagnostics limited to the HTTP status if Cloudflare returned no JSON.
    }
    throw new Error(`Cloudflare GET Worker tails returned HTTP ${response.status} (code ${code}).`);
  }
  let body: { success?: boolean; result?: unknown };
  try {
    body = (await response.json()) as { success?: boolean; result?: unknown };
  } catch {
    throw new Error('Cloudflare GET Worker tails returned invalid JSON.');
  }
  if (body.success !== true) throw new Error('Cloudflare GET Worker tails did not succeed.');
  return new Set(
    parseTailRecords(body.result)
      .map((record) => record.id)
      .filter((id): id is string => typeof id === 'string'),
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function waitForChildClose(child: Pick<ChildProcess, 'once'>) {
  return new Promise<TailExit>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

async function terminateTail(child: ChildProcess, exited: Promise<TailExit>) {
  if (child.exitCode !== null || child.signalCode !== null) return exited;
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGINT');
    else child.kill('SIGINT');
  } catch {
    child.kill('SIGINT');
  }
  const graceful = await Promise.race([exited, delay(3_000).then(() => null)]);
  if (graceful) return graceful;
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  return exited;
}

function countTailEvents(stdout: string) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    try {
      JSON.parse(line);
    } catch {
      throw new Error('Wrangler JSON tail returned a non-JSON event line.');
    }
  }
  return lines.length;
}

export type BoundedTailSessionOptions = {
  kind: TailCommandKind;
  workerName: string;
  versionId: string;
  configPath?: string;
  accountId: string;
  token: string;
  tempDirectory?: string;
  readinessTimeoutMs?: number;
  readyStabilityMs?: number;
  sessionDurationMs?: number;
  pollIntervalMs?: number;
  fetchImplementation?: typeof fetch;
  spawnImplementation?: typeof spawnProcess;
  onReady: () => Promise<void>;
};

export async function runBoundedTailSession(options: BoundedTailSessionOptions) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const spawnImplementation = options.spawnImplementation ?? spawnProcess;
  const baseTemp = options.tempDirectory ?? process.env.RUNNER_TEMP ?? os.tmpdir();
  const privateDirectory = mkdtempSync(path.join(baseTemp, 'trace-production-tail-'));
  chmodSync(privateDirectory, 0o700);
  const stdoutPath = path.join(privateDirectory, 'stdout.jsonl');
  const stderrPath = path.join(privateDirectory, 'stderr.txt');
  const exitPath = path.join(privateDirectory, 'exit.txt');
  const versionPath = path.join(privateDirectory, 'wrangler-version.txt');
  writeFileSync(versionPath, `${process.env.WRANGLER_VERSION ?? 'NOT_RECORDED'}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  const stdoutStream = createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
  const stderrStream = createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });
  const startTime = Date.now();
  let child: ChildProcess | undefined;
  let exit: TailExit = { code: null, signal: null };
  let exited: Promise<TailExit> | undefined;
  let childSpawnError: Error | undefined;
  let diagnosticsReported = false;
  let failureClass: TailFailureClass | undefined;

  const closeCaptureStreams = async () => {
    if (!stdoutStream.writableEnded)
      await new Promise<void>((resolve) => stdoutStream.end(resolve));
    if (!stderrStream.writableEnded)
      await new Promise<void>((resolve) => stderrStream.end(resolve));
  };

  const reportDiagnostics = async (reason = '') => {
    if (diagnosticsReported) return;
    diagnosticsReported = true;
    await closeCaptureStreams();
    writeExitCapture(exitPath, exit);
    const stdout = readFileSync(stdoutPath, 'utf8');
    const stderr = readFileSync(stderrPath, 'utf8');
    const safeReason = sanitizeTailDiagnostic(reason, options.token);
    const classifiedOutput = sanitizeTailDiagnostic(
      `${safeReason}\n${stderr}\n${stdout}`,
      options.token,
    );
    failureClass = classifyTailFailure(classifiedOutput, exit);
    const safeDiagnostic = sanitizeTailDiagnostic(
      `Reason: ${safeReason || '<none>'}\nStderr:\n${stderr || '<empty>'}\nStdout bytes: ${Buffer.byteLength(stdout, 'utf8')}`,
      options.token,
      8 * 1024,
    );
    console.error(`WRANGLER_VERSION=${process.env.WRANGLER_VERSION ?? 'NOT_RECORDED'}`);
    console.error(`TAIL_FAILURE_CLASS=${failureClass}`);
    console.error(`TAIL_EXIT_CODE=${exit.code ?? 'none'}`);
    console.error(`TAIL_EXIT_SIGNAL=${exit.signal ?? 'none'}`);
    console.error(
      `TAIL_SANITIZED_DIAGNOSTIC_BEGIN\n${safeDiagnostic}\nTAIL_SANITIZED_DIAGNOSTIC_END`,
    );
  };

  const cleanup = async () => {
    if (child && exited && child.exitCode === null && child.signalCode === null) {
      exit = (await terminateTail(child, exited)) ?? exit;
    }
    await closeCaptureStreams();
    rmSync(privateDirectory, { recursive: true, force: true });
    if (pathExists(privateDirectory))
      throw new Error('Tail diagnostic temporary files were not cleaned.');
  };

  try {
    const initialTailIds = await readActiveTailIds({
      accountId: options.accountId,
      workerName: options.workerName,
      token: options.token,
      fetchImplementation,
    });
    const args = buildWranglerTailArgs(
      options.kind,
      options.workerName,
      options.versionId,
      options.configPath,
    );
    child = spawnImplementation('pnpm', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: options.token,
        CLOUDFLARE_ACCOUNT_ID: options.accountId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    child.stdout?.pipe(stdoutStream);
    child.stderr?.pipe(stderrStream);
    child.on('error', (error) => {
      childSpawnError = error;
      stderrStream.write(`${error.name}: ${error.message}\n`);
    });
    exited = waitForChildClose(child);
    void exited.then((result) => {
      exit = result;
    });

    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    const readinessTimeoutMs = options.readinessTimeoutMs ?? 12_000;
    let activeTailId: string | undefined;
    while (Date.now() - startTime < readinessTimeoutMs) {
      const earlyExit = await Promise.race([
        exited.then((result) => result),
        delay(0).then(() => null),
      ]);
      if (earlyExit) {
        exit = earlyExit;
        if (childSpawnError) throw new Error('Wrangler tail process could not be started.');
        throw new Error('Wrangler tail process exited before tail readiness was established.');
      }
      const currentTailIds = await readActiveTailIds({
        accountId: options.accountId,
        workerName: options.workerName,
        token: options.token,
        fetchImplementation,
      });
      activeTailId = [...currentTailIds].find((id) => !initialTailIds.has(id));
      if (activeTailId) break;
      await delay(pollIntervalMs);
    }
    if (!activeTailId)
      throw new Error('Cloudflare did not report a new active Worker tail before timeout.');
    const readyExit = await Promise.race([
      exited.then((result) => result),
      delay(options.readyStabilityMs ?? 2_000).then(() => null),
    ]);
    if (readyExit) {
      exit = readyExit;
      throw new Error('Wrangler tail exited during the readiness stability window.');
    }
    const stillActive = await readActiveTailIds({
      accountId: options.accountId,
      workerName: options.workerName,
      token: options.token,
      fetchImplementation,
    });
    if (!stillActive.has(activeTailId))
      throw new Error('New Worker tail disappeared before probes.');

    await runOnlyAfterTailReady(Promise.resolve(true), options.onReady);
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, (options.sessionDurationMs ?? 20_000) - elapsed);
    const unexpectedExit = await Promise.race([
      exited.then((result) => result),
      delay(remaining).then(() => null),
    ]);
    if (unexpectedExit) {
      exit = unexpectedExit;
      throw new Error('Wrangler tail process exited before the bounded session completed.');
    }
    exit = (await terminateTail(child, exited)) ?? exit;
    await closeCaptureStreams();
    writeExitCapture(exitPath, exit);
    const stdout = readFileSync(stdoutPath, 'utf8');
    const errorEvents = countTailEvents(stdout);
    if (errorEvents !== 0)
      throw new Error(`Error-filtered tail observed ${errorEvents} Worker error event(s).`);
    if (
      (exit.code !== null && exit.code !== 0 && exit.code !== 130) ||
      (exit.signal !== null && exit.signal !== 'SIGINT')
    ) {
      throw new Error(`Wrangler tail exited with code ${exit.code}.`);
    }
    console.log(`TAIL_${options.kind.toUpperCase()}_READY=YES`);
    console.log(`TAIL_${options.kind.toUpperCase()}_VERSION=${options.versionId}`);
    console.log('TAIL_ERROR_EVENTS=0');
    return { ready: true as const, versionId: options.versionId, errorEvents };
  } catch (error) {
    if (child && exited && child.exitCode === null && child.signalCode === null) {
      exit = (await terminateTail(child, exited)) ?? exit;
    }
    const message = error instanceof Error ? error.message : 'Tail session failed unexpectedly.';
    const safeMessage = sanitizeTailDiagnostic(message, options.token);
    await reportBeforeCleanup(
      () => reportDiagnostics(safeMessage),
      async () => {
        await cleanup();
      },
    );
    const classifiedFailure = failureClass ?? classifyTailFailure(safeMessage, exit);
    console.error(`TAIL_SMOKE=${classifiedFailure}`);
    throw new Error(`${classifiedFailure}: ${safeMessage}`);
  } finally {
    if (!diagnosticsReported) {
      await cleanup();
    }
  }
}

function pathExists(filePath: string) {
  return existsSync(filePath);
}

function writeExitCapture(filePath: string, exit: TailExit) {
  writeFileSync(filePath, `code=${exit.code ?? 'none'}\nsignal=${exit.signal ?? 'none'}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'w',
  });
}
