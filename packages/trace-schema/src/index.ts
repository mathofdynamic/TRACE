import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

export const schemaVersion = '0.1';

export const evidenceReferenceSchema = z.object({
  type: z.enum([
    'repository',
    'branch',
    'commit',
    'pull_request',
    'issue',
    'file',
    'line',
    'symbol',
    'check',
    'decision',
    'risk',
    'url',
  ]),
  locator: z.string().min(1),
  label: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const repositoryIdentitySchema = z.object({
  provider: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  default_branch: z.string().min(1).optional(),
});

export const artifactMetadataSchema = z
  .object({
    schema_version: z.literal(schemaVersion),
    id: z.string().regex(/^[a-z][a-z0-9-]{2,80}$/),
    artifact_type: z.enum([
      'config',
      'daily_report',
      'weekly_report',
      'pr_brief',
      'decision',
      'risk',
      'debt',
      'conflict',
      'rule',
      'index',
      'open_pr_state',
      'sync_state',
    ]),
    repository: repositoryIdentitySchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    generator: z.string().min(1),
    execution_origin: z.enum(['cloud', 'local', 'ci', 'third_party']),
    source_refs: z.array(evidenceReferenceSchema).default([]),
    evidence: z.array(evidenceReferenceSchema).default([]),
    finding_classification: z
      .enum(['deterministic', 'correlated', 'semantic', 'uncertain'])
      .optional(),
    review_status: z
      .enum(['draft', 'pending', 'accepted', 'rejected', 'superseded'])
      .default('draft'),
    sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
    sync_policy: z
      .enum(['local_only', 'allowlisted', 'dashboard_overlay', 'repository_authoritative'])
      .default('repository_authoritative'),
    supersedes: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,80}$/)
      .optional(),
    superseded_by: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,80}$/)
      .optional(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export type TraceArtifact = {
  metadata: ArtifactMetadata;
  markdown: string;
  filePath?: string;
};

export type ValidationIssue = {
  path: string;
  message: string;
  remediation: string;
};

export function validateArtifactMetadata(input: unknown) {
  return artifactMetadataSchema.safeParse(input);
}

export function checksum(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableArtifactId(prefix: string, seed: string) {
  const digest = checksum(seed).slice(0, 16);
  return `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${digest}`;
}

export function serializeArtifact(metadata: ArtifactMetadata, markdown: string) {
  if (markdown.includes('\u0000') || /<script\b/i.test(markdown))
    throw new Error('Unsafe Markdown content is not allowed.');
  const parsed = artifactMetadataSchema.parse(metadata);
  const normalizedBody = markdown.replace(/\r\n/g, '\n').trimEnd() + '\n';
  return `---\n${stringify(parsed, { sortMapEntries: true })}---\n\n${normalizedBody}`;
}

export function parseArtifact(source: string): TraceArtifact {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n'))
    throw new Error('Artifact must start with YAML front matter.');
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Artifact front matter is not closed.');
  const metadata = artifactMetadataSchema.parse(parse(normalized.slice(4, end)));
  return { metadata, markdown: normalized.slice(end + 5).replace(/^\n/, '') };
}

function checkedPath(root: string, candidate: string) {
  const rootPath = resolve(root);
  const target = resolve(rootPath, candidate);
  const distance = relative(rootPath, target);
  if (isAbsolute(distance) || distance === '..' || distance.startsWith(`..${sep}`))
    throw new Error('Path escapes the .trace root.');
  return target;
}

async function assertNoSymlinkEscape(root: string, target: string) {
  const rootPath = await realpath(root);
  let current = rootPath;
  const parts = relative(rootPath, target).split(sep).filter(Boolean);
  for (const part of parts) {
    current = join(current, part);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink())
        throw new Error('Symlink paths are not allowed for artifact writes.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export async function writeArtifact(options: {
  traceRoot: string;
  relativePath: string;
  metadata: ArtifactMetadata;
  markdown: string;
  overwrite?: boolean;
  dryRun?: boolean;
}) {
  const root = resolve(options.traceRoot);
  await mkdir(root, { recursive: true });
  const target = checkedPath(root, options.relativePath);
  await assertNoSymlinkEscape(root, target);
  const content = serializeArtifact(options.metadata, options.markdown);
  if (options.dryRun) return { path: target, content, checksum: checksum(content), dryRun: true };
  try {
    await lstat(target);
    if (!options.overwrite) throw new Error(`Artifact already exists: ${options.relativePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, target);
  return { path: target, content, checksum: checksum(content), dryRun: false };
}

export async function validateTraceDirectory(traceRoot: string) {
  const issues: ValidationIssue[] = [];
  const root = resolve(traceRoot);
  try {
    await realpath(root);
  } catch {
    return [
      {
        path: '.',
        message: 'TRACE directory does not exist.',
        remediation: 'Create a .trace directory before validating.',
      },
    ];
  }
  const walk = async (directory: string) => {
    const entries = await (
      await import('node:fs/promises')
    ).readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        issues.push({
          path: relative(root, fullPath),
          message: 'Symlinks are not allowed in validated artifacts.',
          remediation: 'Replace the symlink with a regular file or directory.',
        });
      } else if (entry.isDirectory()) await walk(fullPath);
      else if (entry.name.endsWith('.md')) {
        try {
          parseArtifact(await readFile(fullPath, 'utf8'));
        } catch (error) {
          issues.push({
            path: relative(root, fullPath),
            message: error instanceof Error ? error.message : String(error),
            remediation: 'Repair YAML front matter and validate against spec v0.1.',
          });
        }
      }
    }
  };
  await walk(root);
  return issues;
}
