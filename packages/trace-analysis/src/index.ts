import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { EvidenceClassification, NormalizedChangeSet } from '@trace/core';
import { validateTraceDirectory } from '@trace/schema';
import {
  createFakeProvider,
  semanticAnalysisSchema,
  type ModelProvider,
  type SemanticAnalysis,
} from '@trace/models';

export type AnalysisStage =
  | 'normalize'
  | 'change-set'
  | 'inspect'
  | 'parse'
  | 'graph'
  | 'enrich'
  | 'context'
  | 'checks'
  | 'semantic'
  | 'verify';

export type StageTiming = {
  stage: AnalysisStage;
  durationMs: number;
  status: 'completed' | 'skipped' | 'failed';
  errorCode?: string;
};

export type WorkspaceOptions = {
  root: string;
  maxFileBytes?: number;
  ignoredPaths?: string[];
  signal?: AbortSignal;
};

export type WorkspaceFile = {
  path: string;
  bytes: number;
  binary: boolean;
  language: 'typescript' | 'javascript' | 'other';
};

const DEFAULT_IGNORES = [
  '.git',
  '.trace-cache',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  'generated',
  'public/assets',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const TEST_PATTERN = /(^|[./\\])([^/\\]+\.(test|spec)\.[cm]?[jt]sx?$|__tests__([/\\]|$))/i;
const SECRET_PATTERN = /(password|secret|token|api[_-]?key|private[_-]?key|authorization)/i;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('ANALYSIS_CANCELLED');
}

function normalizeRelative(root: string, candidate: string) {
  const absolute = resolve(root, candidate);
  const rel = relative(resolve(root), absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('WORKSPACE_PATH_ESCAPE');
  }
  return rel.replaceAll('\\', '/');
}

function languageFor(path: string): WorkspaceFile['language'] {
  return SOURCE_EXTENSIONS.has(extname(path).toLowerCase())
    ? extname(path).toLowerCase().includes('js')
      ? 'javascript'
      : 'typescript'
    : 'other';
}

function looksBinary(buffer: Buffer) {
  return buffer.includes(0);
}

export class RepositoryWorkspace {
  readonly root: string;
  readonly maxFileBytes: number;
  readonly ignoredPaths: string[];
  private readonly signal?: AbortSignal;

  constructor(options: WorkspaceOptions) {
    this.root = resolve(options.root);
    this.maxFileBytes = options.maxFileBytes ?? 512_000;
    this.ignoredPaths = [...DEFAULT_IGNORES, ...(options.ignoredPaths ?? [])];
    this.signal = options.signal;
  }

  private isIgnored(path: string) {
    return this.ignoredPaths.some(
      (ignored) =>
        path === ignored ||
        path.startsWith(`${ignored}/`) ||
        path.includes(`/${ignored}/`) ||
        path.endsWith(`/${ignored}`),
    );
  }

  async listFiles(): Promise<WorkspaceFile[]> {
    const result: WorkspaceFile[] = [];
    const visit = async (directory: string) => {
      throwIfAborted(this.signal);
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = join(directory, entry.name);
        const path = normalizeRelative(this.root, absolute);
        if (this.isIgnored(path)) continue;
        const stats = await lstat(absolute);
        if (stats.isSymbolicLink()) continue;
        if (stats.isDirectory()) {
          await visit(absolute);
          continue;
        }
        if (!stats.isFile()) continue;
        const buffer = await readFile(absolute);
        result.push({
          path,
          bytes: buffer.byteLength,
          binary: looksBinary(buffer),
          language: languageFor(path),
        });
      }
    };
    await visit(this.root);
    return result;
  }

  async readText(path: string) {
    throwIfAborted(this.signal);
    const normalized = normalizeRelative(this.root, path);
    if (this.isIgnored(normalized) || SECRET_PATTERN.test(normalized)) {
      throw new Error('WORKSPACE_FILE_EXCLUDED');
    }
    const absolute = join(this.root, normalized);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('WORKSPACE_FILE_UNSAFE');
    if (stats.size > this.maxFileBytes) throw new Error('WORKSPACE_FILE_TOO_LARGE');
    const buffer = await readFile(absolute);
    if (looksBinary(buffer)) throw new Error('WORKSPACE_FILE_BINARY');
    return buffer.toString('utf8');
  }
}

