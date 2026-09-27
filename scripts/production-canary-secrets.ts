import { chmodSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionWorkerSecretSources } from './production-canary-runtime-config.js';

export function buildProductionWorkerSecrets(
  environment: Record<string, string | undefined>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [runtimeName, sourceName] of Object.entries(productionWorkerSecretSources)) {
    const value = environment[sourceName];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Required production Worker secret is missing: ${sourceName}.`);
    }
    values[runtimeName] = value;
  }
  return values;
}

function isContainedPath(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export function writeProductionWorkerSecretsFile(
  outputPath: string,
  environment: Record<string, string | undefined>,
) {
  const runnerTemp = environment.RUNNER_TEMP;
  if (!runnerTemp) throw new Error('RUNNER_TEMP is required for temporary Worker secrets.');

  let tempRoot: string;
  let outputDirectory: string;
  try {
    tempRoot = realpathSync(runnerTemp);
    outputDirectory = realpathSync(path.dirname(path.resolve(outputPath)));
  } catch {
    throw new Error('Temporary Worker secrets directory is unavailable.');
  }
  if (!isContainedPath(tempRoot, outputDirectory)) {
    throw new Error('Worker secrets output must remain inside RUNNER_TEMP.');
  }

  const values = buildProductionWorkerSecrets(environment);
  const resolvedOutputPath = path.resolve(outputPath);
  if (!isContainedPath(tempRoot, resolvedOutputPath)) {
    throw new Error('Worker secrets output must remain inside RUNNER_TEMP.');
  }
  try {
    writeFileSync(resolvedOutputPath, `${JSON.stringify(values)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    if (process.platform !== 'win32') chmodSync(resolvedOutputPath, 0o600);
  } catch {
    throw new Error('Unable to create the temporary production Worker secrets file.');
  }
  return Object.keys(values);
}

function parseOutputArgument(arguments_: string[]) {
  if (arguments_.length !== 2 || arguments_[0] !== '--output' || !arguments_[1]) {
    throw new Error('Usage: write-production-canary-secrets --output <RUNNER_TEMP path>.');
  }
  return arguments_[1];
}

function main() {
  try {
    const outputPath = parseOutputArgument(process.argv.slice(2));
    const names = writeProductionWorkerSecretsFile(outputPath, process.env);
    console.log(`Temporary production Worker secrets prepared (${names.length} names).`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unable to prepare production Worker secrets.',
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
