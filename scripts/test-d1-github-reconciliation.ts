import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createD1Database, d1Schema, type TraceD1Database } from '@trace/db';
import { persistGitHubInstallationSnapshot } from '../apps/web/lib/github-installation.js';
import type { RequestDatabase } from '../apps/web/lib/request-database.js';

const migrationPath = new URL(
  '../packages/db/drizzle-d1/0000_cheerful_legion.sql',
  import.meta.url,
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function applyMigration(binding: D1Database) {
  const migration = await readFile(migrationPath, 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await binding.prepare(statement.trim()).run();
  }
}

function requestDatabase(db: TraceD1Database) {
  return db as unknown as RequestDatabase;
}

const user = {
  id: randomUUID(),
  name: 'TRACE Reconciliation Tester',
  email: 'reconciliation@example.test',
  image: null,
  githubLogin: 'trace-owner',
};

function snapshot(
  overrides: Partial<{
    id: number;
    accountLogin: string;
    accountType: string;
    suspendedAt: string | null;
  }> = {},
) {
  return {
    installation: {
      id: overrides.id ?? 7001,
      accountLogin: overrides.accountLogin ?? 'trace-org',
      accountType: overrides.accountType ?? 'Organization',
      suspendedAt: overrides.suspendedAt ?? null,
      permissions: { metadata: 'read' },
    },
    repositories: [
      {
        id: 8001,
        owner: 'trace-org',
        name: 'fixture',
        fullName: 'trace-org/fixture',
        defaultBranch: 'main',
        visibility: 'private',
        permissions: { metadata: 'read' },
      },
    ],
  };
}

async function main() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: `trace-github-reconciliation-${randomUUID()}` },
    }),
  );
  try {
    const binding = await miniflare.getD1Database('DB');
    await applyMigration(binding);
    const db = createD1Database(binding);
    await db.insert(d1Schema.users).values(user);

    const input = {
      db: requestDatabase(db),
      user,
      snapshot: snapshot(),
      action: 'github.reconciled' as const,
    };
    await persistGitHubInstallationSnapshot(input);
    const [installation] = await db
      .select()
      .from(d1Schema.githubInstallations)
      .where(eq(d1Schema.githubInstallations.githubInstallationId, '7001'));
    assert(
      installation?.state === 'active',
      'Pre-existing installation was not persisted as active',
    );
    const [relation] = await db
      .select()
      .from(d1Schema.githubInstallationRepositories)
      .where(eq(d1Schema.githubInstallationRepositories.githubRepositoryId, '8001'));
    assert(relation, 'Repository access relation was not created');

    await db
      .update(d1Schema.githubInstallationRepositories)
      .set({ selected: true })
      .where(eq(d1Schema.githubInstallationRepositories.id, relation.id));
    await persistGitHubInstallationSnapshot(input);
    const [selectedAfterRefresh] = await db
      .select({ selected: d1Schema.githubInstallationRepositories.selected })
      .from(d1Schema.githubInstallationRepositories)
      .where(eq(d1Schema.githubInstallationRepositories.githubRepositoryId, '8001'));
    assert(selectedAfterRefresh?.selected === true, 'Refresh reset repository selection');
    const installations = await db.select().from(d1Schema.githubInstallations);
    const repositories = await db.select().from(d1Schema.githubRepositories);
    assert(installations.length === 1, 'Repeated refresh created a duplicate installation');
    assert(repositories.length === 1, 'Repeated refresh created a duplicate repository');

    await expectFailure(
      persistGitHubInstallationSnapshot({
        db: requestDatabase(db),
        user,
        snapshot: snapshot({ accountLogin: 'other-org' }),
        action: 'github.reconciled',
      }),
      'Cross-workspace installation reassociation was accepted',
    );

    await persistGitHubInstallationSnapshot({
      db: requestDatabase(db),
      user,
      snapshot: snapshot({
        id: 7002,
        accountLogin: 'suspended-org',
        suspendedAt: '2026-09-20T00:00:00.000Z',
      }),
      action: 'github.reconciled',
    });
    const [suspended] = await db
      .select({ state: d1Schema.githubInstallations.state })
      .from(d1Schema.githubInstallations)
      .where(eq(d1Schema.githubInstallations.githubInstallationId, '7002'));
    assert(suspended?.state === 'suspended', 'Suspended installation was not fail-closed');

    console.log('D1 GitHub reconciliation checks passed.');
  } finally {
    await miniflare.dispose();
  }
}

async function expectFailure(operation: Promise<unknown>, message: string) {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(message);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
