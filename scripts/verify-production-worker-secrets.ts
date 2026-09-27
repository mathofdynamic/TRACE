import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  productionGitHubRuntimeVariableSources,
  productionWorkerSecretSources,
} from './production-canary-runtime-config.js';

export type ProductionWorkerSecretMetadataPhase = 'before' | 'after';

function readSecretNames(metadata: unknown) {
  if (!Array.isArray(metadata)) throw new Error('Worker secret metadata is not a JSON array.');
  const names = metadata.map((item) => {
    if (typeof item !== 'object' || item === null || !('name' in item)) {
      throw new Error('Worker secret metadata has an invalid entry.');
    }
    const { name } = item as { name?: unknown };
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Worker secret metadata has an invalid name.');
    }
    return name;
  });
  if (new Set(names).size !== names.length)
    throw new Error('Worker secret metadata has duplicate names.');
  return new Set(names);
}

export function assertProductionWorkerSecretNames(
  metadata: unknown,
  phase: ProductionWorkerSecretMetadataPhase,
) {
  const names = readSecretNames(metadata);
  const forbiddenNames = [
    'CLOUDFLARE_API_TOKEN',
    ...Object.values(productionGitHubRuntimeVariableSources),
  ];
  for (const name of names) {
    if (forbiddenNames.includes(name) || name.startsWith('TRACE_GITHUB_')) {
      throw new Error(`Unexpected production Worker secret name: ${name}.`);
    }
    if (Object.hasOwn(productionGitHubRuntimeVariableSources, name)) {
      throw new Error(
        `Production runtime variable is incorrectly stored as a Worker secret: ${name}.`,
      );
    }
  }

  if (phase === 'after') {
    for (const name of Object.keys(productionWorkerSecretSources)) {
      if (!names.has(name))
        throw new Error(`Required production Worker secret is absent: ${name}.`);
    }
  }
  return [...names].sort();
}

function parseArguments(arguments_: string[]) {
  if (
    arguments_.length !== 4 ||
    arguments_[0] !== '--phase' ||
    !['before', 'after'].includes(arguments_[1] ?? '') ||
    arguments_[2] !== '--input' ||
    !arguments_[3]
  ) {
    throw new Error(
      'Usage: verify-production-worker-secrets --phase before|after --input <json path>.',
    );
  }
  return { phase: arguments_[1] as ProductionWorkerSecretMetadataPhase, input: arguments_[3] };
}

async function main() {
  try {
    const { phase, input } = parseArguments(process.argv.slice(2));
    const metadata = JSON.parse(readFileSync(input, 'utf8')) as unknown;
    const names = assertProductionWorkerSecretNames(metadata, phase);
    console.log(`Production Worker secret-name metadata passed (${phase}; ${names.length} names).`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production Worker secret metadata check failed.',
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