export class AnalysisCache {
  readonly root: string;
  readonly tenantNamespace: string;
  readonly parserVersion: string;

  constructor(options: { root: string; tenantKey: string; parserVersion?: string }) {
    this.root = resolve(options.root);
    this.tenantNamespace = createHash('sha256')
      .update(options.tenantKey)
      .digest('hex')
      .slice(0, 24);
    this.parserVersion = options.parserVersion ?? ts.version;
  }

  key(path: string, content: string) {
    return createHash('sha256').update(`${this.parserVersion}\0${path}\0${content}`).digest('hex');
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const record = JSON.parse(
        await readFile(join(this.root, this.tenantNamespace, `${key}.json`), 'utf8'),
      ) as { parserVersion?: string; value?: T };
      return record.parserVersion === this.parserVersion ? record.value : undefined;
    } catch {
      return undefined;
    }
  }

  async put<T>(key: string, value: T) {
    const directory = join(this.root, this.tenantNamespace);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${key}.json`),
      JSON.stringify({
        parserVersion: this.parserVersion,
        createdAt: new Date().toISOString(),
        value,
      }),
      'utf8',
    );
  }
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'method'
  | 'variable'
  | 'export';

export type ParsedSymbol = {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  signature?: string;
};

export type ParsedFile = {
  path: string;
  language: 'typescript' | 'javascript';
  isTest: boolean;
  imports: string[];
  exports: string[];
  symbols: ParsedSymbol[];
  routePattern?: string;
  packageBoundary?: string;
  schemaLike: boolean;
  migrationLike: boolean;
};

function lineOf(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function declarationName(node: ts.Node) {
  return ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
    ? node.name?.getText()
    : ts.isVariableStatement(node)
      ? node.declarationList.declarations[0]?.name.getText()
      : undefined;
}

function parseSourceFile(
  path: string,
  sourceText: string,
  language: 'typescript' | 'javascript',
): ParsedFile {
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: ParsedSymbol[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      exports.push(node.moduleSpecifier.text);
    }
    if (ts.isExportAssignment(node)) exports.push('default');
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isVariableStatement(node)
    ) {
      const name = declarationName(node);
      if (name) {
        const kind: SymbolKind = ts.isFunctionDeclaration(node)
          ? 'function'
          : ts.isClassDeclaration(node)
            ? 'class'
            : ts.isInterfaceDeclaration(node)
              ? 'interface'
              : ts.isTypeAliasDeclaration(node)
                ? 'type'
                : 'variable';
        const exported =
          node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
          false;
        const signature = node.getText(source).split('\n')[0] ?? '';
        symbols.push({
          name,
          kind,
          line: lineOf(source, node),
          exported,
          signature: signature.slice(0, 300),
        });
        if (exported) exports.push(name);
      }
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      symbols.push({
        name: node.name.getText(source),
        kind: 'method',
        line: lineOf(source, node),
        exported: false,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const routePattern = /(^|[/\\])app[/\\].*route\.[cm]?[jt]sx?$/.test(path)
    ? path.replaceAll('\\', '/')
    : undefined;
  return {
    path,
    language,
    isTest: TEST_PATTERN.test(path),
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    symbols,
    routePattern,
    packageBoundary: path.includes('/packages/')
      ? (path.split('/packages/')[1]?.split('/')[0] ?? undefined)
      : undefined,
    schemaLike: /(schema|migration|drizzle|prisma)/i.test(path),
    migrationLike: /(migration|migrate)/i.test(path),
  };
}

export type GraphNode = { id: string; kind: 'file' | 'symbol' | 'package'; label: string };
export type GraphEdge = {
  from: string;
  to: string;
  relation: 'imports' | 'exports' | 'contains' | 'package';
  confidence: 'high' | 'medium' | 'low';
};
export type AffectedGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

function buildGraph(files: ParsedFile[]): AffectedGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const add = (node: GraphNode) => nodes.push(node);
  const byImport = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    const fileId = `file:${file.path}`;
    add({ id: fileId, kind: 'file', label: file.path });
    if (file.packageBoundary) {
      const packageId = `package:${file.packageBoundary}`;
      if (!nodes.some((node) => node.id === packageId))
        add({ id: packageId, kind: 'package', label: file.packageBoundary });
      edges.push({ from: fileId, to: packageId, relation: 'package', confidence: 'high' });
    }
    for (const symbol of file.symbols) {
      const symbolId = `symbol:${file.path}#${symbol.name}`;
      add({ id: symbolId, kind: 'symbol', label: symbol.name });
      edges.push({ from: fileId, to: symbolId, relation: 'contains', confidence: 'high' });
      if (symbol.exported)
        edges.push({ from: symbolId, to: fileId, relation: 'exports', confidence: 'high' });
    }
    for (const imported of file.imports) {
      const target = imported.startsWith('.')
        ? resolveImport(file.path, imported, byImport)
        : undefined;
      if (target)
        edges.push({
          from: fileId,
          to: `file:${target}`,
          relation: 'imports',
          confidence: 'medium',
        });
    }
  }
  return { nodes, edges };
}

function resolveImport(from: string, specifier: string, files: Map<string, ParsedFile>) {
  const base = resolve('/', from, '..', specifier).replace(/^\//, '');
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${base}${extension}`),
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  return candidates.find((candidate) => files.has(candidate));
}

export type ContextItem = {
  id: string;
  kind: 'file' | 'symbol' | 'rule' | 'artifact' | 'commit' | 'change';
  label: string;
  relevance: number;
  reason: string;
};

export type DeterministicFinding = {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  classification: EvidenceClassification;
  checkId: string;
  evidenceIds: string[];
};

export type AnalysisResult = {
  analysisId: string;
  input: { repositoryRoot: string; headRef?: string };
  parserCoverage: {
    supportedFiles: number;
    unsupportedFiles: number;
    symbols: number;
    precision: 'symbol' | 'file';
  };
  parsedFiles: ParsedFile[];
  graph: AffectedGraph;
  deterministicFacts: {
    changedProductionFiles: string[];
    changedTestFiles: string[];
    dependencyChanges: string[];
    schemaChanges: string[];
  };
  context: { items: ContextItem[]; budget: number; truncated: boolean; warnings: string[] };
  findings: DeterministicFinding[];
  semantic?: SemanticAnalysis;
  conflicts: Array<{ statement: string; evidenceIds: string[] }>;
  proposedArtifacts: Array<{ type: string; reason: string }>;
  timings: StageTiming[];
  warnings: string[];
  provenance: {
    engine: string;
    parser: string;
    semanticProvider?: string;
    sourceCodeSentToProvider: boolean;
  };
};

export type AnalysisOptions = {
  root: string;
  changeSet: NormalizedChangeSet;
  signal?: AbortSignal;
  contextBudget?: number;
  modelProvider?: ModelProvider;
  withSemantic?: boolean;
  maxFileBytes?: number;
  cacheRoot?: string;
  tenantKey?: string;
};

async function timed<T>(timings: StageTiming[], stage: AnalysisStage, fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const value = await fn();
    timings.push({ stage, durationMs: Date.now() - started, status: 'completed' });
    return value;
  } catch (error) {
    timings.push({
      stage,
      durationMs: Date.now() - started,
      status: 'failed',
      errorCode: error instanceof Error ? error.message : 'UNKNOWN',
    });
    throw error;
  }
}

function evidenceId(kind: string, value: string) {
  return `${kind}:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function selectContext(
  files: ParsedFile[],
  changeSet: NormalizedChangeSet,
  budget: number,
): AnalysisResult['context'] {
  const changed = new Set(changeSet.changedFiles.map((file) => file.path.replaceAll('\\', '/')));
  const items: ContextItem[] = [];
  for (const file of files) {
    const direct = changed.has(file.path);
    const relevance = direct
      ? 100
      : file.isTest
        ? 65
        : file.schemaLike
          ? 55
          : file.imports.length
            ? 35
            : 10;
    if (direct || relevance >= 50) {
      items.push({
        id: evidenceId('file', file.path),
        kind: 'file',
        label: file.path,
        relevance,
        reason: direct
          ? 'changed file'
          : file.isTest
            ? 'test connected by naming convention'
            : 'schema or migration context',
      });
    }
    for (const symbol of file.symbols.filter((item) => item.exported && direct)) {
      items.push({
        id: evidenceId('symbol', `${file.path}#${symbol.name}`),
        kind: 'symbol',
        label: `${file.path}#${symbol.name}`,
        relevance: 110,
        reason: 'exported symbol in changed file',
      });
    }
  }
  const sorted = items.sort((a, b) => b.relevance - a.relevance || a.label.localeCompare(b.label));
  const selected = sorted.slice(0, budget);
  return {
    items: selected,
    budget,
    truncated: selected.length < sorted.length,
    warnings: selected.length < sorted.length ? [`Context capped at ${budget} items`] : [],
  };
}

function runChecks(
  files: ParsedFile[],
  changeSet: NormalizedChangeSet,
  context: AnalysisResult['context'],
  traceValid: boolean,
): DeterministicFinding[] {
  const changed = changeSet.changedFiles.map((file) => file.path.replaceAll('\\', '/'));
  const changedProductionFiles = files.filter(
    (file) => changed.includes(file.path) && !file.isTest && !file.path.endsWith('.md'),
  );
  const changedTests = files.filter((file) => changed.includes(file.path) && file.isTest);
  const findings: DeterministicFinding[] = [];
  const add = (
    checkId: string,
    title: string,
    detail: string,
    severity: DeterministicFinding['severity'],
    evidence: string[],
  ) => {
    findings.push({
      id: evidenceId(checkId, `${title}:${detail}`),
      title,
      detail,
      severity,
      classification: 'deterministic',
      checkId,
      evidenceIds: evidence,
    });
  };
  if (changedProductionFiles.length > 0 && changedTests.length === 0) {
    add(
      'tests.related',
      'Production change has no changed test file',
      'No test file was changed or detected by convention in this change set.',
      'medium',
      changedProductionFiles.map((file) => evidenceId('file', file.path)),
    );
  }
  const dependencyChanges = changed.filter((path) =>
    /(^|[/\\])(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path),
  );
  if (dependencyChanges.length)
    add(
      'dependency.change',
      'Dependency metadata changed',
      'Review package and lockfile changes for compatibility and supply-chain impact.',
      'low',
      dependencyChanges.map((path) => evidenceId('file', path)),
    );
  const schemaChanges = changed.filter((path) => /(schema|migration|drizzle|prisma)/i.test(path));
  if (schemaChanges.length)
    add(
      'schema.change',
      'Schema or migration changed',
      'Database or schema changes require migration and rollback evidence.',
      'medium',
      schemaChanges.map((path) => evidenceId('file', path)),
    );
  const publicChanges = files.filter(
    (file) => changed.includes(file.path) && file.exports.length > 0,
  );
  if (publicChanges.length)
    add(
      'api.public-export',
      'Public export surface changed',
      'The parser found exported declarations in changed files; review compatibility impact.',
      'low',
      publicChanges.map((file) => evidenceId('file', file.path)),
    );
  if (!traceValid)
    add(
      'trace.invalid',
      'TRACE artifacts are invalid',
      'The repository contains invalid .trace artifacts; analysis evidence may be incomplete.',
      'high',
      [evidenceId('file', '.trace')],
    );
  if (context.truncated)
    add(
      'context.truncated',
      'Analysis context was bounded',
      'Some lower-relevance context was excluded by the configured budget.',
      'info',
      [],
    );
  return findings;
}

function verifyFindings(
  findings: DeterministicFinding[],
  context: AnalysisResult['context'],
): DeterministicFinding[] {
  const known = new Set(context.items.map((item) => item.id));
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.checkId}:${finding.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return finding.evidenceIds.every(
      (id) =>
        id.startsWith('file:') || id.startsWith('symbol:') || known.has(id) || id === 'file:.trace',
    );
  });
}

export async function analyzeChanges(options: AnalysisOptions): Promise<AnalysisResult> {
  const timings: StageTiming[] = [];
  const workspace = new RepositoryWorkspace({
    root: options.root,
    maxFileBytes: options.maxFileBytes,
    signal: options.signal,
  });
  const normalized = await timed(timings, 'normalize', async () => {
    throwIfAborted(options.signal);
    return {
      ...options.changeSet,
      changedFiles: options.changeSet.changedFiles.map((file) => ({
        ...file,
        path: file.path.replaceAll('\\', '/'),
      })),
    };
  });
  await timed(timings, 'change-set', async () => normalized);
  const files = await timed(timings, 'inspect', () => workspace.listFiles());
  const cache = options.cacheRoot
    ? new AnalysisCache({
        root: options.cacheRoot,
        tenantKey: options.tenantKey ?? normalized.repository.root,
      })
    : undefined;
  const parsedFiles = await timed(timings, 'parse', async () => {
    const result: ParsedFile[] = [];
    for (const file of files) {
      throwIfAborted(options.signal);
      if (file.binary || file.language === 'other' || SECRET_PATTERN.test(file.path)) continue;
      try {
        const sourceText = await workspace.readText(file.path);
        const key = cache?.key(file.path, sourceText);
        const cached = key ? await cache?.get<ParsedFile>(key) : undefined;
        const parsed = cached ?? parseSourceFile(file.path, sourceText, file.language);
        if (!cached && key) await cache?.put(key, parsed);
        result.push(parsed);
      } catch {
        // A file that cannot be safely read remains outside the analysis context.
      }
    }
    return result;
  });
  const graph = await timed(timings, 'graph', async () => buildGraph(parsedFiles));
  await timed(timings, 'enrich', async () =>
    files.filter((file) => file.path === 'CODEOWNERS' || file.path.endsWith('.trace/config.yml')),
  );
  const context = await timed(timings, 'context', async () =>
    selectContext(parsedFiles, normalized, options.contextBudget ?? 80),
  );
  const traceRoot = join(options.root, '.trace');
  const traceValidation = await validateTraceDirectory(traceRoot).catch(() => []);
  const findings = await timed(timings, 'checks', async () =>
    runChecks(parsedFiles, normalized, context, traceValidation.length === 0),
  );
  let semantic: SemanticAnalysis | undefined;
  let semanticProvider: string | undefined;
  let sourceCodeSentToProvider = false;
  if (options.withSemantic) {
    const provider = options.modelProvider ?? createFakeProvider();
    const semanticResult = await timed(timings, 'semantic', () =>
      provider.generateStructured({
        task: 'Summarize the change and identify only evidence-backed semantic observations.',
        context: {
          changeSet: normalized,
          contextManifest: context.items.map((item) => ({
            id: item.id,
            label: item.label,
            reason: item.reason,
          })),
          findings: findings.map(({ id, title, evidenceIds }) => ({ id, title, evidenceIds })),
        },
        schema: semanticAnalysisSchema,
        signal: options.signal,
      }),
    );
    semantic = semanticResult.value;
    semanticProvider = semanticResult.provider;
    sourceCodeSentToProvider = semanticResult.dataPolicy.sourceCodeSent;
  } else {
    timings.push({ stage: 'semantic', durationMs: 0, status: 'skipped' });
  }
  const verifiedFindings = await timed(timings, 'verify', async () =>
    verifyFindings(findings, context),
  );
  const unsupported = files.filter((file) => file.language === 'other' && !file.binary).length;
  return {
    analysisId: evidenceId(
      'analysis',
      `${normalized.repository.root}:${normalized.headRef ?? 'working-tree'}:${normalized.changedFiles.map((file) => file.path).join(',')}`,
    ),
    input: { repositoryRoot: options.root, headRef: normalized.headRef },
    parserCoverage: {
      supportedFiles: parsedFiles.length,
      unsupportedFiles: unsupported,
      symbols: parsedFiles.reduce((sum, file) => sum + file.symbols.length, 0),
      precision: parsedFiles.length ? 'symbol' : 'file',
    },
    parsedFiles,
    graph,
    deterministicFacts: {
      changedProductionFiles: parsedFiles
        .filter(
          (file) =>
            normalized.changedFiles.some((changed) => changed.path === file.path) && !file.isTest,
        )
        .map((file) => file.path),
      changedTestFiles: parsedFiles
        .filter(
          (file) =>
            normalized.changedFiles.some((changed) => changed.path === file.path) && file.isTest,
        )
        .map((file) => file.path),
      dependencyChanges: normalized.changedFiles
        .map((file) => file.path)
        .filter((path) =>
          /(^|[/\\])(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path),
        ),
      schemaChanges: normalized.changedFiles
        .map((file) => file.path)
        .filter((path) => /(schema|migration|drizzle|prisma)/i.test(path)),
    },
    context,
    findings: verifiedFindings,
    semantic,
    conflicts: semantic?.conflictCandidates ?? [],
    proposedArtifacts: [
      {
        type: 'analysis-run',
        reason: 'Analysis output is available to a later policy-controlled artifact stage.',
      },
    ],
    timings,
    warnings: [
      ...context.warnings,
      ...(unsupported
        ? [`${unsupported} unsupported files received file-level or no analysis`]
        : []),
    ],
    provenance: {
      engine: 'trace-analysis@0.1',
      parser: `typescript@${ts.version}`,
      semanticProvider,
      sourceCodeSentToProvider,
    },
  };
}

export const analysisPipeline = [
  'normalize',
  'change-set',
  'inspect',
  'parse',
  'graph',
  'enrich',
  'context',
  'checks',
  'semantic',
  'verify',
] as const;

export type PullRequestTrigger =
  | 'opened'
  | 'reopened'
  | 'synchronized'
  | 'manual'
  | 'rereview'
  | 'merged';

export type PullRequestInput = {
  provider: string;
  owner: string;
  repository: string;
  number: number;
  title: string;
  description?: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  trigger: PullRequestTrigger;
  linkedIssues?: Array<{ number: number; title: string; url?: string }>;
  checks?: Array<{
    name: string;
    status: 'queued' | 'running' | 'success' | 'failure';
    url?: string;
  }>;
  reviewers?: string[];
  labels?: string[];
};

export type PullRequestReviewState =
  | 'collecting'
  | 'analyzing'
  | 'needs_context'
  | 'needs_human_review'
  | 'changes_recommended'
  | 'no_material_findings'
  | 'outdated'
  | 'failed'
  | 'merged';

export type PullRequestBrief = {
  idempotencyKey: string;
  input: PullRequestInput;
  state: PullRequestReviewState;
  statedGoal: {
    value?: string;
    source: 'linked_issue' | 'description' | 'commit' | 'inferred' | 'missing';
    confidence: 'high' | 'medium' | 'low';
  };
  semanticSummary?: string;
  affectedFiles: string[];
  findings: DeterministicFinding[];
  evidence: ContextItem[];
  testEvidence: string[];
  limitations: string[];
  provenance: AnalysisResult['provenance'];
  generatedAt: string;
};

export type PublicationPolicy = {
  maxPublishedFindings: number;
  allowSummaryComment: boolean;
  allowInlineComments: boolean;
  minimumInlineSeverity: 'low' | 'medium' | 'high';
  allowedSemanticConfidence: Array<'high' | 'medium' | 'low'>;
};

export const defaultPublicationPolicy: PublicationPolicy = {
  maxPublishedFindings: 5,
  allowSummaryComment: false,
  allowInlineComments: false,
  minimumInlineSeverity: 'medium',
  allowedSemanticConfidence: ['high'],
};

export function pullRequestIdempotencyKey(input: PullRequestInput, profile = 'default') {
  return createHash('sha256')
    .update(
      `${input.provider}:${input.owner}/${input.repository}#${input.number}:${input.headSha}:${profile}:0.1`,
    )
    .digest('hex');
}

function statedGoal(
  input: PullRequestInput,
  analysis: AnalysisResult,
): PullRequestBrief['statedGoal'] {
  const linked = input.linkedIssues?.find((issue) => issue.title.trim());
  if (linked) return { value: linked.title.trim(), source: 'linked_issue', confidence: 'high' };
  const description = input.description?.match(/(?:goal|intent|purpose)\s*:\s*(.+)/i)?.[1]?.trim();
  if (description) return { value: description, source: 'description', confidence: 'high' };
  if (analysis.semantic?.intent)
    return {
      value: analysis.semantic.intent.statement,
      source: 'inferred',
      confidence: analysis.semantic.intent.confidence,
    };
  return { source: 'missing', confidence: 'low' };
}

export function createPullRequestBrief(
  input: PullRequestInput,
  analysis: AnalysisResult,
  profile = 'default',
): PullRequestBrief {
  const material = analysis.findings.filter(
    (finding) => finding.severity === 'medium' || finding.severity === 'high',
  );
  const state: PullRequestReviewState =
    input.trigger === 'merged'
      ? 'merged'
      : input.headRef !== analysis.input.headRef && analysis.input.headRef
        ? 'outdated'
        : material.length
          ? 'changes_recommended'
          : analysis.semantic?.questions.length
            ? 'needs_human_review'
            : 'no_material_findings';
  return {
    idempotencyKey: pullRequestIdempotencyKey(input, profile),
    input,
    state,
    statedGoal: statedGoal(input, analysis),
    semanticSummary: analysis.semantic?.summary,
    affectedFiles: analysis.parsedFiles.filter((file) => input.headSha).map((file) => file.path),
    findings: analysis.findings,
    evidence: analysis.context.items,
    testEvidence: analysis.deterministicFacts.changedTestFiles,
    limitations: analysis.warnings,
    provenance: analysis.provenance,
    generatedAt: new Date().toISOString(),
  };
}

export function selectPublishedFindings(
  findings: DeterministicFinding[],
  policy = defaultPublicationPolicy,
) {
  const severityRank = { high: 3, medium: 2, low: 1, info: 0 };
  return [...findings]
    .filter(
      (finding) => severityRank[finding.severity] >= severityRank[policy.minimumInlineSeverity],
    )
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id))
    .slice(0, policy.maxPublishedFindings);
}

export function renderPullRequestBrief(brief: PullRequestBrief, policy = defaultPublicationPolicy) {
  const published = selectPublishedFindings(brief.findings, policy);
  const goal = brief.statedGoal.value ?? 'No explicit goal was supplied.';
  const findings = published.length
    ? published
        .map(
          (finding) =>
            `- **${finding.severity.toUpperCase()}** ${finding.title} (${finding.classification})`,
        )
        .join('\n')
    : '- No material deterministic findings were published.';
  return `# Pull request brief\n\n- Repository: **${brief.input.owner}/${brief.input.repository}#${brief.input.number}**\n- Head: \`${brief.input.headSha}\`\n- State: **${brief.state}**\n\n## Stated goal\n\n${goal}\n\n## Summary\n\n${brief.semanticSummary ?? 'Semantic analysis was not requested or was unavailable.'}\n\n## Reviewer attention\n\n${findings}\n\n## Evidence\n\n${brief.evidence.length} bounded context items selected. Test files observed: ${brief.testEvidence.length}.\n\n## Limitations\n\n${brief.limitations.length ? brief.limitations.map((item) => `- ${item}`).join('\n') : '- None recorded.'}\n\n<!-- TRACE:managed-pr-brief:start -->\nGenerated by TRACE. This section is updateable; human comments outside the managed section are preserved.\n<!-- TRACE:managed-pr-brief:end -->\n`;
}

export function mergeManagedBrief(existing: string, generated: string) {
  const start = '<!-- TRACE:managed-pr-brief:start -->';
  const end = '<!-- TRACE:managed-pr-brief:end -->';
  const startIndex = existing.indexOf(start);
  const endIndex = existing.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    const generatedStart = generated.indexOf(start);
    const generatedSection = generatedStart >= 0 ? generated.slice(generatedStart) : generated;
    return `${existing.slice(0, startIndex)}${generatedSection}`;
  }
  return existing.trim() ? `${existing.trimEnd()}\n\n${generated}` : generated;
}

export * from './conflicts.js';
export * from './reports.js';
